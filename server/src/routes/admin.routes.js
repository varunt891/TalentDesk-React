import { Router } from 'express'
import { requireAdmin, requireAuth } from '../auth.js'
import { prisma } from '../prisma.js'
import bcrypt from 'bcryptjs'
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

const firstNames = [
  'James', 'Mary', 'John', 'Patricia', 'Robert', 'Jennifer', 'Michael', 'Linda', 'William', 'Elizabeth',
  'David', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Charles', 'Karen',
  'Christopher', 'Lisa', 'Daniel', 'Nancy', 'Matthew', 'Betty', 'Anthony', 'Sandra', 'Mark', 'Margaret',
  'Donald', 'Ashley', 'Steven', 'Kimberly', 'Paul', 'Emily', 'Andrew', 'Donna', 'Joshua', 'Michelle',
  'Kenneth', 'Carol', 'Kevin', 'Amanda', 'Brian', 'Dorothy', 'George', 'Melissa', 'Timothy', 'Deborah',
  'Ronald', 'Stephanie', 'Edward', 'Rebecca', 'Jason', 'Sharon', 'Jeffrey', 'Laura', 'Ryan', 'Cynthia',
  'Jacob', 'Kathleen', 'Gary', 'Amy', 'Nicholas', 'Angela', 'Eric', 'Shirley', 'Jonathan', 'Anna',
  'Stephen', 'Brenda', 'Larry', 'Pamela', 'Justin', 'Emma', 'Scott', 'Nicole', 'Brandon', 'Helen',
  'Benjamin', 'Samantha', 'Samuel', 'Katherine', 'Gregory', 'Christine', 'Alexander', 'Debra', 'Frank', 'Rachel',
  'Patrick', 'Carolyn', 'Raymond', 'Janet', 'Jack', 'Maria', 'Dennis', 'Heather', 'Jerry', 'Diane',
  'Tyler', 'Julie', 'Aaron', 'Joyce', 'Jose', 'Victoria', 'Adam', 'Kelly', 'Henry', 'Christina',
  'Nathan', 'Joan', 'Douglas', 'Evelyn', 'Zachary', 'Lauren', 'Peter', 'Julia', 'Kyle', 'Olivia'
]

const lastNames = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
  'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
  'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson',
  'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
  'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts',
  'Gomez', 'Phillips', 'Evans', 'Diaz', 'Howell', 'Murphy', 'Peterson', 'Gray', 'Ramsey', 'Watson',
  'Brooks', 'Kelly', 'Sanders', 'Price', 'Bennett', 'Wood', 'Barnes', 'Ross', 'Henderson', 'Coleman',
  'Jenkins', 'Perry', 'Powell', 'Patterson', 'Hughes', 'Floyd', 'Washington', 'Butler', 'Simmons', 'Foster',
  'Gonzales', 'Bryant', 'Alexander', 'Russell', 'Griffin', 'Hayes', 'Myers', 'Ford', 'Hamilton', 'Graham',
  'Sullivan', 'Wallace', 'Woods', 'Cole', 'West', 'Jordan', 'Owens', 'Reynolds', 'Fisher', 'Ellis',
  'Harrison', 'Gibson', 'Mcdonald', 'Cruz', 'Marshall', 'Ortiz', 'Gomez', 'Murray', 'Freeman', 'Wells',
  'Webb', 'Simpson', 'Stevens', 'Tucker', 'Porter', 'Hunter', 'Hicks', 'Crawford', 'Boyd', 'Mason'
]

function getUniqueName(index) {
  const f = firstNames[index % firstNames.length]
  const l = lastNames[(index * 7 + Math.floor(index / firstNames.length)) % lastNames.length]
  return `${f} ${l}`
}

function resolveEmail(name, domain) {
  return `${name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '')}@${domain}`
}

const orgDefinitions = [
  { name: 'TalentDesk', slug: 'talentdesk', domain: 'talentdesk.com' },
  { name: 'Outline', slug: 'outline', domain: 'outline.com' },
  { name: 'TSCTI', slug: 'tscti', domain: 'tscti.com' }
]

