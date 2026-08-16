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
  const reservationId = Number(req.params?.id)
  const surveyDone = Boolean(req.body?.survey_done)

  if (!Number.isInteger(reservationId)) {
    context.res = {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: '유효한 예약 ID가 필요합니다.' },
    }
    return
  }

  try {
    await client.connect()

    const result = await client.query(
      `
      UPDATE reservations
      SET survey_done = $1
      WHERE id = $2
      RETURNING id, survey_done
      `,
      [surveyDone, reservationId]
    )

    if (result.rowCount === 0) {
      context.res = {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
        body: { error: '예약을 찾을 수 없어요.' },
      }
      return
    }

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        success: true,
        id: result.rows[0].id,
        survey_done: result.rows[0].survey_done,
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