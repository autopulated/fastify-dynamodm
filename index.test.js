const t = require('tap')
const fastifyDynamodm = require('./index.js')
const Fastify = require('fastify')
const DynamoDM = require('dynamodm')

const fastifyOptions = {
  logger: {
    level: 'error'
  }
}

const ddm = DynamoDM()

t.test('single table', async (t) => {
  t.plan(7)

  const server = await Fastify(fastifyOptions).register(fastifyDynamodm, {
    clientOptions: {
      endpoint: 'http://localhost:8000'
    },
    tableName: 'test-table-1'
  })

  server.get('/', () => { return 'ok' })

  t.ok(server.table())
  t.ok(server.table('test-table-1'))

  const table = server.table()
  t.ok(table.model(ddm.Schema('testSchema')), 'should be able to add schemas before sever.ready')

  await t.resolves(server.ready(), 'server.ready should succeed')
  t.after(server.close)

  t.ok(server.table('test-table-1'), 'accessing an existing table after server.ready should be ok')

  t.throws(() => {
    server.table('test-table-1b')
  }, { message: 'Request for unknown table "test-table-1b" after server was set up: all tables and models must be set up before server.listen.' }, 'should throw trying to access a new table after server.ready()')

  t.throws(() => {
    table.model(ddm.Schema('testSchema2'))
  }, { message: 'Table test-table-1 ready() has been called, so more schemas cannot be added now.' }, 'should not be able to add models after server.ready()')
})

t.test('multiple tables', async (t) => {
  t.plan(8)

  const server = await Fastify(fastifyOptions).register(fastifyDynamodm, {
    clientOptions: {
      endpoint: 'http://localhost:8000'
    }
  })

  t.ok(server.table('test-table-2a'))
  t.ok(server.table('test-table-2b'))

  t.ok(server.table('test-table-2a').model(ddm.Schema('testSchema')), 'add schemas before server.ready')
  t.ok(server.table('test-table-2b').model(ddm.Schema('testSchema')), 'add schemas before server.ready')

  await t.resolves(server.ready(), 'server.ready should succeed')
  t.after(server.close)

  t.ok(server.table('test-table-2a'), 'accessing an existing table after server.ready should be ok')

  t.throws(() => {
    server.table('test-table-2c')
  }, { message: 'Request for unknown table "test-table-2c" after server was set up: all tables and models must be set up before server.listen.' }, 'should throw trying to access a new table after server.ready()')

  t.throws(() => {
    server.table('test-table-2a').model(ddm.Schema('testSchema2'))
  }, { message: 'Table test-table-2a ready() has been called, so more schemas cannot be added now.' }, 'should not be able to add models after server.ready()')
})

t.test('assumeReady', async (t) => {
  t.plan(7)

  const server = await Fastify(fastifyOptions).register(fastifyDynamodm, {
    clientOptions: {
      endpoint: 'http://localhost:8000'
    },
    tableName: 'test-table-3',
    assumeReady: true
  })

  t.ok(server.table())
  t.ok(server.table('test-table-3'))

  const table = server.table()
  t.ok(table.model(ddm.Schema('testSchema')), 'should be able to add schemas before sever.ready')

  await t.resolves(server.ready(), 'server.ready should succeed')
  t.after(server.close)

  t.throws(() => {
    server.table('test-table-3b')
  }, { message: 'Request for unknown table "test-table-3b" after server was set up: all tables and models must be set up before server.listen.' }, 'should throw trying to access a new table after server.ready()')

  t.throws(() => {
    table.model(ddm.Schema('testSchema2'))
  }, { message: 'Table test-table-3 ready() has been called, so more schemas cannot be added now.' }, 'should not be able to add models after server.ready()')

  t.ok(server.table('test-table-3'), 'accessing an existing table after server.ready should be ok')
})

t.test('missing table name', async (t) => {
  t.plan(1)

  const server = await Fastify(fastifyOptions).register(fastifyDynamodm, {
    clientOptions: {
      endpoint: 'http://localhost:8000'
    }
  })

  server.get('/', () => { return 'ok' })

  t.throws(() => {
    server.table()
  }, { message: 'No default table was set up, so a table name must be specified. Pass options.tableName when registering this plugin to set up a default table.' }, 'should throw trying to access the default table if no tableName was specified in options')
})
