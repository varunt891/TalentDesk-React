import jwt from 'jsonwebtoken'
import { prisma } from './prisma.js'

const cookieName = 'td_session'
const isProduction = process.env.NODE_ENV === 'production'
const isSecureCookie = isProduction || process.env.COOKIE_SECURE === 'true'

const cookieBaseOptions = {
  httpOnly: true,
  secure: isSecureCookie,
  sameSite: isSecureCookie ? 'none' : 'lax',
  // Don't set domain in development (localhost), but allow it to be cross-subdomain in production
  ...(isProduction ? { path: '/' } : {}),
}

export function signSession(user) {
  return jwt.sign(
    { sub: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  )
}

export function setSessionCookie(res, token) {
  res.cookie(cookieName, token, {
    ...cookieBaseOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })
}

export function clearSessionCookie(res) {
  res.clearCookie(cookieName, cookieBaseOptions)
}

export function getTenantKey(req) {
  const host = (req.headers['x-forwarded-host'] || req.headers.host || '')
    .split(':')[0]
    .toLowerCase()

  const firstPart = host.split('.')[0]

  if (!host || host === 'localhost' || host === '127.0.0.1' || firstPart === 'www') {
    return null
  }

  return firstPart
}

export async function findTenantOrganization(req) {
  const key = getTenantKey(req)

  if (!key) return null

  return prisma.organization.findFirst({
    where: {
      OR: [
        { slug: key },
        { subdomain: key },
        { email_domain: key },
      ],
    },
  })
}

export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || ''
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
    const token = req.cookies[cookieName] || bearerToken

    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' })
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET)

    const profile = await prisma.profile.findUnique({
      where: { id: payload.sub },
      include: { organization: true },
    })

    if (!profile || profile.is_active === false) {
      return res.status(401).json({ error: 'Account is inactive or missing' })
    }

    const tenantOrg = await findTenantOrganization(req)

    if (tenantOrg && profile.org_id !== tenantOrg.id) {
      return res.status(403).json({
        error: 'This account does not belong to this company workspace',
      })
    }

    req.user = {
      id: profile.id,
      email: profile.email,
    }

    req.profile = {
      ...profile,
      organizations: profile.organization,
      passwordHash: undefined,
      organization: undefined,
    }

    next()
  } catch {
    return res.status(401).json({ error: 'Invalid session' })
  }
}

export function requireAdmin(req, res, next) {
  if (!['admin', 'superadmin'].includes(req.profile?.role)) {
    return res.status(403).json({ error: 'Admin access required' })
  }

  next()
}
