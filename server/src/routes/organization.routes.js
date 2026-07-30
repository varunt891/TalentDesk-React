import { Router } from 'express'
import crypto from 'crypto'
import { prisma } from '../prisma.js'
import { requireAuth, requireAdmin } from '../auth.js'

const router = Router()

// POST /api/organization/switch - Switch active organization workspace
router.post('/switch', requireAuth, async (req, res, next) => {
  try {
    const { organization_id } = req.body
    if (!organization_id) {
      return res.status(400).json({ error: 'organization_id is required' })
    }

    const targetOrg = await prisma.organization.findUnique({
      where: { id: organization_id },
    })

    if (!targetOrg) {
      return res.status(404).json({ error: 'Target organization not found' })
    }

    const isSuperAdmin = ['SUPERADMIN', 'superadmin'].includes(req.memberRole) || ['SUPERADMIN', 'superadmin'].includes(req.profile.role)

    let membership = await prisma.organizationMember.findFirst({
      where: { user_id: req.user.id, organization_id: targetOrg.id },
    })

    if (!membership && !isSuperAdmin) {
      return res.status(403).json({ error: 'You are not a member of this organization' })
    }

    if (!membership && isSuperAdmin) {
      membership = await prisma.organizationMember.create({
        data: {
          user_id: req.user.id,
          organization_id: targetOrg.id,
          role: 'SUPERADMIN',
          status: 'ACTIVE',
        },
      })
    }

    // Update active profile org_id
    const updatedProfile = await prisma.profile.update({
      where: { id: req.user.id },
      data: { org_id: targetOrg.id },
    })

    res.json({
      data: {
        profile: {
          ...updatedProfile,
          role: membership?.role || 'SUPERADMIN',
          organization: targetOrg,
          passwordHash: undefined,
        },
        organization: targetOrg,
        membership,
      },
    })
  } catch (err) {
    next(err)
  }
})

// GET /api/organization/all - List all platform organizations (Superadmin / Admin)
router.get('/all', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const orgs = await prisma.organization.findMany({
      include: {
        _count: {
          select: {
            members: true,
            candidates: true,
            jobs: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    })

    res.json({
      data: orgs.map(o => ({
        ...o,
        stats: {
          members: o._count.members,
          candidates: o._count.candidates,
          jobs: o._count.jobs,
        },
      })),
    })
  } catch (err) {
    next(err)
  }
})

function getFrontendClientOrigin(req) {
  const origin = req.headers.origin || req.headers.referer
  if (origin) {
    try {
      const u = new URL(origin)
      return `${u.protocol}//${u.host}`
    } catch { /* ignore */ }
  }
  return process.env.CLIENT_URL || 'http://localhost:5173'
}

// POST /api/organization/onboard - Superadmin Onboard New Organization
router.post('/onboard', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { name, domain, website, industry, subscription_plan = 'Growth', candidate_limit = 500, ai_credit_limit = 1000, owner_name, owner_email } = req.body

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Organization name is required' })
    }

    const cleanName = name.trim()
    const cleanDomain = domain ? domain.trim().toLowerCase() : null
    const slug = cleanName.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\-]+/g, '') + '-' + Math.floor(1000 + Math.random() * 9000)

    const org = await prisma.organization.create({
      data: {
        name: cleanName,
        slug,
        subdomain: slug,
        domain: cleanDomain,
        email_domain: cleanDomain,
        website: website ? website.trim() : (cleanDomain ? `https://${cleanDomain}` : null),
        industry: industry || 'Staffing & Recruiting',
        subscription_plan,
        candidate_limit: Number(candidate_limit),
        ai_credit_limit: Number(ai_credit_limit),
      },
    })

    let invitation = null
    let inviteUrl = null

    if (owner_email && owner_email.trim()) {
      const token = crypto.randomBytes(24).toString('hex')
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

      invitation = await prisma.organizationInvitation.create({
        data: {
          organization_id: org.id,
          email: owner_email.trim().toLowerCase(),
          role: 'OWNER',
          token,
          status: 'PENDING',
          expires_at: expiresAt,
        },
      })

      inviteUrl = `${getFrontendClientOrigin(req)}/signup?invite_token=${token}`
    }

    res.status(201).json({
      data: org,
      invitation,
      invite_url: inviteUrl,
    })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/organization/platform/:id - Cascade delete organization (Superadmin)
router.delete('/platform/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params
    if (!id) return res.status(400).json({ error: 'Organization ID is required' })

    if (id === req.organizationId) {
      return res.status(400).json({ error: 'Cannot delete your active organization workspace. Switch workspaces first.' })
    }

    const target = await prisma.organization.findUnique({ where: { id } })
    if (!target) return res.status(404).json({ error: 'Organization not found' })

    // Cascade deletion of dependent entities
    await prisma.organizationInvitation.deleteMany({ where: { organization_id: id } })
    await prisma.organizationMember.deleteMany({ where: { organization_id: id } })
    await prisma.candidate.deleteMany({ where: { org_id: id } })
    await prisma.job.deleteMany({ where: { org_id: id } })

    // Unlink any profile referencing this org_id
    await prisma.profile.updateMany({
      where: { org_id: id },
      data: { org_id: null },
    })

    // Delete organization record
    await prisma.organization.delete({ where: { id } })

    res.json({ message: `Organization "${target.name}" permanently deleted.` })
  } catch (err) {
    next(err)
  }
})

