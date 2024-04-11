## fastify-dynamodm: Fastify plugin for DynamoDM

[![CI](https://github.com/autopulated/fastify-dynamodm/actions/workflows/test.yml/badge.svg)](https://github.com/autopulated/fastify-dynamodm/actions/workflows/test.yml)
[![Coverage Status](https://coveralls.io/repos/github/autopulated/fastify-dynamodm/badge.svg?branch=main)](https://coveralls.io/github/autopulated/fastify-dynamodm?branch=main)
[![NPM version](https://img.shields.io/npm/v/fastofy-dynamodm.svg?style=flat)](https://www.npmjs.com/package/fastify-dynamodm)

Fastify plugin for the dynamodm dynamo DB document mapper

## Install
```sh
npm -i fastify-dynamodm
```

## Usage

For a single-table-design application, specify `tableName` when registering the
plugin, and then `fastify.table()` will make available the dynamoDM Table handle:

```js
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
```


For an application with multiple tables, specify the table name when calling
`fastify.table(tableName)` to get the handle for the named table:

```js
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
```

## Examples
For a small example application, see ./example

