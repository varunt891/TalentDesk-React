import 'dotenv/config'
import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import authRoutes from './routes/auth.routes.js'
import dataRoutes from './routes/data.routes.js'
import adminRoutes from './routes/admin.routes.js'
import aiRoutes from './routes/ai.routes.js'

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET is required')
}

const app = express()
const port = Number(process.env.PORT || 4000)
app.set('trust proxy', 1)

function envList(name) {
  return (process.env[name] || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
}

const configuredOrigins = [
  ...envList('CLIENT_ORIGIN'),
  ...envList('CLIENT_ORIGINS'),
  ...envList('FRONTEND_URL'),
  ...envList('FRONTEND_URLS'),
]

// Allow multiple origins for development and production deployments
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  'https://talent-desk-react.vercel.app',
  'https://talentdesk-react-production.up.railway.app',
  ...configuredOrigins,
]

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc) or any Vercel domain
    if (!origin || allowedOrigins.includes(origin) || /\.vercel\.app$/i.test(origin) || /\.onrender\.com$/i.test(origin)) {
      return callback(null, true)
    }
    return callback(null, true) // Permissive CORS to prevent cross-origin fetch failures
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}

app.use(cors(corsOptions))
app.use(express.json({ limit: '1mb' }))
app.use(cookieParser())

app.get('/api/health', (_req, res) => res.json({ ok: true }))
app.use('/api/auth', authRoutes)
app.use('/api/data', dataRoutes)
app.use('/api/admin', adminRoutes)
app.use('/api/ai', aiRoutes)

app.use((err, _req, res, _next) => {
  console.error(err)
  const status = err.status || 500
  res.status(status).json({ error: err.message || 'Server error' })
})

app.listen(port, () => {
  console.log(`TalentDesk API running on http://localhost:${port}`)
})
