import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { neonConfig } from '@neondatabase/serverless'
import ws from 'ws'

neonConfig.webSocketConstructor = ws

const connectionString = process.env.DATABASE_URL
const hostname = connectionString ? new URL(connectionString).hostname : ''
const isLocalDatabase = ['localhost', '127.0.0.1', '[::1]'].includes(hostname)
const adapter = isLocalDatabase ? undefined : new PrismaNeon({ connectionString })

export const prisma = new PrismaClient(adapter ? { adapter } : {})
