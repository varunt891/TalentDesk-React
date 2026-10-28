import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { once } from 'node:events'
import { createServer } from 'node:net'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import bcrypt from 'bcryptjs'

// Explicitly selected local workspace: never use DATABASE_URL from .env.
if (process.env.NODE_ENV === 'production') {
  throw new Error('dev:local is only available in development.')
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = resolve(root, '.talentdesk-local')
const children = new Set()
let db, socket, prisma
let stopping = false

async function stop(code = 0) {
  if (stopping) return
  stopping = true
  for (const child of children) child.kill()
  await Promise.all([...children].map(child => child.exitCode === null ? once(child, 'exit') : null))
  await prisma?.$disconnect()
  await socket?.stop()
  await db?.close()
  process.exit(code)
}

process.on('SIGINT', () => void stop())
process.on('SIGTERM', () => void stop())

function run(script, args, env, service = false) {
  const child = spawn(process.execPath, [resolve(root, script), ...args], {
    cwd: root, env, stdio: 'inherit', windowsHide: true,
  })
  children.add(child)
  return new Promise((resolveRun, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      children.delete(child)
      if (service && !stopping) void stop(code || 1)
      if (code === 0) resolveRun()
      else reject(new Error(`${script} exited (${signal || code}).`))
    })
  })
}

async function checkPort(port, host) {
  const probe = createServer()
  try {
    await new Promise((resolvePort, reject) => {
      probe.once('error', reject)
      probe.listen(port, host, resolvePort)
    })
  } catch (err) {
    if (err.code === 'EADDRINUSE') {
      throw new Error(`Port ${port} is already in use. If TalentDesk Local is already running, open http://localhost:5174. Otherwise stop the process using this port and run npm run dev:local again.`, { cause: err })
    }
    throw err
  } finally {
    if (probe.listening) await new Promise(resolveClose => probe.close(resolveClose))
  }
}

try {
  // Check before opening the database: two instances must not share its files.
  await checkPort(5174, 'localhost')
  await checkPort(4001, '127.0.0.1')
  await mkdir(dataDir, { recursive: true })
  const credentialsPath = resolve(dataDir, 'credentials.json')
  let credentials
  try {
    credentials = JSON.parse(await readFile(credentialsPath, 'utf8'))
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
    credentials = {
      email: 'local@talentdesk.test',
      password: randomBytes(12).toString('base64url'),
      jwtSecret: randomBytes(32).toString('hex'),
    }
    await writeFile(credentialsPath, JSON.stringify(credentials, null, 2), { mode: 0o600 })
  }

  db = await PGlite.create(resolve(dataDir, 'postgres'))
  socket = new PGLiteSocketServer({ db, host: '127.0.0.1', port: 0, maxConnections: 4 })
  await socket.start()
  const databaseUrl = `postgresql://postgres:postgres@${socket.getServerConn()}/postgres?connection_limit=1&sslmode=disable&pgbouncer=true`
  const env = {
    ...process.env,
    NODE_ENV: 'development',
    DATABASE_URL: databaseUrl,
    JWT_SECRET: credentials.jwtSecret,
    COOKIE_SECURE: 'false',
    HOST: '127.0.0.1',
    PORT: '4001',
    VITE_API_URL: '/api',
    VITE_DEV_PROXY_TARGET: 'http://127.0.0.1:4001',
    CLIENT_ORIGIN: 'http://localhost:5174',
  }

  const schema = await readFile(resolve(root, 'server/prisma/schema.prisma'), 'utf8')
  let generatedSchema = ''
  try {
    generatedSchema = await readFile(resolve(root, 'node_modules/.prisma/client/schema.prisma'), 'utf8')
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
  }
  // Reuse an up-to-date client: Windows locks its DLL while other APIs run.
  if (schema.replace(/\s+/g, '') !== generatedSchema.replace(/\s+/g, '')) {
    await run('node_modules/prisma/build/index.js', ['generate', '--schema', 'server/prisma/schema.prisma'], env)
  }

  // No reset or data-loss flags: incompatible schema changes require review.
  await run('node_modules/prisma/build/index.js', ['db', 'push', '--skip-generate', '--schema', 'server/prisma/schema.prisma'], env)

  const { PrismaClient } = await import('@prisma/client')
  prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } })
  const org = await prisma.organization.upsert({
    where: { slug: 'talentdesk-local' }, update: {},
    create: { name: 'TalentDesk Local', slug: 'talentdesk-local', timezone: 'Asia/Kolkata' },
  })
  const profile = await prisma.profile.upsert({
    where: { email: credentials.email }, update: {},
    create: {
      email: credentials.email, full_name: 'Local Owner', org_id: org.id,
      role: 'owner', passwordHash: await bcrypt.hash(credentials.password, 12),
    },
  })
  await prisma.organizationMember.upsert({
    where: { user_id_organization_id: { user_id: profile.id, organization_id: org.id } },
    update: {}, create: { user_id: profile.id, organization_id: org.id, role: 'OWNER' },
  })
  await prisma.$disconnect()
  await db.exec('DEALLOCATE ALL')

  console.log(`\nLocal workspace: http://localhost:5174\nEmail: ${credentials.email}\nPassword: ${credentials.password}\nCredentials: ${credentialsPath}\nData is stored locally and persists between restarts.\n`)
  await Promise.all([
    run('server/src/index.js', [], env, true),
    run('node_modules/vite/bin/vite.js', ['--host', 'localhost', '--port', '5174', '--strictPort'], env, true),
  ])
} catch (err) {
  console.error('Local workspace failed:', err.message)
  await stop(1)
}
