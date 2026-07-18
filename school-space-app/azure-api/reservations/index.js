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
  const userId = req.query.userId

  try {
    await client.connect()

    const params = []
    const whereClause = userId ? 'WHERE r.user_id = $1' : ''
    if (userId) {
      params.push(userId)
    }

    const result = await client.query(
      `
      SELECT
        r.id,
        r.room_id,
        r.user_id,
        r.date,
        r.start_time,
        r.end_time,
        r.members_count,
        r.purpose,
        r.status,
        COALESCE(r.survey_done, false) AS survey_done,
        ro.name AS room_name
      FROM reservations r
      JOIN rooms ro ON ro.id = r.room_id
      ${whereClause}
      ORDER BY r.date DESC, r.start_time DESC
      `,
      params
    )

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: result.rows.map((row) => ({
        ...row,
        rooms: { name: row.room_name },
      })),
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
