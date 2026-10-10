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
  const reservationId = Number(req.params?.id)
  const status = typeof req.body?.status === 'string' ? req.body.status.trim() : ''

  if (!Number.isInteger(reservationId)) {
    context.res = {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: '유효한 예약 ID가 필요합니다.' },
    }
    return
  }

  if (!status) {
    context.res = {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: 'status가 필요합니다.' },
    }
    return
  }

  try {
    if (getSupabaseConfig()) {
      const config = getSupabaseConfig()
      const url = new URL(`${config.url}/rest/v1/reservations`)
      url.searchParams.set('id', `eq.${reservationId}`)
      url.searchParams.set('select', 'id,status')

      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({ status }),
      })

      if (!response.ok) {
        throw new Error(`Supabase reservation status request failed: ${response.status}`)
      }

      const rows = await response.json()
      if (rows.length === 0) {
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
          id: rows[0].id,
          status: rows[0].status,
        },
      }
      return
    }

    client = createClient()
    await client.connect()

    const result = await client.query(
      `
      UPDATE reservations
      SET status = $1
      WHERE id = $2
      RETURNING id, status
      `,
      [status, reservationId]
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
        status: result.rows[0].status,
      },
    }
  } catch (error) {
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { error: error.message },
    }
  } finally {
    if (client) {
      await client.end()
    }
  }
}