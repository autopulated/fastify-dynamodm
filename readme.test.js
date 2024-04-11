const t = require('tap')

// mock aws dynamodb so createTable succeeds without auth:
const { mockClient } = require('aws-sdk-client-mock')
const { CreateTableCommand, DescribeTableCommand } = require('@aws-sdk/client-dynamodb')
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb')
const ddbMock = mockClient(DynamoDBDocumentClient)

t.plan(2)

t.beforeEach(() => {
  ddbMock.reset()
})

t.test('example 1', async (t) => {
  t.plan(1)
  // setup mock dynamodb:
  ddbMock.on(CreateTableCommand).resolves({ Table: { TableStatus: 'ACTIVE' } })
  ddbMock.on(DescribeTableCommand).resolves({
    Table: {
      TableStatus: 'ACTIVE',
      KeySchema: [
        { KeyType: 'HASH', AttributeName: 'id' }
      ]
    }
  })

  // ---- readme code begin ----
  const fastify = require('fastify')({ logger: true })

  await fastify.register(require('.'), { tableName: 'my-dynamodb-table' })

  // typically you would define your schemas in separate files:
  const { Schema } = require('dynamodm')()
  const MyUserSchema = Schema('user', {
    properties: {
      emailAddress: { type: 'string' },
      marketingComms: { type: 'boolean', default: false }
    }
  })

  // models should be registered in tables before .listen():
  const UserModel = fastify.table().model(MyUserSchema)

  fastify.get('/user/:id', async (req, reply) => {
    const user = await UserModel.getById(req.params.id)
    if (!user) {
      reply.code(404).send()
    } else {
      reply.type('application/json').code(200)
      return await user.toObject()
    }
  })

  fastify.listen({ port: 3000 }, err => {
    if (err) throw err
    console.log(`server listening on ${fastify.server.address().port}`)
  })
  // ---- readme code end ----

  // cleanup:
  await fastify.close()
  t.pass()
})

t.test('example 2', async (t) => {
  t.plan(1)
  // setup mock dynamodb:
  ddbMock.on(CreateTableCommand).resolves({ Table: { TableStatus: 'ACTIVE' } })
  ddbMock.on(DescribeTableCommand).resolves({
    Table: {
      TableStatus: 'ACTIVE',
      KeySchema: [
        { KeyType: 'HASH', AttributeName: 'id' }
      ]
    }
  })

  // ---- readme code begin ----
  const fastify = require('fastify')()

  await fastify.register(require('.'), { })

  // typically you would define your schemas in separate files:
  const dynamodm = require('dynamodm')()
  const MyUserSchema = dynamodm.Schema('user', {
    properties: {
      emailAddress: { type: 'string' },
      marketingComms: { type: 'boolean', default: false }
    }
  })

  const MyCommentSchema = dynamodm.Schema('comment', {
    properties: {
      text: { type: 'string' },
      user: dynamodm.DocId,
      createdAt: dynamodm.CreatedAtField
    }
  }, {
    // The schema also defines the indexes (GSI) that this model needs:
    index: {
      findByUser: {
        hashKey: 'user',
        sortKey: 'createdAt'
      }
    }
  })

  // models should be registered in tables before .listen():
  const UserModel = fastify.table('users').model(MyUserSchema)
  const CommentModel = fastify.table('comments').model(MyCommentSchema)

  fastify.get('/user/:id', async (req, reply) => {
    const user = await UserModel.getById(req.params.id)
    if (!user) {
      reply.code(404).send()
    } else {
      reply.type('application/json').code(200)
      return await user.toObject()
    }
  })
  fastify.get('/user/:id/comments', async (req, reply) => {
    const comments = CommentModel.queryMany({ user: req.params.id })
    reply.type('application/json').code(200)
    return await Promise.all(comments.map(c => c.toObject()))
  })

  fastify.listen({ port: 3000 }, err => {
    if (err) throw err
    console.log(`server listening on ${fastify.server.address().port}`)
  })
  // ---- readme code end ----

  // cleanup:
  await fastify.close()
  t.pass()
})
