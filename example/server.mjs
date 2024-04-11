import Fastify from 'fastify'
import app from './app.mjs'

const fastify = Fastify({
  logger: {
    level: 'info'
  }
})

fastify.register(app)

// start the server
fastify.listen({ port: process.env.PORT || 8080, host: process.env.LISTEN_HOST || '127.0.0.1' }, (err, address) => {
  if (err) throw err
  fastify.log.info({ msg: 'startup complete', address })
})
