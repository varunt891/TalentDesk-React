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

function resolveEmail(name, domain, tag) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '')
  return `${base}.${tag}@${domain}`
}

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
  { first_name: 'Julia', last_name: 'Roberts', email: 'julia.roberts@gmail.com', job_title: 'Scrum Master', location: 'Atlanta, GA', skills: ['Agile', 'Jira', 'Kanban', 'Scrum'], experience: '5' },
  { first_name: 'Kevin', last_name: 'Bacon', email: 'kevin.bacon@gmail.com', job_title: 'Full Stack Engineer', location: 'Los Angeles, CA', skills: ['React', 'Node.js', 'MongoDB'], experience: '5' },
  { first_name: 'Laura', last_name: 'Palmer', email: 'laura.palmer@gmail.com', job_title: 'UX Researcher', location: 'Portland, OR', skills: ['User Testing', 'Wireframing', 'Figma'], experience: '4' },
  { first_name: 'Michael', last_name: 'Scott', email: 'michael.scott@dundermifflin.com', job_title: 'Engineering Manager', location: 'Scranton, PA', skills: ['Leadership', 'Management', 'Agile'], experience: '10' },
  { first_name: 'Nina', last_name: 'Sayers', email: 'nina.sayers@gmail.com', job_title: 'iOS Mobile Developer', location: 'New York, NY', skills: ['Swift', 'iOS', 'Xcode', 'UIKit'], experience: '4' },
  { first_name: 'Oscar', last_name: 'Martinez', email: 'oscar.martinez@gmail.com', job_title: 'FinTech Analyst', location: 'Philadelphia, PA', skills: ['SQL', 'Excel', 'Financial Modeling'], experience: '6' },
  { first_name: 'Pamela', last_name: 'Beesly', email: 'pamela.beesly@gmail.com', job_title: 'UI Frontend Developer', location: 'Scranton, PA', skills: ['HTML', 'CSS', 'Figma', 'React'], experience: '3' },
  { first_name: 'Quentin', last_name: 'Tarantino', email: 'quentin.tarantino@gmail.com', job_title: 'Video Pipeline Engineer', location: 'Hollywood, CA', skills: ['FFmpeg', 'C++', 'Python', 'Streaming'], experience: '8' },
  { first_name: 'Rachel', last_name: 'Green', email: 'rachel.green@gmail.com', job_title: 'Product Manager', location: 'New York, NY', skills: ['Roadmaps', 'Agile', 'Product Strategy'], experience: '5' },
  { first_name: 'Samuel', last_name: 'Jackson', email: 'samuel.jackson@gmail.com', job_title: 'Cyber Security Engineer', location: 'Washington, DC', skills: ['Network Security', 'Penetration Testing', 'Linux'], experience: '9' },
  { first_name: 'Tina', last_name: 'Fey', email: 'tina.fey@gmail.com', job_title: 'Content Strategist', location: 'Chicago, IL', skills: ['Copywriting', 'SEO', 'Content Marketing'], experience: '7' },
  { first_name: 'Uma', last_name: 'Thurman', email: 'uma.thurman@gmail.com', job_title: 'Frontend Specialist', location: 'Miami, FL', skills: ['Vue.js', 'JavaScript', 'CSS3', 'Tailwind'], experience: '5' },
  { first_name: 'Victor', last_name: 'Vance', email: 'victor.vance@gmail.com', job_title: 'Cloud Architect', location: 'Las Vegas, NV', skills: ['AWS', 'Terraform', 'Architecture', 'GCP'], experience: '9' },
  { first_name: 'Wendy', last_name: 'Byrde', email: 'wendy.byrde@gmail.com', job_title: 'Business Analyst', location: 'Ozark, MO', skills: ['Requirements Analysis', 'SQL', 'Tableau'], experience: '6' },
  { first_name: 'Xavier', last_name: 'Charles', email: 'xavier.charles@gmail.com', job_title: 'AI / Machine Learning Engineer', location: 'Cambridge, MA', skills: ['PyTorch', 'TensorFlow', 'Python', 'NLP'], experience: '7' },
  { first_name: 'Yennefer', last_name: 'Vengerberg', email: 'yennefer.vengerberg@gmail.com', job_title: 'Senior Database Admin', location: 'Seattle, WA', skills: ['PostgreSQL', 'Oracle', 'Performance Tuning'], experience: '8' },
  { first_name: 'Zachary', last_name: 'Levi', email: 'zachary.levi@gmail.com', job_title: 'Site Reliability Engineer', location: 'San Jose, CA', skills: ['Prometheus', 'Grafana', 'Kubernetes', 'Go'], experience: '6' },
  { first_name: 'Abigail', last_name: 'Marsh', email: 'abigail.marsh@gmail.com', job_title: 'Systems Infrastructure Engineer', location: 'Raleigh, NC', skills: ['Linux', 'Bash', 'Ansible', 'Networking'], experience: '5' },
  { first_name: 'Brian', last_name: 'Griffin', email: 'brian.griffin@gmail.com', job_title: 'Technical Recruiter', location: 'Providence, RI', skills: ['Talent Sourcing', 'Interviewing', 'ATS'], experience: '4' },
  { first_name: 'Clara', last_name: 'Oswald', email: 'clara.oswald@gmail.com', job_title: 'Cloud Security Specialist', location: 'Austin, TX', skills: ['IAM', 'Compliance', 'AWS Security', 'SIEM'], experience: '5' },
  { first_name: 'Daniel', last_name: 'LaRusso', email: 'daniel.larusso@gmail.com', job_title: 'Embedded Systems Developer', location: 'Reseda, CA', skills: ['C', 'C++', 'Microcontrollers', 'RTOS'], experience: '6' }
]