const candidatesTemplates = [
  { first_name: 'Alex', last_name: 'Rivera', email: 'alex.rivera@gmail.com', job_title: 'Senior React Developer', location: 'Seattle, WA', skills: ['React', 'TypeScript', 'Redux', 'CSS'], experience: '6' },
  { first_name: 'Beatrice', last_name: 'Vance', email: 'beatrice.vance@gmail.com', job_title: 'Product Designer', location: 'San Francisco, CA', skills: ['Figma', 'UI/UX', 'Prototyping', 'User Research'], experience: '4' },
  { first_name: 'Connor', last_name: 'McLeod', email: 'connor.mcleod@yahoo.com', job_title: 'DevOps Engineer', location: 'Boston, MA', skills: ['Docker', 'AWS', 'Kubernetes', 'CI/CD'], experience: '5' },
  { first_name: 'Diana', last_name: 'Prince', email: 'diana.prince@outlook.com', job_title: 'QA Lead', location: 'Chicago, IL', skills: ['Selenium', 'Automation', 'Jest', 'Cypress'], experience: '7' },
  { first_name: 'Evan', last_name: 'Wright', email: 'evan.wright@gmail.com', job_title: 'Solutions Architect', location: 'Austin, TX', skills: ['System Design', 'Cloud', 'Node.js', 'NoSQL'], experience: '8' },
  { first_name: 'Fiona', last_name: 'Gallagher', email: 'fiona.gallagher@hotmail.com', job_title: 'Backend Engineer', location: 'New York, NY', skills: ['Express', 'Node.js', 'PostgreSQL', 'Prisma'], experience: '3' },
  { first_name: 'George', last_name: 'Costanza', email: 'george.costanza@gmail.com', job_title: 'Junior Developer', location: 'Brooklyn, NY', skills: ['HTML', 'CSS', 'JavaScript'], experience: '1' },
  { first_name: 'Hannah', last_name: 'Abbott', email: 'hannah.abbott@gmail.com', job_title: 'Technical Writer', location: 'Denver, CO', skills: ['Documentation', 'Markdown', 'Git', 'API Docs'], experience: '2' },
  { first_name: 'Ian', last_name: 'Malcolm', email: 'ian.malcolm@yahoo.com', job_title: 'Data Scientist', location: 'San Diego, CA', skills: ['Python', 'Pandas', 'SQL', 'Machine Learning'], experience: '6' },
  { first_name: 'Julia', last_name: 'Roberts', email: 'julia.roberts@gmail.com', job_title: 'Scrum Master', location: 'Atlanta, GA', skills: ['Agile', 'Jira', 'Kanban', 'Scrum'], experience: '5' }
]

