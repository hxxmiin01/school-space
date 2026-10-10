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
    if (getSupabaseConfig()) {
      const config = getSupabaseConfig()
      const url = new URL(`${config.url}/rest/v1/reservations`)
      url.searchParams.set('id', `eq.${reservationId}`)
      url.searchParams.set('select', 'id,survey_done')

      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          apikey: config.key,
          Authorization: `Bearer ${config.key}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({ survey_done: surveyDone }),
      })

      if (!response.ok) {
        throw new Error(`Supabase reservation survey request failed: ${response.status}`)
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
          survey_done: rows[0].survey_done,
        },
      }
      return
    }

    client = createClient()
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
    if (client) {
      await client.end()
    }
  }
}