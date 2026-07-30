import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { prisma } from '../prisma.js'
import { clearSessionCookie, findTenantOrganization, requireAuth, setSessionCookie, signSession, mapProfileRole } from '../auth.js'

const router = Router()

function slugify(text) {
  return (text || '')
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '') || 'company'
}

function emailDomain(email) {
  return email?.split('@')[1]?.toLowerCase() || null
}

router.get('/session', requireAuth, (req, res) => {
  res.json({
    user: req.user,
    profile: {
      ...req.profile,
      role: req.memberRole,
      organization: req.organization,
    },
    organization: req.organization,
    membership: req.membership,
  })
})

router.post('/signup', async (req, res, next) => {
  try {
    const { email, password, full_name, company, invite_token } = req.body
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' })
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' })

    const normalizedEmail = email.trim().toLowerCase()
    const existingProfile = await prisma.profile.findUnique({ where: { email: normalizedEmail } })
    if (existingProfile) return res.status(409).json({ error: 'Email is already registered' })

    let org
    let userRole = 'OWNER'

    // Case 1: Accepting Invitation Token
    if (invite_token) {
      const invite = await prisma.organizationInvitation.findUnique({
        where: { token: invite_token },
        include: { organization: true },
      })

      if (!invite || invite.status !== 'PENDING' || new Date(invite.expires_at) < new Date()) {
        return res.status(400).json({ error: 'Invalid or expired invitation token' })
      }

      org = invite.organization
      userRole = invite.role

      await prisma.organizationInvitation.update({
        where: { id: invite.id },
        data: { status: 'ACCEPTED' },
      })
    }
    // Case 2: Creating New Company Organization (Company Onboarding Flow)
    else if (company && company.name) {
      const compName = company.name.trim()
      const domain = company.domain ? company.domain.trim().toLowerCase() : emailDomain(normalizedEmail)
      const baseSlug = slugify(compName)
      let slug = baseSlug

      // Check existing slug conflict
      const existingSlug = await prisma.organization.findUnique({ where: { slug } })
      if (existingSlug) {
        slug = `${baseSlug}-${Math.floor(1000 + Math.random() * 9000)}`
      }

      org = await prisma.organization.create({
        data: {
          name: compName,
          slug,
          subdomain: slug,
          domain,
          email_domain: domain,
          website: company.website ? company.website.trim() : (domain ? `https://${domain}` : null),
          logo_url: company.logo_url || null,
          industry: company.industry || 'Staffing & Recruiting',
          subscription_plan: 'Growth',
          ai_credit_limit: 1000,
          candidate_limit: 500,
        },
      })
      userRole = 'OWNER'
    }
    // Case 3: Domain / Tenant Fallback
    else {
      const tenantOrg = await findTenantOrganization(req)
      if (tenantOrg) {
        org = tenantOrg
        userRole = 'RECRUITER'
      } else {
        const domain = emailDomain(normalizedEmail)
        const compName = domain && !['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'].includes(domain)
          ? domain.split('.')[0].toUpperCase()
          : 'My Staffing Agency'

        org = await prisma.organization.create({
          data: {
            name: compName,
            slug: slugify(compName) + '-' + Math.floor(1000 + Math.random() * 9000),
            domain,
            email_domain: domain,
            subscription_plan: 'Growth',
          },
        })
        userRole = 'OWNER'
      }
    }

    const passwordHash = await bcrypt.hash(password, 12)
    const profile = await prisma.profile.create({
      data: {
        org_id: org.id,
        email: normalizedEmail,
        passwordHash,
        full_name,
        role: userRole.toLowerCase(),
      },
    })

    // Create OrganizationMember relationship
    const member = await prisma.organizationMember.create({
      data: {
        user_id: profile.id,
        organization_id: org.id,
        role: userRole,
        status: 'ACTIVE',
      },
    })

    const user = { id: profile.id, email: profile.email }
    const token = signSession(user)
    setSessionCookie(res, token)

    res.status(201).json({
      user,
      token,
      profile: {
        ...profile,
        role: userRole,
        organization: org,
        passwordHash: undefined,
      },
      organization: org,
      membership: member,
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
      include: {
        organization: true,
        memberships: {
          include: { organization: true },
        },
      },
    })

    if (!profile?.passwordHash || !(await bcrypt.compare(password || '', profile.passwordHash))) {
      return res.status(401).json({ error: 'Invalid email or password' })
    }

    if (profile.is_active === false) return res.status(403).json({ error: 'Account is inactive' })

    const activeMembership = profile.memberships?.[0]
    const activeOrg = activeMembership?.organization || profile.organization
    const activeRole = activeMembership?.role || mapProfileRole(profile.role)

    const user = { id: profile.id, email: profile.email }
    const token = signSession(user)
    setSessionCookie(res, token)

    res.json({
      user,
      token,
      profile: {
        ...profile,
        role: activeRole,
        organization: activeOrg,
        passwordHash: undefined,
        memberships: undefined,
      },
      organization: activeOrg,
      membership: activeMembership,
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
