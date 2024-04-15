import Fastify from 'fastify'
import app from './app.mjs'

const fastify = Fastify({
  logger: {
    level: 'info'
  }
})

const clientOptions = {}
if (process.argv.indexOf('--local-db') > 0) {
  clientOptions.endpoint = 'http://localhost:8000'
}

fastify.register(app, { clientOptions })

// start the server
fastify.listen({ port: process.env.PORT || 8080, host: process.env.LISTEN_HOST || '127.0.0.1' }, (err, address) => {
  if (err) throw err
  fastify.log.info({ msg: 'startup complete', address })
})
