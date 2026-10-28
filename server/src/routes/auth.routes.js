import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from '../prisma.js'
import { clearSessionCookie, findTenantOrganization, requireAuth, setSessionCookie, signSession, mapProfileRole } from '../auth.js'

import { managedAccount } from '../services/memberAccess.js'
import { verifyPasswordResetToken } from '../services/passwordReset.js'

const router = Router()

function slugify(text) {
  return (text || '')
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w-]+/g, '')
    .replace(/--+/g, '-')
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
    let invitationId = null

    // Case 1: Accepting Invitation Token
    if (invite_token) {
      const invite = await prisma.organizationInvitation.findUnique({
        where: { token: invite_token },
        include: { organization: true },
      })

      if (!invite || invite.status !== 'PENDING' || new Date(invite.expires_at) < new Date()) {
        return res.status(400).json({ error: 'Invalid or expired invitation token' })
      }

      if (invite.email.toLowerCase() !== normalizedEmail || invite.organization.is_active === false) return res.status(403).json({ error: 'This invitation cannot be used for this account' })
      org = invite.organization
      userRole = invite.role
      invitationId = invite.id


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
          candidate_limit: 15000,
        },
      })
      userRole = 'OWNER'
    }
    // Case 3: Domain / Tenant Fallback
    else {
      const tenantOrg = await findTenantOrganization(req)
      if (tenantOrg) {
        return res.status(403).json({ error: 'An invitation is required to join this company' })
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
    const { profile, member } = await prisma.$transaction(async tx => {
      if (invitationId) {
        const claimed = await tx.organizationInvitation.updateMany({ where: { id: invitationId, status: 'PENDING', expires_at: { gt: new Date() }, email: normalizedEmail }, data: { status: 'ACCEPTED' } })
        if (claimed.count !== 1) throw Object.assign(new Error('Invitation is invalid or already used'), { status: 400 })
      }
    const profile = await tx.profile.create({
      data: {
        org_id: org.id,
        email: normalizedEmail,
        passwordHash,
        full_name,
        role: userRole.toLowerCase(),
      },
    })

    // Create OrganizationMember relationship
    const member = await tx.organizationMember.create({
      data: {
        user_id: profile.id,
        organization_id: org.id,
        role: userRole,
        status: 'ACTIVE',
      },
    })
      return { profile, member }
    })

    const user = { id: profile.id, email: profile.email, token_version: profile.token_version }
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

    const tenant = await findTenantOrganization(req)
    const memberships = profile.memberships.filter(m => m.status === 'ACTIVE' && m.organization?.is_active !== false)
    const activeMembership = tenant ? memberships.find(m => m.organization_id === tenant.id) : memberships.find(m => m.organization_id === profile.org_id) || memberships[0]
    const activeOrg = activeMembership?.organization

    if (!activeOrg) {
      return res.status(403).json({ error: 'Your organization is no longer available. Please contact support.' })
    }

    const activeRole = mapProfileRole(profile.role) === 'SUPERADMIN' ? 'SUPERADMIN' : activeMembership.role
    if (profile.org_id !== activeOrg.id) await prisma.profile.update({ where: { id: profile.id }, data: { org_id: activeOrg.id } })

    const user = { id: profile.id, email: profile.email, token_version: profile.token_version }
    const token = signSession(user)
    setSessionCookie(res, token)

    res.json({
      user,
      token,
      profile: {
        ...profile,
        org_id: activeOrg.id,
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

// ── Revoke All Active Sessions for Current User ────────────────────────────
router.post('/revoke-all-sessions', requireAuth, async (req, res, next) => {
  try {
    await prisma.profile.update({
      where: { id: req.user.id },
      data: { token_version: { increment: 1 } },
    })
    clearSessionCookie(res)
    res.json({ ok: true, message: 'All active sessions across all devices have been logged out.' })
  } catch (err) {
    next(err)
  }
})

// ── Admin Force Logout Specific User ──────────────────────────────────────
router.post('/force-logout-user', requireAuth, async (req, res, next) => {
  try {
    const { memberId } = req.body
    if (!memberId) return res.status(400).json({ error: 'Member ID is required' })

    const callerRole = (req.memberRole || req.profile?.role || '').toUpperCase()
    if (!['OWNER', 'ADMIN', 'SUPERADMIN'].includes(callerRole)) {
      return res.status(403).json({ error: 'Permission denied. Only Admins and Owners can force log out users.' })
    }

    const targetProfile = await managedAccount(req, memberId)

    await prisma.profile.update({
      where: { id: targetProfile.id },
      data: { token_version: { increment: 1 } },
    })

    res.json({ ok: true, message: `All active sessions for ${targetProfile.email} have been revoked.` })
  } catch (err) {
    next(err)
  }
})

// ── Superadmin / Owner Force Logout ALL Users ─────────────────────────────
router.post('/force-logout-all-users', requireAuth, async (req, res, next) => {
  try {
    const callerRole = (req.memberRole || req.profile?.role || '').toUpperCase()
    if (!['OWNER', 'SUPERADMIN'].includes(callerRole)) {
      return res.status(403).json({ error: 'Permission denied. Only Owners and Superadmins can perform a global force logout.' })
    }

    await prisma.profile.updateMany({
      where: req.isPlatformAdmin ? {} : { memberships: { some: { organization_id: req.organizationId, status: 'ACTIVE' }, every: { OR: [{ organization_id: req.organizationId }, { status: { not: 'ACTIVE' } }] } } },
      data: { token_version: { increment: 1 } },
    })

    clearSessionCookie(res)
    res.json({ ok: true, message: 'Sessions for eligible company accounts have been revoked. Multi-company accounts require platform administration.' })
  } catch (err) {
    next(err)
  }
})

// ── Change Password (Authenticated User) ──────────────────────────────────
router.put('/change-password', requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' })
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' })
    }

    const profile = await prisma.profile.findUnique({
      where: { id: req.user.id }
    })

    if (!profile || !profile.passwordHash) {
      return res.status(404).json({ error: 'User profile not found' })
    }

    const isValidCurrent = await bcrypt.compare(currentPassword, profile.passwordHash)
    if (!isValidCurrent) {
      return res.status(400).json({ error: 'Current password is incorrect' })
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 12)
    await prisma.profile.update({
      where: { id: req.user.id },
      data: { passwordHash: newPasswordHash, token_version: { increment: 1 } }
    })

    res.json({ ok: true, message: 'Password updated successfully' })
  } catch (err) {
    next(err)
  }
})

// ── Request Forgot Password Reset Token (Public) ──────────────────────────
router.post('/forgot-password', async (req, res) => {
  if (typeof req.body.email !== 'string' || !req.body.email.trim()) return res.status(400).json({ error: 'Email is required' })
  // A mail delivery service is not configured in this application. Never
  // substitute a public reset secret for a verified recovery channel.
  return res.json({ ok: true, message: 'Contact your company administrator to recover your account.' })
})

// ── Reset Password with Token (Public) ────────────────────────────────────
router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, newPassword } = req.body
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' })
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' })
    }

    const subject = jwt.decode(token)?.sub
    const account = typeof subject === 'string' ? await prisma.profile.findUnique({ where: { id: subject } }) : null
    if (!account || account.is_active === false) return res.status(400).json({ error: 'Invalid or expired reset token' })
    try { verifyPasswordResetToken(token, account) } catch { return res.status(400).json({ error: 'Invalid or expired reset token' }) }
    const newPasswordHash = await bcrypt.hash(newPassword, 12)
    const changed = await prisma.profile.updateMany({ where: { id: account.id, passwordHash: account.passwordHash, token_version: account.token_version }, data: { passwordHash: newPasswordHash, token_version: { increment: 1 } } })
    if (changed.count !== 1) return res.status(400).json({ error: 'Reset token has already been used' })

    res.json({ ok: true, message: 'Password has been reset successfully. You can now log in.' })
  } catch (err) {
    next(err)
  }
})

// ── Admin Reset Member Password (Admin / Owner Only) ──────────────────────
router.post('/admin-reset-password', requireAuth, async (req, res, next) => {
  try {
    const { memberId, newPassword } = req.body
    if (!memberId || !newPassword) {
      return res.status(400).json({ error: 'Member ID and new password are required' })
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' })
    }

    // Check caller permission — Owner / Admin / Superadmin only (Recruitment Manager excluded)
    const callerRole = (req.memberRole || req.profile?.role || '').toUpperCase()
    if (!['OWNER', 'ADMIN', 'SUPERADMIN'].includes(callerRole)) {
      return res.status(403).json({ error: 'Permission denied. Only Admins and Owners can reset user passwords.' })
    }

    const targetProfile = await managedAccount(req, memberId)
    const newPasswordHash = await bcrypt.hash(newPassword, 12)

    await prisma.profile.update({
      where: { id: targetProfile.id },
      data: { passwordHash: newPasswordHash, token_version: { increment: 1 } }
    })

    res.json({ ok: true, message: `Password for ${targetProfile.email} has been updated.` })
  } catch (err) {
    next(err)
  }
})

export default router

