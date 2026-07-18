import { Router } from 'express'
import { requireAdmin, requireAuth } from '../auth.js'
import { prisma } from '../prisma.js'

const router = Router()

router.use(requireAuth, requireAdmin)

router.post('/invite-user', async (req, res, next) => {
  try {
    const { email, role = 'recruiter', team = null, manager_id = null, department = null } = req.body
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
        details: { role, team, manager_id, department },
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
        details: { role, team, manager_id, department },
      },
    })

    res.status(201).json({ data: invitation })
  } catch (err) {
    next(err)
  }
})

const demoTeams = [
  {
    team: 'Front-End Team',
    department: 'Recruiting',
    manager: 'Tavish Raina',
    members: ['Harvinderpal Singh', 'Rohan Bakhru', 'Shriya Sharma', 'Simranjot Kaur', 'Saurabh Kumar', 'Divya Chauhan'],
  },
  {
    team: 'E-care Team',
    department: 'E-care',
    manager: 'Aditi Sharma',
    members: ['Ritika Bhardwaj', 'Puneet Sharma', 'Garima Mehra', 'Amrit Sharma', 'Harinderjeet Singh', 'Aksh Chaudhary'],
  },
  {
    team: 'PMO',
    department: 'PMO',
    manager: 'Rachit Bhardwaj',
    members: ['Aakriti Gandotra', 'Sakanddha Bharti', 'Mayank Bhardwaj', 'Nidhi Kapoor', 'Aman Verma'],
  },
  {
    team: 'Onboarding',
    department: 'Onboarding',
    manager: 'Neha Malhotra',
    members: ['Karan Gill', 'Priya Saini', 'Deepak Chawla', 'Isha Arora', 'Manav Sethi'],
  },
  {
    team: 'Healthcare Recruiting',
    department: 'Recruiting',
    manager: 'Rohan Sharma',
    members: ['Mehak Bedi', 'Jasleen Kaur', 'Arjun Nanda', 'Kabir Mehta', 'Tanya Grover', 'Vikram Rana'],
  },
  {
    team: 'Delivery Managers',
    department: 'Operations',
    manager: 'Tavleen Kaur',
    members: ['Gurpreet Sandhu', 'Ankita Rao', 'Rahul Bansal', 'Sneha Nair'],
  },
]

function demoEmail(name) {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '')}@demo.talentdesk.local`
}

function demoExtension(index) {
  return `x${String(2000 + index).padStart(4, '0')}`
}

router.post('/seed-demo-profiles', async (req, res, next) => {
  try {
    const orgId = req.profile.org_id
    let index = 1
    let created = 0

    for (const group of demoTeams) {
      const managerEmail = demoEmail(group.manager)
      let manager = await prisma.profile.findUnique({ where: { email: managerEmail } })

      if (!manager) {
        manager = await prisma.profile.create({
          data: {
            org_id: orgId,
            email: managerEmail,
            full_name: group.manager,
            role: group.team === 'Delivery Managers' ? 'admin' : 'manager',
            team: group.team,
            department: group.department,
            phone: '8044423151',
            extension: demoExtension(index++),
            is_active: true,
          },
        })
        created += 1
      }

      for (const memberName of group.members) {
        const email = demoEmail(memberName)
        const existing = await prisma.profile.findUnique({ where: { email } })
        if (existing) continue

        await prisma.profile.create({
          data: {
            org_id: orgId,
            email,
            full_name: memberName,
            role: group.department === 'Recruiting' ? 'recruiter' : 'employee',
            team: group.team,
            department: group.department,
            manager_id: manager.id,
            phone: '8044423151',
            extension: demoExtension(index++),
            is_active: true,
          },
        })
        created += 1
      }
    }

    await prisma.activityLog.create({
      data: {
        org_id: orgId,
        actor_id: req.user.id,
        actor_name: req.profile.full_name || req.user.email,
        action: 'seeded',
        entity: 'profiles',
        summary: `Seeded ${created} demo profiles`,
        details: { created },
      },
    })

    res.json({ data: { created } })
  } catch (err) {
    next(err)
  }
})

export default router
