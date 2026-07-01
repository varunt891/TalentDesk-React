import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { prisma } from '../prisma.js'
import { clearSessionCookie, findTenantOrganization, requireAuth, setSessionCookie, signSession } from '../auth.js'

const router = Router()

async function ensureDefaultOrganization() {
  const existing = await prisma.organization.findFirst({ orderBy: { created_at: 'asc' } })
  if (existing) return existing

  return prisma.organization.create({
    data: {
      name: 'TalentDesk',
      slug: 'talentdesk',
      timezone: 'Asia/Calcutta',
    },
  })
}

function emailDomain(email) {
  return email.split('@')[1]?.toLowerCase() || null
}

function slugFromDomain(domain) {
  return domain?.split('.')[0]?.replace(/[^a-z0-9-]/g, '-') || 'workspace'
}

async function resolveSignupOrganization(req, normalizedEmail) {
  const tenantOrg = await findTenantOrganization(req)
  if (tenantOrg) return tenantOrg

  const domain = emailDomain(normalizedEmail)
  if (domain && !['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com'].includes(domain)) {
    const existing = await prisma.organization.findUnique({ where: { email_domain: domain } })
    if (existing) return existing

    const name = domain.split('.')[0]
    return prisma.organization.create({
      data: {
        name: name.charAt(0).toUpperCase() + name.slice(1),
        slug: slugFromDomain(domain),
        subdomain: slugFromDomain(domain),
        email_domain: domain,
        timezone: 'Asia/Calcutta',
      },
    })
  }

  return ensureDefaultOrganization()
}

router.get('/session', requireAuth, (req, res) => {
  res.json({ user: req.user, profile: req.profile })
})

router.post('/signup', async (req, res, next) => {
  try {
    const { email, password, full_name } = req.body
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' })
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' })

    const normalizedEmail = email.trim().toLowerCase()
    const existing = await prisma.profile.findUnique({ where: { email: normalizedEmail } })
    if (existing) return res.status(409).json({ error: 'Email is already registered' })

    const org = await resolveSignupOrganization(req, normalizedEmail)
    const count = await prisma.profile.count()
    const passwordHash = await bcrypt.hash(password, 12)
    const profile = await prisma.profile.create({
      data: {
        org_id: org.id,
        email: normalizedEmail,
        passwordHash,
        full_name,
        role: count === 0 ? 'superadmin' : 'recruiter',
      },
      include: { organization: true },
    })

    const user = { id: profile.id, email: profile.email }
    const token = signSession(user)
    setSessionCookie(res, token)
    res.status(201).json({
      user,
      token,
      profile: {
        ...profile,
        organizations: profile.organization,
        passwordHash: undefined,
        organization: undefined,
      },
    })
  } catch (err) {
    next(err)
  }
})

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body
    const profile = await prisma.profile.findUnique({
      where: { email: email?.trim().toLowerCase() || '' },
      include: { organization: true },
    })

    if (!profile?.passwordHash || !(await bcrypt.compare(password || '', profile.passwordHash))) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    if (profile.is_active === false) return res.status(403).json({ error: 'Account is inactive' })

    const user = { id: profile.id, email: profile.email }
    const token = signSession(user)
    setSessionCookie(res, token)
    res.json({
      user,
      token,
      profile: {
        ...profile,
        organizations: profile.organization,
        passwordHash: undefined,
        organization: undefined,
      },
    })
  } catch (err) {
    next(err)
  }
})

router.post('/logout', (_req, res) => {
  clearSessionCookie(res)
  res.json({ ok: true })
})

export default router
