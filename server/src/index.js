import 'dotenv/config'
import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import authRoutes from './routes/auth.routes.js'
import dataRoutes from './routes/data.routes.js'
import adminRoutes from './routes/admin.routes.js'

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is required')
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const app = express()
const port = Number(process.env.PORT || 4000)
const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5173'
const clientDistPath = path.resolve(__dirname, '../../dist')

app.use(cors({ origin: clientOrigin, credentials: true }))
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())

app.get('/api/health', (_req, res) => res.json({ ok: true }))
app.use('/api/auth', authRoutes)
app.use('/api/data', dataRoutes)
app.use('/api/admin', adminRoutes)

app.use(express.static(clientDistPath, { index: false }))

app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'))
})

app.use((err, _req, res, _next) => {
  console.error(err)
  const status = err.status || 500
  res.status(status).json({ error: err.message || 'Server error' })
})

app.listen(port, () => {
  console.log(`TalentDesk API running on http://localhost:${port}`)
})