router.post('/seed-demo-profiles', async (req, res, next) => {
  try {
    let created = 0
    const passwordHash = await bcrypt.hash('password123', 8)

    // Ensure organizations exist and map their IDs
    const orgsMap = {}
    for (const def of orgDefinitions) {
      let org = await prisma.organization.findUnique({ where: { slug: def.slug } })
      if (!org) {
        org = await prisma.organization.create({
          data: {
            name: def.name,
            slug: def.slug,
            subdomain: def.slug,
            email_domain: def.domain,
            timezone: 'Asia/Calcutta',
          }
        })
      }
      orgsMap[def.slug] = org.id
    }

    // Delete all existing profiles except superadmin
    await prisma.profile.deleteMany({
      where: { role: { not: 'superadmin' } }
    })

    // Delete all candidates from the 3 orgs to prevent foreign key errors
    const targetOrgIds = Object.values(orgsMap)
    await prisma.candidate.deleteMany({
      where: { org_id: { in: targetOrgIds } }
    })

    // For each organization
    let orgIdx = 0
    const allNewRecruiters = []

    for (const def of orgDefinitions) {
      const orgId = orgsMap[def.slug]
      const baseIdx = orgIdx * 80

      // Create Admin Profile
      const adminEmail = `admin@${def.domain}`
      const adminName = `${def.name} Admin`
      await prisma.profile.create({
        data: {
          org_id: orgId,
          email: adminEmail,
          full_name: adminName,
          role: 'admin',
          team: 'Operations',
          department: 'Operations',
          phone: '8005550188',
          extension: '8888',
          passwordHash,
          is_active: true,
        }
      })
      created += 1

      // 1. Create Recruitment Managers (2)
      // Recruitment Manager (Healthcare)
      const hmName = getUniqueName(baseIdx)
      const hmEmail = resolveEmail(hmName, def.domain)
      const hcManager = await prisma.profile.create({
        data: {
          org_id: orgId,
          email: hmEmail,
          full_name: hmName,
          role: 'manager',
          team: 'Healthcare Management',
          department: 'Healthcare',
          phone: '8005550101',
          extension: String(1000 + baseIdx).padStart(4, '0'),
          passwordHash,
          is_active: true,
        }
      })
      created += 1

      // Recruitment Manager (IT)
      const imName = getUniqueName(baseIdx + 1)
      const imEmail = resolveEmail(imName, def.domain)
      const itManager = await prisma.profile.create({
        data: {
          org_id: orgId,
          email: imEmail,
          full_name: imName,
          role: 'manager',
          team: 'IT Management',
          department: 'IT',
          phone: '8005550102',
          extension: String(1000 + baseIdx + 1).padStart(4, '0'),
          passwordHash,
          is_active: true,
        }
      })
      created += 1

      // 2. Create Account Managers (6)
      const accountManagers = []
      // 3 under Healthcare Recruitment Manager
      for (let i = 0; i < 3; i++) {
        const amName = getUniqueName(baseIdx + 2 + i)
        const amEmail = resolveEmail(amName, def.domain)
        const am = await prisma.profile.create({
          data: {
            org_id: orgId,
            email: amEmail,
            full_name: amName,
            role: 'manager',
            team: `Healthcare AM Team ${i + 1}`,
            department: 'Healthcare',
            manager_id: hcManager.id,
            phone: '8005550110',
            extension: String(1000 + baseIdx + 2 + i).padStart(4, '0'),
            passwordHash,
            is_active: true,
          }
        })
        accountManagers.push(am)
        created += 1
      }

      // 3 under IT Recruitment Manager
      for (let i = 0; i < 3; i++) {
        const amName = getUniqueName(baseIdx + 5 + i)
        const amEmail = resolveEmail(amName, def.domain)
        const am = await prisma.profile.create({
          data: {
            org_id: orgId,
            email: amEmail,
            full_name: amName,
            role: 'manager',
            team: `IT AM Team ${i + 1}`,
            department: 'IT',
            manager_id: itManager.id,
            phone: '8005550120',
            extension: String(1000 + baseIdx + 5 + i).padStart(4, '0'),
            passwordHash,
            is_active: true,
          }
        })
        accountManagers.push(am)
        created += 1
      }

      // 3. Create Recruiters (60)
      for (let r = 0; r < 60; r++) {
        const amIdx = Math.floor(r / 10)
        const parentAM = accountManagers[amIdx]
        const recName = getUniqueName(baseIdx + 8 + r)
        const recEmail = r === 0 ? `recruiter@${def.domain}` : resolveEmail(recName, def.domain)

        const recruiterProfile = await prisma.profile.create({
          data: {
            org_id: orgId,
            email: recEmail,
            full_name: recName,
            role: 'recruiter',
            team: parentAM.team,
            department: parentAM.department,
            manager_id: parentAM.id,
            phone: '8005550200',
            extension: String(1000 + baseIdx + 8 + r).padStart(4, '0'),
            passwordHash,
            is_active: true,
          }
        })
        allNewRecruiters.push({
          orgKey: def.slug,
          orgId,
          recruiterId: recruiterProfile.id,
          recruiterName: recruiterProfile.full_name,
        })
        created += 1
      }

      // 4. Create Supporting Departments (PMO, E-care, Onboarding, Helpdesk) - 3 profiles each
      const otherDepts = [
        { name: 'PMO', team: 'PMO Team', phone: '8005550300' },
        { name: 'E-care', team: 'Ecare Team', phone: '8005550400' },
        { name: 'Onboarding', team: 'HR Onboarding', phone: '8005550500' },
        { name: 'Helpdesk', team: 'Helpdesk Team', phone: '8005550600' }
      ]

      let deptOffset = 68
      for (const d of otherDepts) {
        const mgrName = getUniqueName(baseIdx + deptOffset)
        const manager = await prisma.profile.create({
          data: {
            org_id: orgId,
            email: resolveEmail(mgrName, def.domain),
            full_name: mgrName,
            role: 'manager',
            team: d.team,
            department: d.name,
            phone: d.phone,
            extension: String(1000 + baseIdx + deptOffset).padStart(4, '0'),
            passwordHash,
            is_active: true,
          }
        })
        created += 1

        for (let e = 0; e < 2; e++) {
          const empName = getUniqueName(baseIdx + deptOffset + 1 + e)
          await prisma.profile.create({
            data: {
              org_id: orgId,
              email: resolveEmail(empName, def.domain),
              full_name: empName,
              role: 'employee',
              team: d.team,
              department: d.name,
              manager_id: manager.id,
              phone: d.phone,
              extension: String(1000 + baseIdx + deptOffset + 1 + e).padStart(4, '0'),
              passwordHash,
              is_active: true,
            }
          })
          created += 1
        }
        deptOffset += 3
      }

      orgIdx++
    }

    // Seed 10 candidates per organization (30 total) linked to new recruiters
    let seededCandidatesCount = 0
    for (const orgDef of orgDefinitions) {
      const orgId = orgsMap[orgDef.slug]
      const orgRecruiters = allNewRecruiters.filter(r => r.orgKey === orgDef.slug).slice(0, 10)

      for (let i = 0; i < 10; i++) {
        const template = candidatesTemplates[i]
        const rec = orgRecruiters[i]

        let candidateStatus = 'Submitted'
        if (orgDef.slug === 'talentdesk' && i < 3) {
          candidateStatus = 'Hired'
        }

        await prisma.candidate.create({
          data: {
            org_id: orgId,
            first_name: template.first_name,
            last_name: template.last_name,
            email: template.email,
            location: template.location,
            job_title: template.job_title,
            experience: template.experience,
            skills: template.skills,
            submission_date: new Date().toISOString().slice(0, 10),
            internal_status: candidateStatus,
            external_status: candidateStatus,
            recruiter_id: rec.recruiterId,
            recruiter_name: rec.recruiterName,
            user_id: rec.recruiterId,
          }
        })
        seededCandidatesCount += 1
      }
    }

    const logOrgId = req.profile.org_id || orgsMap['talentdesk']
    await prisma.activityLog.create({
      data: {
        org_id: logOrgId,
        actor_id: req.user.id,
        actor_name: req.profile.full_name || req.user.email,
        action: 'seeded',
        entity: 'profiles',
        summary: `Restructured and seeded ${created} profiles and ${seededCandidatesCount} fresh candidates`,
        details: { created, seededCandidatesCount },
      },
    })

    res.json({ data: { created, seededCandidatesCount } })
  } catch (err) {
    next(err)
  }
})

export default router