// Adds a fresh batch of demo profiles + candidates to whichever organization the admin panel
// currently has selected. Purely additive (no deletes) so it's safe to click repeatedly and never
// touches any other organization. Only a superadmin may target an org other than their own.
router.post('/seed-demo-profiles', async (req, res, next) => {
  try {
    const role = (req.memberRole || req.profile.role || '').toUpperCase()
    const isSuperAdmin = role === 'SUPERADMIN'
    const organizationId = (isSuperAdmin && req.body.organization_id) || req.organizationId
    if (!organizationId) return res.status(400).json({ error: 'No organization selected' })

    const org = await prisma.organization.findUnique({ where: { id: organizationId } })
    if (!org) return res.status(404).json({ error: 'Organization not found' })

    const domain = org.email_domain || org.domain || `${org.slug || 'org'}.demo.talentdesk.io`
    const runTag = Math.random().toString(36).slice(2, 8)
    const passwordHash = await bcrypt.hash('password123', 8)
    const randomExtension = () => String(1000 + Math.floor(Math.random() * 8999)).padStart(4, '0')

    let created = 0
    const newRecruiters = []

    // 1. Recruitment Managers (2)
    const hmName = getUniqueName(0)
    const hcManager = await prisma.profile.create({
      data: {
        org_id: organizationId,
        email: resolveEmail(hmName, domain, runTag),
        full_name: hmName,
        role: 'recruitment_manager',
        team: 'Healthcare Management',
        department: 'Healthcare',
        phone: '8005550101',
        extension: randomExtension(),
        passwordHash,
        is_active: true,
      }
    })
    created += 1

    const imName = getUniqueName(1)
    const itManager = await prisma.profile.create({
      data: {
        org_id: organizationId,
        email: resolveEmail(imName, domain, runTag),
        full_name: imName,
        role: 'recruitment_manager',
        team: 'IT Management',
        department: 'IT',
        phone: '8005550102',
        extension: randomExtension(),
        passwordHash,
        is_active: true,
      }
    })
    created += 1

    // 2. Account Managers (6)
    const accountManagers = []
    for (let i = 0; i < 3; i++) {
      const amName = getUniqueName(2 + i)
      const am = await prisma.profile.create({
        data: {
          org_id: organizationId,
          email: resolveEmail(amName, domain, runTag),
          full_name: amName,
          role: 'account_manager',
          team: `Healthcare AM Team ${i + 1}`,
          department: 'Healthcare',
          manager_id: hcManager.id,
          phone: '8005550110',
          extension: randomExtension(),
          passwordHash,
          is_active: true,
        }
      })
      accountManagers.push(am)
      created += 1
    }
    for (let i = 0; i < 3; i++) {
      const amName = getUniqueName(5 + i)
      const am = await prisma.profile.create({
        data: {
          org_id: organizationId,
          email: resolveEmail(amName, domain, runTag),
          full_name: amName,
          role: 'account_manager',
          team: `IT AM Team ${i + 1}`,
          department: 'IT',
          manager_id: itManager.id,
          phone: '8005550120',
          extension: randomExtension(),
          passwordHash,
          is_active: true,
        }
      })
      accountManagers.push(am)
      created += 1
    }

    // 3. Recruiters (60)
    for (let r = 0; r < 60; r++) {
      const amIdx = Math.floor(r / 10)
      const parentAM = accountManagers[amIdx]
      const recName = getUniqueName(8 + r)
      const recruiterProfile = await prisma.profile.create({
        data: {
          org_id: organizationId,
          email: resolveEmail(recName, domain, runTag),
          full_name: recName,
          role: 'recruiter',
          team: parentAM.team,
          department: parentAM.department,
          manager_id: parentAM.id,
          phone: '8005550200',
          extension: randomExtension(),
          passwordHash,
          is_active: true,
        }
      })
      newRecruiters.push({ recruiterId: recruiterProfile.id, recruiterName: recruiterProfile.full_name })
      created += 1
    }

    // 4. Supporting Departments (PMO, E-care, Onboarding, Helpdesk) - 3 profiles each
    const otherDepts = [
      { name: 'PMO', team: 'PMO Team', phone: '8005550300' },
      { name: 'E-care', team: 'Ecare Team', phone: '8005550400' },
      { name: 'Onboarding', team: 'HR Onboarding', phone: '8005550500' },
      { name: 'Helpdesk', team: 'Helpdesk Team', phone: '8005550600' }
    ]

    let deptOffset = 68
    for (const d of otherDepts) {
      const mgrName = getUniqueName(deptOffset)
      const manager = await prisma.profile.create({
        data: {
          org_id: organizationId,
          email: resolveEmail(mgrName, domain, runTag),
          full_name: mgrName,
          role: 'manager',
          team: d.team,
          department: d.name,
          phone: d.phone,
          extension: randomExtension(),
          passwordHash,
          is_active: true,
        }
      })
      created += 1

      for (let e = 0; e < 2; e++) {
        const empName = getUniqueName(deptOffset + 1 + e)
        await prisma.profile.create({
          data: {
            org_id: organizationId,
            email: resolveEmail(empName, domain, runTag),
            full_name: empName,
            role: 'employee',
            team: d.team,
            department: d.name,
            manager_id: manager.id,
            phone: d.phone,
            extension: randomExtension(),
            passwordHash,
            is_active: true,
          }
        })
        created += 1
      }
      deptOffset += 3
    }

    // Seed 10 demo candidates linked to the new recruiters (existing candidates are left untouched)
    let seededCandidatesCount = 0
    const candidateRecruiters = newRecruiters.slice(0, 10)
    for (let i = 0; i < candidateRecruiters.length; i++) {
      const template = candidatesTemplates[i % candidatesTemplates.length]
      const rec = candidateRecruiters[i]
      const candidateStatus = i < 2 ? 'Hired' : 'Submitted'

      await prisma.candidate.create({
        data: {
          org_id: organizationId,
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

    await prisma.activityLog.create({
      data: {
        org_id: organizationId,
        actor_id: req.user.id,
        actor_name: req.profile.full_name || req.user.email,
        action: 'seeded',
        entity: 'profiles',
        summary: `Seeded ${created} demo profiles and ${seededCandidatesCount} demo candidates for "${org.name}"`,
        details: { created, seededCandidatesCount },
      },
    })

    res.json({ data: { created, seededCandidatesCount } })
  } catch (err) {
    next(err)
  }
})

export default router
