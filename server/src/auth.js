import jwt from 'jsonwebtoken'
import { prisma } from './prisma.js'

const cookieName = 'td_session'
const isProduction = process.env.NODE_ENV === 'production'
const isSecureCookie = isProduction || process.env.COOKIE_SECURE === 'true'

const cookieBaseOptions = {
  httpOnly: true,
  secure: isSecureCookie,
  sameSite: isSecureCookie ? 'none' : 'lax',
  ...(isProduction ? { path: '/' } : {}),
}

export function signSession(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, purpose: 'session', tokenVersion: user.token_version ?? user.tokenVersion ?? 0 },
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
        { domain: key },
        { email_domain: key },
      ],
    },
  })
}

export function mapProfileRole(roleStr) {
  if (!roleStr) return 'RECRUITER'
  const r = roleStr.toUpperCase()
  if (['SUPERADMIN', 'ADMIN', 'OWNER', 'RECRUITMENT_MANAGER', 'ACCOUNT_MANAGER', 'RECRUITER', 'HR_MANAGER', 'HR_TEAM', 'OPERATIONS_MANAGER', 'MANAGER', 'EMPLOYEE', 'VIEWER'].includes(r)) {
    return r
  }
  if (roleStr === 'recruitment_manager') return 'RECRUITMENT_MANAGER'
  if (roleStr === 'account_manager') return 'ACCOUNT_MANAGER'
  if (roleStr === 'operations_manager') return 'OPERATIONS_MANAGER'
  if (roleStr === 'hr_manager') return 'HR_MANAGER'
  if (roleStr === 'hr_team') return 'HR_TEAM'
  return 'RECRUITER'
}

export async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || ''
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
    const token = bearerToken || req.cookies?.[cookieName]

    if (!token) {
      return res.status(401).json({ error: 'Not authenticated' })
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })
    // Legacy session tokens have no purpose but always have a tokenVersion.
    if ((payload.purpose && payload.purpose !== 'session') || !Number.isInteger(payload.tokenVersion)) return res.status(401).json({ error: 'Invalid session token' })

    const profile = await prisma.profile.findUnique({
      where: { id: payload.sub },
      include: {
        organization: true,
        memberships: {
          include: { organization: true },
        },
      },
    })

    if (!profile || profile.is_active === false) {
      return res.status(401).json({ error: 'Account is inactive or missing' })
    }

    const tokenVersionInJwt = payload.tokenVersion ?? 0
    const currentTokenVersion = profile.token_version ?? 0
    if (tokenVersionInJwt < currentTokenVersion) {
      return res.status(401).json({ error: 'Session revoked. Please log in again.' })
    }

    const tenantOrg = await findTenantOrganization(req)

    const isPlatformAdmin = mapProfileRole(profile.role) === 'SUPERADMIN'
    // Membership is the authority; profile.org_id only selects the workspace.
    let activeOrg = tenantOrg || profile.organization
    if (!activeOrg && profile.memberships?.length > 0) {
      activeOrg = profile.memberships.find(m => m.status === 'ACTIVE' && m.organization?.is_active !== false)?.organization
    }

    if (!activeOrg) {
      return res.status(400).json({ error: 'User does not belong to any organization' })
    }

    const activeMembership = profile.memberships.find(m => m.organization_id === activeOrg.id)
    if (!isPlatformAdmin && (!activeMembership || activeMembership.status !== 'ACTIVE' || activeOrg.is_active === false)) return res.status(403).json({ error: 'Active membership in this organization is required' })
    const memberRole = isPlatformAdmin ? 'SUPERADMIN' : activeMembership.role.toUpperCase()

    req.tenantOrg = tenantOrg
    req.organization = activeOrg
    req.organizationId = activeOrg.id
    req.membership = activeMembership
    req.memberRole = memberRole
    req.isPlatformAdmin = isPlatformAdmin

    req.user = {
      id: profile.id,
      email: profile.email,
    }

    req.profile = {
      ...profile,
      org_id: activeOrg.id,
      role: memberRole,
      is_platform_admin: isPlatformAdmin,
      organizations: activeOrg,
      passwordHash: undefined,
      organization: undefined,
      memberships: undefined,
    }

    next()
  } catch (err) {
    console.error('[requireAuth Error]', err.message)
    return res.status(401).json({ error: 'Invalid session' })
  }
}

export function requireAdmin(req, res, next) {
  const allowed = ['SUPERADMIN', 'ADMIN', 'OWNER', 'superadmin', 'admin', 'owner']
  if (!allowed.includes(req.memberRole) && !allowed.includes(req.profile?.role)) {
    return res.status(403).json({ error: 'Admin or Owner access required' })
  }

  next()
}

export function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    const roles = allowedRoles.map(r => r.toUpperCase())
    const current = (req.memberRole || req.profile?.role || '').toUpperCase()
    if (!roles.includes(current) && !['SUPERADMIN', 'OWNER'].includes(current)) {
      return res.status(403).json({ error: `Access denied. Required roles: ${allowedRoles.join(', ')}` })
    }
    next()
  }
}
