import { Router } from 'express'
import { requireAdmin, requireAuth } from '../auth.js'
import { prisma } from '../prisma.js'

const router = Router()

router.use(requireAuth, requireAdmin)

router.post('/invite-user', async (req, res, next) => {
  try {
    const { email, role = 'recruiter', team = null, manager_id = null } = req.body
    if (!email?.trim()) return res.status(400).json({ error: 'Email is required' })

    const invitation = await prisma.userInvitation.create({
      data: {
        org_id: req.profile.org_id,
        email: email.trim().toLowerCase(),
        role,
        team,
        manager_id,
        invited_by: req.user.id,
      },
    })

    await prisma.adminAuditLog.create({
      data: {
        org_id: req.profile.org_id,
        actor_id: req.user.id,
        action: 'invite_created',
        target_email: invitation.email,
        details: { role, team, manager_id },
      },
    })

    await prisma.activityLog.create({
      data: {
        org_id: req.profile.org_id,
        actor_id: req.user.id,
        actor_name: req.profile.full_name || req.user.email,
        action: 'created',
        entity: 'user_invitations',
        entity_id: invitation.id,
        summary: `Invite created for ${invitation.email}`,
        details: { role, team, manager_id },
      },
    })

    res.status(201).json({ data: invitation })
  } catch (err) {
    next(err)
  }
})

export default router
