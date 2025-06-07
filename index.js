const fp = require('fastify-plugin')
const DynamoDM = require('dynamodm')

// The fastify-dynamodm plugin: decorate fastify with a .table() function which
// returns either the default, or a named, DynamoDM Table handle.
async function fastifyDynamoDM (fastify, options = {}) {
  const { tableName, assumeReady, waitForIndexes, ...otherOptions } = options
  const dynamoDM = DynamoDM({ logger: fastify.log, ...otherOptions })
  const knownTables = new Map()
  const defaultTableName = tableName
  let locked = false

  const getTable = function (name) {
    if (!name) {
      if (!defaultTableName) {
        throw new Error('No default table was set up, so a table name must be specified. Pass options.tableName when registering this plugin to set up a default table.')
      }
      name = defaultTableName
    }
    if (!knownTables.has(name)) {
      if (locked) {
        throw new Error(`Request for unknown table "${name}" after server was set up: all tables and models must be set up before server.listen.`)
      }
      knownTables.set(name, dynamoDM.Table(name))
    }
    return knownTables.get(name)
  }

  if (defaultTableName) {
    knownTables.set(defaultTableName, dynamoDM.Table(defaultTableName))
    // if we have a default table, set it up as soon as possible
    getTable(defaultTableName)
  }

  fastify.decorate('table', getTable)

  fastify.addHook('onReady', async () => {
    locked = true
    if (assumeReady) {
      [...knownTables.values()].forEach(table => table.assumeReady())
      fastify.log.info('tables assumed ready')
    } else {
      // if we haven't been told to assume tables are ready, wait for the
      // completion of all checks (indexes, all schemas in the table have
      // the same id field, createdAt, updatedAt fields, all sub-schemas
      // for the same property in different schemas are identical, etc.)
      await Promise.all([...knownTables.values()].map(table => table.ready({ waitForIndexes })))
      fastify.log.info('tables ready')
    }
  })

  fastify.addHook('onClose', async () => {
    await Promise.all([...knownTables.values()].map(table => table.destroyConnection()))
  })
}

module.exports = fp(fastifyDynamoDM, { fastify: '4.x || 5.x', name: 'dynamodm' })
module.exports.default = fastifyDynamoDM
module.exports.fastifyDynamoDM = fastifyDynamoDM