// POST /api/organization/platform/purge-members - Purge all members of target org
router.post('/platform/purge-members', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { organization_id } = req.body
    if (!organization_id) return res.status(400).json({ error: 'organization_id is required' })

    if (organization_id === req.organizationId) {
      return res.status(400).json({ error: 'Cannot purge members of active workspace. Use Team Management.' })
    }

    await prisma.organizationInvitation.deleteMany({ where: { organization_id } })
    await prisma.organizationMember.deleteMany({ where: { organization_id } })

    res.json({ message: 'All member memberships and invitations purged for organization.' })
  } catch (err) {
    next(err)
  }
})

// POST /api/organization/platform/purge-candidates - Purge all candidates of target org
router.post('/platform/purge-candidates', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { organization_id } = req.body
    if (!organization_id) return res.status(400).json({ error: 'organization_id is required' })

    const count = await prisma.candidate.deleteMany({ where: { org_id: organization_id } })

    res.json({ message: `Purged ${count.count} candidates for organization.` })
  } catch (err) {
    next(err)
  }
})

// GET /api/organization - Current company profile & stats
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.organizationId },
    })

    if (!org) {
      return res.status(404).json({ error: 'Organization not found' })
    }

    const memberCount = await prisma.organizationMember.count({
      where: { organization_id: req.organizationId, status: 'ACTIVE' },
    })
    const candidateCount = await prisma.candidate.count({
      where: { org_id: req.organizationId },
    })
    const jobCount = await prisma.job.count({
      where: { org_id: req.organizationId },
    })
    const pendingInvitesCount = await prisma.organizationInvitation.count({
      where: { organization_id: req.organizationId, status: 'PENDING' },
    })

    res.json({
      data: {
        ...org,
        stats: {
          members: memberCount,
          candidates: candidateCount,
          jobs: jobCount,
          pending_invites: pendingInvitesCount,
        },
      },
    })
  } catch (err) {
    next(err)
  }
})

// PUT /api/organization - Update company profile (Owner/Admin)
router.put('/', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { name, website, domain, logo_url, industry, company_size, primary_color, timezone, subscription_plan } = req.body

    let planData = {}
    if (subscription_plan) {
      if (subscription_plan === 'Starter') planData = { subscription_plan: 'Starter', candidate_limit: 250, ai_credit_limit: 250 }
      else if (subscription_plan === 'Growth') planData = { subscription_plan: 'Growth', candidate_limit: 500, ai_credit_limit: 1000 }
      else if (subscription_plan === 'Enterprise') planData = { subscription_plan: 'Enterprise', candidate_limit: 2500, ai_credit_limit: 5000 }
    }

    const updated = await prisma.organization.update({
      where: { id: req.organizationId },
      data: {
        ...(name !== undefined ? { name: name.trim() } : {}),
        ...(website !== undefined ? { website: website.trim() } : {}),
        ...(domain !== undefined ? { domain: domain.trim().toLowerCase() } : {}),
        ...(logo_url !== undefined ? { logo_url: logo_url.trim() } : {}),
        ...(industry !== undefined ? { industry: industry.trim() } : {}),
        ...(company_size !== undefined ? { company_size } : {}),
        ...(primary_color !== undefined ? { primary_color } : {}),
        ...(timezone !== undefined ? { timezone } : {}),
        ...planData,
      },
    })

    res.json({ data: updated })
  } catch (err) {
    next(err)
  }
})

// GET /api/organization/members - List team members
router.get('/members', requireAuth, async (req, res, next) => {
  try {
    const members = await prisma.organizationMember.findMany({
      where: { organization_id: req.organizationId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            full_name: true,
            phone: true,
            department: true,
            team: true,
            manager_id: true,
            is_active: true,
            created_at: true,
          },
        },
      },
      orderBy: { created_at: 'asc' },
    })

    res.json({
      data: members.map(m => ({
        id: m.id,
        user_id: m.user_id,
        organization_id: m.organization_id,
        role: m.role,
        status: m.status,
        created_at: m.created_at,
        email: m.user.email,
        full_name: m.user.full_name,
        phone: m.user.phone,
        department: m.user.department,
        team: m.user.team,
        manager_id: m.user.manager_id,
        is_active: m.user.is_active,
      })),
    })
  } catch (err) {
    next(err)
  }
})

