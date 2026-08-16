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
  const roomId = typeof req.params?.id === 'string' ? req.params.id.trim() : ''
  const status = typeof req.body?.status === 'string' ? req.body.status.trim() : ''

  if (!roomId) {
    context.res = {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
      body: { error: '유효한 방 ID가 필요합니다.' },
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
    await client.connect()

    const result = await client.query(
      `
      UPDATE rooms
      SET status = $1
      WHERE id::text = $2 OR name = $3
      RETURNING id, name, status
      `,
      [status, roomId, roomId]
    )

    if (result.rowCount === 0) {
      context.res = {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
        body: { error: '방을 찾을 수 없어요.' },
      }
      return
    }

    context.res = {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: {
        success: true,
        id: result.rows[0].id,
        name: result.rows[0].name,
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
    await client.end()
  }
}