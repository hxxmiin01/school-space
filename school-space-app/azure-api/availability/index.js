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
  const { roomId, date, startTime, endTime } = req.query

  // 파라미터 검증
  if (!roomId || !date || !startTime || !endTime) {
    context.res = {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: {
        error: 'roomId, date, startTime, endTime are required.',
      },
    }
    return
  }

  try {
    await client.connect()

    // 해당 시간대에 겹치는 예약이 있는지 확인
    // 시간 겹침 조건: 기존 start_time < 새 endTime AND 기존 end_time > 새 startTime
    const result = await client.query(
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

    const conflictCount = parseInt(result.rows[0].conflict_count, 10)
    const available = conflictCount === 0

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        available,
        roomId: parseInt(roomId, 10),
        date,
        startTime,
        endTime,
        reason: available ? null : '해당 시간대는 이미 예약되어 있습니다.',
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