// PUT /api/organization/members/:id/role - Update member role (Owner/Admin)
router.put('/members/:id/role', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { role } = req.body
    const allowedRoles = ['SUPERADMIN', 'ADMIN', 'OWNER', 'RECRUITER', 'RECRUITMENT_MANAGER', 'ACCOUNT_MANAGER', 'MANAGER', 'HR_MANAGER', 'HR_TEAM', 'VIEWER']

    const normalizedRole = (role || '').toUpperCase()
    if (!allowedRoles.includes(normalizedRole)) {
      return res.status(400).json({ error: `Invalid role. Allowed roles: ${allowedRoles.join(', ')}` })
    }

    const member = await prisma.organizationMember.findFirst({
      where: { id: req.params.id, organization_id: req.organizationId },
    })

    if (!member) {
      return res.status(404).json({ error: 'Team member not found in this organization' })
    }

    const updated = await prisma.organizationMember.update({
      where: { id: member.id },
      data: { role: normalizedRole },
    })

    // Sync profile role
    await prisma.profile.update({
      where: { id: member.user_id },
      data: { role: normalizedRole.toLowerCase() },
    })

    res.json({ data: updated })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/organization/members/:id - Remove member (Owner/Admin)
router.delete('/members/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const member = await prisma.organizationMember.findFirst({
      where: { id: req.params.id, organization_id: req.organizationId },
    })

    if (!member) {
      return res.status(404).json({ error: 'Team member not found' })
    }

    if (member.user_id === req.user.id) {
      return res.status(400).json({ error: 'You cannot remove yourself from the organization' })
    }

    await prisma.organizationMember.delete({ where: { id: member.id } })

    res.json({ data: null, message: 'Member removed successfully' })
  } catch (err) {
    next(err)
  }
})

// POST /api/organization/invitations - Send/Create team invitation
router.post('/invitations', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { email, role = 'RECRUITER' } = req.body
    if (!email || !email.trim()) {
      return res.status(400).json({ error: 'Email is required' })
    }

    const normalizedEmail = email.trim().toLowerCase()
    const allowedRoles = ['ADMIN', 'RECRUITER', 'RECRUITMENT_MANAGER', 'ACCOUNT_MANAGER', 'MANAGER', 'HR_MANAGER', 'HR_TEAM', 'VIEWER']
    const targetRole = role.toUpperCase()

    if (!allowedRoles.includes(targetRole)) {
      return res.status(400).json({ error: `Invalid role for invitation. Allowed: ${allowedRoles.join(', ')}` })
    }

    const existingMember = await prisma.organizationMember.findFirst({
      where: {
        organization_id: req.organizationId,
        user: { email: normalizedEmail },
      },
    })

    const org = await prisma.organization.findUnique({ where: { id: req.organizationId } })
    const memberCount = await prisma.organizationMember.count({ where: { organization_id: req.organizationId } })
    const plan = org?.subscription_plan || 'Growth'
    const maxSeats = plan === 'Starter' ? 3 : plan === 'Growth' ? 15 : 99999

    if (memberCount >= maxSeats) {
      return res.status(403).json({ error: `Seat limit reached for your ${plan} plan (${memberCount}/${maxSeats} seats). Please upgrade under Organization Settings.` })
    }

    if (existingMember) {
      return res.status(409).json({ error: 'User is already a member of this organization' })
    }

    const token = crypto.randomBytes(24).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    const invitation = await prisma.organizationInvitation.create({
      data: {
        organization_id: req.organizationId,
        email: normalizedEmail,
        role: targetRole,
        token,
        status: 'PENDING',
        expires_at: expiresAt,
      },
    })

    res.status(201).json({
      data: invitation,
      invite_url: `${getFrontendClientOrigin(req)}/signup?invite_token=${token}`,
    })
  } catch (err) {
    next(err)
  }
})

// GET /api/organization/invitations - List active pending invitations
router.get('/invitations', requireAuth, async (req, res, next) => {
  try {
    const invitations = await prisma.organizationInvitation.findMany({
      where: {
        organization_id: req.organizationId,
        status: 'PENDING',
      },
      orderBy: { created_at: 'desc' },
    })

    res.json({ data: invitations })
  } catch (err) {
    next(err)
  }
})

// DELETE /api/organization/invitations/:id - Revoke invitation
router.delete('/invitations/:id', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const invite = await prisma.organizationInvitation.findFirst({
      where: { id: req.params.id, organization_id: req.organizationId },
    })

    if (!invite) {
      return res.status(404).json({ error: 'Invitation not found' })
    }

    await prisma.organizationInvitation.delete({ where: { id: invite.id } })

    res.json({ data: null, message: 'Invitation revoked' })
  } catch (err) {
    next(err)
  }
})

// GET /api/organization/invitations/verify/:token - Check invitation token details
router.get('/invitations/verify/:token', async (req, res, next) => {
  try {
    const invite = await prisma.organizationInvitation.findUnique({
      where: { token: req.params.token },
      include: { organization: true },
    })

    if (!invite || invite.status !== 'PENDING' || new Date(invite.expires_at) < new Date()) {
      return res.status(404).json({ error: 'Invitation token is invalid or expired' })
    }

    res.json({
      data: {
        email: invite.email,
        role: invite.role,
        organization: {
          id: invite.organization.id,
          name: invite.organization.name,
          logo_url: invite.organization.logo_url,
        },
      },
    })
  } catch (err) {
    next(err)
  }
})

export default router
