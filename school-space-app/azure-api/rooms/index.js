const { Client } = require('pg')

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    return null
  }

  return { url: url.replace(/\/$/, ''), key }
}

module.exports = async function (context) {
  const connectionString = process.env.AZURE_POSTGRES_CONNECTION_STRING

  if (getSupabaseConfig()) {
    try {
      const config = getSupabaseConfig()
      const response = await fetch(`${config.url}/rest/v1/rooms?select=id,name,status&order=id.asc`, {
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
        },
      })

      if (!response.ok) {
        throw new Error(`Supabase rooms request failed: ${response.status}`)
      }

      context.res = {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: await response.json(),
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

  if (!connectionString) {
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: {
        error: 'AZURE_POSTGRES_CONNECTION_STRING 환경 변수(설정값)가 필요합니다.',
      },
    }
    return
  }

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } })

  try {
    await client.connect()
    const result = await client.query('SELECT id, name, status FROM rooms ORDER BY id ASC')

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: result.rows,
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
