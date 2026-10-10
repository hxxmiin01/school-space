const { Client } = require('pg')

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    return null
  }

  return { url: url.replace(/\/$/, ''), key }
}

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
  let client = null
  const userId = req.query?.userId

  if (getSupabaseConfig()) {
    try {
      const config = getSupabaseConfig()
      const url = new URL(`${config.url}/rest/v1/reservations`)
      url.searchParams.set('select', 'id,room_id,user_id,date,start_time,end_time,members_count,purpose,status,survey_done,rooms(name)')
      if (userId) {
        url.searchParams.set('user_id', `eq.${userId}`)
      }
      url.searchParams.set('order', 'date.desc,start_time.desc')

      const response = await fetch(url, {
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
        },
      })

      if (!response.ok) {
        throw new Error(`Supabase reservations request failed: ${response.status}`)
      }

      const rows = await response.json()
      context.res = {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: rows.map((row) => ({
          ...row,
          survey_done: row.survey_done ?? false,
          rooms: { name: row.rooms?.name || null },
        })),
      }
    } catch (error) {
      context.res = {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
        body: { error: error.message },
      }
    }
    return
  }

  try {
    client = createClient()
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
