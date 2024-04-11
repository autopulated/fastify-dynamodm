import t from 'tap'
import app from './app.mjs'
import Fastify from 'fastify'

// use dynamodb-local for testing
const appOptions = {
  clientOptions: {
    endpoint: 'http://localhost:8000'
  }
}
const fastifyOptions = {
  logger: {
    level: 'error'
  }
}

t.test('GET /', async (t) => {
  const server = Fastify(fastifyOptions).register(app, appOptions)
  await server.ready()

  t.plan(3)

  const response = await server.inject({ method: 'GET', url: '/' })
  t.equal(response.statusCode, 200, 'status 200')
  t.ok(/Not logged in/m.exec(response.body), 'should return the not-logged-in index')
  t.ok(response.headers?.['set-cookie'].match(/sessionId=/), 'should set a session cookie')

  server.close()
})

t.test('GET 404', async (t) => {
  const server = Fastify(fastifyOptions).register(app, appOptions)
  await server.ready()

  t.plan(1)

  const response = await server.inject({ method: 'GET', url: '/nonexistent' })
  t.equal(response.statusCode, 404)

  server.close()
})

t.test('GET /login', async (t) => {
  const server = Fastify(fastifyOptions).register(app, appOptions)
  await server.ready()

  t.plan(3)

  const response = await server.inject({ method: 'GET', url: '/login' })
  t.equal(response.statusCode, 200, 'status 200')
  t.ok(/Email.*Password/s.exec(response.body), 'should return the login page')
  t.ok(response.headers?.['set-cookie'].match(/sessionId=/), 'should set a session cookie')

  server.close()
})

t.test('logged in requests', async (t) => {
  const server = Fastify(fastifyOptions).register(app, appOptions)
  await server.ready()
  t.after(server.close)

  t.plan(8)

  // login:
  const response = await server.inject({ method: 'POST', url: '/login', payload: 'email=test@example.com&password=123', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
  t.equal(response.statusCode, 200, 'status 200')
  t.ok(/Logged in as user[.]test@example.com/s.exec(response.body), 'should return the logged-in index')
  t.ok(response.headers?.['set-cookie'].match(/sessionId=/), 'should set a session cookie')

  const sessionCookie = response.cookies.find(x => x.name === 'sessionId')

  t.test('invalid password', async (t) => {
    t.plan(1)
    const response = await server.inject({ method: 'POST', url: '/login', payload: 'email=test@example.com&password=234', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
    t.equal(response.statusCode, 302, 'redirect to login')
  })

  t.test('missing password', async (t) => {
    t.plan(1)
    const response = await server.inject({ method: 'POST', url: '/login', payload: 'email=test@example.com', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
    t.equal(response.statusCode, 302, 'redirect to login')
  })

  t.test('correct password again', async (t) => {
    t.plan(1)
    const response = await server.inject({ method: 'POST', url: '/login', payload: 'email=test@example.com&password=123', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
    t.equal(response.statusCode, 200, 'redirect to login')
  })

  // test the logged-in API
  t.test('POST /api/1/comments', async (t) => {
    t.plan(2)
    const response = await server.inject({ method: 'POST', url: '/api/1/comments', body: { text: 'my comment' }, cookies: { sessionId: sessionCookie.value } })
    t.equal(response.statusCode, 200, 'status 200')
    t.match(response.json(), { text: 'my comment' })
  })

  t.test('GET /api/1/comments', async (t) => {
    t.plan(2)
    const response = await server.inject({ method: 'GET', url: '/api/1/comments', cookies: { sessionId: sessionCookie.value } })
    t.equal(response.statusCode, 200, 'status 200')
    t.pass()
  })
})

t.test('login logout', async (t) => {
  const server = Fastify(fastifyOptions).register(app, appOptions)
  await server.ready()
  t.after(server.close)

  t.plan(4)

  // login:
  const response = await server.inject({ method: 'POST', url: '/login', payload: 'email=testlogout@example.com&password=123', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
  t.equal(response.statusCode, 200, 'status 200')
  t.ok(/Logged in as user[.]testlogout@example.com/s.exec(response.body), 'should return the logged-in index')
  t.ok(response.headers?.['set-cookie'].match(/sessionId=/), 'should set a session cookie')

  const sessionCookie = response.cookies.find(x => x.name === 'sessionId')

  t.test('logout', async (t) => {
    t.plan(1)
    const response = await server.inject({ method: 'GET', url: '/logout', cookies: { sessionId: sessionCookie.value } })
    t.equal(response.statusCode, 302, 'redirect to /')
  })
})

t.test('non-authenticated requests', async (t) => {
  const server = Fastify(fastifyOptions).register(app, appOptions)
  await server.ready()
  t.after(server.close)

  t.plan(3)

  t.test('POST /api/1/comments', async (t) => {
    t.plan(1)
    const response = await server.inject({ method: 'POST', url: '/api/1/comments', body: { text: 'my comment' }, cookies: { sessionId: 'not valid' } })
    t.equal(response.statusCode, 401)
  })

  t.test('GET /api/1/comments', async (t) => {
    t.plan(1)
    const response = await server.inject({ method: 'GET', url: '/api/1/comments', cookies: { sessionId: 'not valid' } })
    t.equal(response.statusCode, 401)
  })

  t.test('logout', async (t) => {
    t.plan(1)
    const response = await server.inject({ method: 'GET', url: '/logout' })
    t.equal(response.statusCode, 302, 'redirect to /')
  })
})
