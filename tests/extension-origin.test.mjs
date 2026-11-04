import test from 'node:test'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import express from 'express'
import cors from 'cors'
import { isAllowedOrigin } from '../server/src/corsOrigin.js'
import { requireAuth } from '../server/src/auth.js'

test('extension origins work without allowing unrelated websites or malformed extension URLs', () => {
  const website = 'https://talent-desk-react.vercel.app'
  for (const origin of [undefined, website, 'chrome-extension://abcdefghijklmnopabcdefghijklmnop', 'chrome-extension://pppppppppppppppppppppppppppppppp']) {
    assert.equal(isAllowedOrigin(origin, [website]), true, `Expected origin allowed: ${origin}`)
  }
  for (const origin of ['https://unrelated.example', 'https://other-project.vercel.app', 'null', 'chrome-extension://short', 'chrome-extension://abcdefghijklmnopabcdefghijklmnop.evil.example', 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/path', 'chrome-extension://zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz']) {
    assert.equal(isAllowedOrigin(origin, [website]), false, `Expected origin denied: ${origin}`)
  }
})

test('Chrome extension preflight succeeds and protected requests still require authentication', async t => {
  const origin = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop'
  const app = express()
  app.use(cors({
    origin: (value, callback) => callback(isAllowedOrigin(value, ['https://talent-desk-react.vercel.app']) ? null : Object.assign(new Error('Origin is not allowed'), { status: 403 }), true),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  }))
  app.get('/api/health', (_req, res) => res.json({ ok: true }))
  app.get('/api/data/candidates', requireAuth, (_req, res) => res.json({ data: [] }))
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message }))
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening')
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)) })
  const base = `http://127.0.0.1:${server.address().port}`
  const preflight = await fetch(`${base}/api/data/candidates`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' } })
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('access-control-allow-origin'), origin)
  assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true')
  assert.match(preflight.headers.get('access-control-allow-headers'), /Authorization/)
  const health = await fetch(`${base}/api/health`, { headers: { Origin: origin } })
  assert.equal(health.status, 200)
  const denied = await fetch(`${base}/api/data/candidates`, { headers: { Origin: origin } })
  assert.equal(denied.status, 401)
  const foreign = await fetch(`${base}/api/health`, { headers: { Origin: 'https://unrelated.example' } })
  assert.equal(foreign.status, 403)
})
