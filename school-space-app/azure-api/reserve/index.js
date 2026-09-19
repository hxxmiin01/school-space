const { Client } = require('pg')

function createClient() {
  const connectionString = process.env.AZURE_POSTGRES_CONNECTION_STRING

  if (!connectionString) {
    throw new Error('AZURE_POSTGRES_CONNECTION_STRING is not set.')
  }

  return new Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  })
}

module.exports = async function (context, req) {
  const client = createClient()
  const { roomId, date, startTime, endTime, membersCount, purpose, userId } = req.body

  // 파라미터 검증
  if (!roomId || !date || !startTime || !endTime || !membersCount || !purpose || !userId) {
    context.res = {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: {
        error: 'roomId, date, startTime, endTime, membersCount, purpose, userId are required.',
      },
    }
    return
  }

  const isTimeFormat = (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value)
  if (!isTimeFormat(startTime) || !isTimeFormat(endTime) || startTime >= endTime || startTime < '08:00' || endTime > '22:00') {
    context.res = {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: {
        success: false,
        error: '예약 가능 시간은 오전 8시부터 오후 10시까지입니다.',
      },
    }
    return
  }

  const isDateFormat = /^\d{4}-\d{2}-\d{2}$/.test(date)
  const selectedDate = new Date(`${date}T00:00:00`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const latestDate = new Date(today)
  latestDate.setDate(latestDate.getDate() + 7)
  if (!isDateFormat || Number.isNaN(selectedDate.getTime()) || selectedDate < today || selectedDate > latestDate) {
    context.res = {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: {
        success: false,
        error: '예약은 오늘부터 일주일 이내 날짜만 가능합니다.',
      },
    }
    return
  }

  try {
    await client.connect()

    // 1. 해당 시간대에 겹치는 예약이 있는지 확인
    const availabilityResult = await client.query(
      `
      SELECT COUNT(*) as conflict_count
      FROM reservations
      WHERE room_id = $1
        AND date = $2
        AND status IN ('approved', 'pending')
        AND start_time < $4
        AND end_time > $3
      `,
      [roomId, date, startTime, endTime]
    )

    const conflictCount = parseInt(availabilityResult.rows[0].conflict_count, 10)
    if (conflictCount > 0) {
      context.res = {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
        body: {
          success: false,
          error: '해당 시간대는 이미 예약되어 있습니다.',
        },
      }
      return
    }

    // 2. 사용자의 패널티 확인 (누적 10점 이상이면 예약 불가)
    const penaltyResult = await client.query(
      `
      SELECT COALESCE(SUM(points), 0) as total_penalty
      FROM penalties
      WHERE user_id = $1
        AND DATE(created_at) > CURRENT_DATE - INTERVAL '7 days'
      `,
      [userId]
    )

    const totalPenalty = parseInt(penaltyResult.rows[0].total_penalty, 10)
    if (totalPenalty >= 10) {
      context.res = {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
        body: {
          success: false,
          error: '누적 패널티가 10점 이상이어서 1주일간 예약이 제한됩니다.',
          totalPenalty,
        },
      }
      return
    }

    // 3. 새 예약 생성
    const insertResult = await client.query(
      `
      INSERT INTO reservations (room_id, user_id, date, start_time, end_time, members_count, purpose, status, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW())
      RETURNING id
      `,
      [roomId, userId, date, startTime, endTime, membersCount, purpose]
    )

    const reservationId = insertResult.rows[0].id

    context.res = {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
      body: {
        success: true,
        reservationId,
        message: '예약이 생성되었습니다. 담당자의 승인을 기다려주세요.',
        reservation: {
          id: reservationId,
          roomId,
          userId,
          date,
          startTime,
          endTime,
          membersCount,
          purpose,
          status: 'pending',
        },
      },
    }
  } catch (error) {
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: error.message },
    }
  } finally {
    await client.end()
  }
}
