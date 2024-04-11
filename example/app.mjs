import { scrypt, randomBytes, timingSafeEqual } from 'crypto'

// The User model needed by page routes:
// (note that we can import dynamodm directly to create schemas, there is no
// dependency on fastify-dynamodm for the schemas)
import DynamoDM from 'dynamodm'
import { promisify } from 'util'

// the app is a plugin for easy testing.
async function appPlugin (fastify, options) {
  // set up the db with fastify-dynamodb.
  // 'clientOptions' are forwarded, so that testing can use
  // clientOptions.endpoint = 'http://localhost:8000' for dynamodb-local
  await fastify.register(import('fastify-dynamodm'), { tableName: 'my-app-table', logger: fastify.log, clientOptions: options?.clientOptions })

  // Load various useful plugins:
  // helmet interferes with simple operation on localhost in its default config
  // (upgrade-insecure-requests breaks login link, and csp is preventing form
  // post)
  // fastify.register(import('@fastify/helmet'))
  await fastify.register(import('@fastify/rate-limit'), {
    global: false, // just on specific routes
    addHeaders: false,
    addHeadersOnExceeding: false,
    allowList: ['127.0.0.1'] // this allows tests to exceed the rate limit
  })
  // using a unique secret for each server startup, this would need to be shared across a cluster of servers:
  fastify.register(import('@fastify/cookie'), { hook: 'onRequest', parseOptions: {} })
  fastify.register(import('@fastify/session'), { secret: randomBytes(40).toString('hex'), cookie: { secure: 'auto' } })
  fastify.register(import('@fastify/formbody'))
  fastify.register(import('@fastify/view'), { engine: { ejs: await import('ejs') } })

  // low rate limit for 404, which is likely just bots.
  fastify.setNotFoundHandler({
    preHandler: fastify.rateLimit({ max: 10, timeWindow: '60 minutes' })
  }, async (request, reply) => {
    return reply.code(404).send({ message: `Route ${request.method}:${request.originalUrl} not found`, error: 'Not Found', statusCode: 404 })
  })

  fastify.setErrorHandler(async (err, request, reply) => {
    if (err.statusCode) {
      if (err.statusCode >= 500) {
        request.log.error(err)
      }
      return reply.status(err.statusCode).send({ error: err.statusCode })
    } else {
      request.log.error(err)
      return reply.status(500).send({ error: 500 })
    }
  })

  // User Schema:
  const ddm = DynamoDM({ logger: fastify.log })
  const UserSchema = ddm.Schema('user', {
    properties: {
      denormalisedEmail: { type: 'string' },
      pwHash: { type: 'string' },
      pwSalt: { type: 'string' },
      createdAt: ddm.CreatedAtField,
      updatedAt: ddm.UpdatedAtField
    },
    required: ['denormalisedEmail', 'pwHash']
  }, {
    // generate the ID from a normalised (lowercase, leading and trailing
    // whitespace trimmed) version of the email address.  This lets us quickly
    // look up users by email address without needing a separate index.
    generateId: (props, options) => {
      return `user.${props.denormalisedEmail.trim().toLowerCase()}`
    }
  })

  UserSchema.statics.getByEmail = async function (email) {
    return await this.getById(`user.${email.trim().toLowerCase()}`)
  }

  // instantiate the User Schema in the default table.
  const UserModel = fastify.table().model(UserSchema)

  // Page routes:
  fastify.get('/login', async (request, reply) => {
    return reply.view('pages/login.ejs')
  })

  fastify.get('/', async (request, reply) => {
    return reply.view('pages/index.ejs', { user: request.session.user, newUser: false })
  })
  const scryptAsync = promisify(scrypt)

  const hashPassword = async (pw, salt) => {
    if (!salt) {
      salt = randomBytes(20).toString('hex')
    }
    const hash = (await scryptAsync(pw, salt, 64)).toString('hex')
    return { hash, salt }
  }
  const comparePassword = async (pw, { hash, salt }) => {
    if (!(hash && salt && pw && (typeof pw === 'string') && (typeof hash === 'string') && (typeof salt === 'string'))) {
      return false
    }
    const hash2 = (await hashPassword(pw, salt)).hash
    return timingSafeEqual(Buffer.from(hash2, 'hex'), Buffer.from(hash, 'hex'))
  }

  // a form-POST /login route:
  fastify.post('/login', {
    // strict rate limit for login route
    preHandler: fastify.rateLimit({ max: 4, timeWindow: '60 minutes' })
  }, async (request, reply) => {
    const { email, password } = request.body

    // check if we have a user with this email.
    const user = await UserModel.getByEmail(email)
    if (user) {
      if ((await comparePassword(password, { hash: user.pwHash, salt: user.pwSalt })) === true) {
        request.session.authenticated = true
        request.session.user = user.id

        return reply.view('pages/index.ejs', { user: request.session.user, newUser: false })
      } else {
        return reply.redirect('/login')
      }
    } else {
      // if no user exists, create a new user with the provided password (in
      // the real world it would be better to ask if they want to create an
      // account first, and to verify the email address):
      const { hash, salt } = await hashPassword(password)
      const newUser = new UserModel({
        denormalisedEmail: email,
        pwHash: hash,
        pwSalt: salt
      })
      await newUser.save()

      request.session.authenticated = true
      request.session.user = newUser.id
      request.session.newUser = true
      return reply.view('pages/index.ejs', { user: request.session.user, newUser: true })
    }
  })

  // a GET /logout route:
  fastify.get('/logout', async (request, reply) => {
    if (request.session.authenticated) {
      request.session.destroy((err) => {
        if (err) {
          reply.status(500)
          return reply.send('Internal Server Error')
        } else {
          return reply.redirect('/')
        }
      })
    } else {
      return reply.redirect('/')
    }
  })

  // Plugin for the comments API with prefix /api/1/comments
  fastify.register(async function (fastify) {
    const CommentSchema = ddm.Schema('comment', {
      properties: {
        text: { type: 'string' },
        owner: ddm.DocId,
        createdAt: ddm.CreatedAtField
      },
      required: ['owner']
    }, {
      // index to get the comments for a user, sorted by time:
      index: {
        commentsIndex: {
          hashKey: 'owner',
          sortKey: 'createdAt'
        }
      }
    })
    const Comment = fastify.table().model(CommentSchema)

    // check all requests to the comments API are authenticated:
    fastify.addHook('preHandler', async (request, reply) => {
      if (!request.session.authenticated) {
        reply.status(401)
        return reply.send('Not authenticated.')
      }
    })

    fastify.get('/', async function getComments (request, reply) {
      const myComments = await Comment.queryMany({ owner: request.session.user })
      // convert all the comments to plain objects, and return them:
      const response = await Promise.all(myComments.map(c => c.toObject()))
      reply.type('application/json').code(200)
      return response
    })

    fastify.post('/', async function postComment (request, reply) {
      const comment = new Comment({
        text: request.body.text,
        owner: request.session.user
      })
      await comment.save()
      reply.type('application/json').code(200)
      return await comment.toObject()
    })

    return fastify
  }, { prefix: '/api/1/comments' })

  return fastify
}

export { appPlugin as default }
