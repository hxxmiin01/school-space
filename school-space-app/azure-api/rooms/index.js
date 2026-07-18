const { Client } = require('pg')

module.exports = async function (context) {
  const connectionString = process.env.AZURE_POSTGRES_CONNECTION_STRING

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
