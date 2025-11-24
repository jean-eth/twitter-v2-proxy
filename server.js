const fastify = require('fastify')({ logger: true });
const vercelHandler = require('./api/index.js');

function createRequestAdapter(request) {
  return {
    method: request.method,
    url: request.raw.url || request.url,
    query: request.query,
    headers: request.headers,
    body: request.body
  };
}

function createResponseAdapter(reply) {
  let sent = false;

  return {
    status(code) {
      if (!sent) {
        reply.status(code);
      }
      return this;
    },
    setHeader(name, value) {
      if (!sent) {
        reply.header(name, value);
      }
      return this;
    },
    json(payload) {
      if (!sent) {
        sent = true;
        reply.send(payload);
      }
      return this;
    },
    end(payload) {
      if (!sent) {
        sent = true;
        reply.send(payload ?? null);
      }
      return this;
    }
  };
}

fastify.all('*', async (request, reply) => {
  const req = createRequestAdapter(request);
  const res = createResponseAdapter(reply);

  try {
    await vercelHandler(req, res);
  } catch (error) {
    request.log.error(error);
    if (!reply.sent) {
      reply
        .status(500)
        .send({
          errors: [{
            detail: error.message || 'Internal Server Error',
            status: 500,
            title: 'Internal Server Error',
            type: 'https://api.twitter.com/2/problems/internal-error'
          }]
        });
    }
  }
});

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3003;
    const host = process.env.HOST || '0.0.0.0';
    await fastify.listen({ port, host });
    fastify.log.info(`Twitter v2 Proxy listening on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
