import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

function mapProfileRole(existingRole) {
  if (!existingRole) return 'RECRUITER'
  const role = existingRole.toLowerCase()
  if (role === 'superadmin') return 'SUPERADMIN'
  if (role === 'admin') return 'ADMIN'
  if (role === 'owner') return 'OWNER'
  if (role === 'recruitment_manager') return 'RECRUITMENT_MANAGER'
  if (role === 'account_manager') return 'ACCOUNT_MANAGER'
  if (role === 'manager') return 'MANAGER'
  if (role === 'hr_manager') return 'HR_MANAGER'
  if (role === 'hr_team') return 'HR_TEAM'
  if (role === 'recruiter') return 'RECRUITER'
  if (role === 'employee' || role === 'viewer') return 'VIEWER'
  return role.toUpperCase()
}

async function runMigration() {
  console.log('🚀 Starting Multi-Tenant Data Migration...')

  const orgs = await prisma.organization.findMany()
  console.log(`Found ${orgs.length} organizations.`)

  let defaultOrg = orgs.find(o => o.slug === 'talentdesk') || orgs[0]
  if (!defaultOrg) {
    defaultOrg = await prisma.organization.create({
      data: {
        name: 'TalentDesk Staffing',
        slug: 'talentdesk',
        domain: 'talentdesk.com',
        website: 'https://talentdesk.com',
        subscription_plan: 'Enterprise',
        ai_credit_limit: 5000,
        candidate_limit: 2500,
      },
    })
  }

  for (const org of orgs) {
    const domain = org.domain || org.email_domain || `${org.slug || 'company'}.com`
    await prisma.organization.update({
      where: { id: org.id },
      data: {
        domain,
        website: org.website || `https://${domain}`,
        subscription_plan: org.subscription_plan || 'Growth',
        ai_credit_limit: org.ai_credit_limit || 1000,
        candidate_limit: org.candidate_limit || 500,
      },
    })
  }

  const profiles = await prisma.profile.findMany()
  console.log(`Found ${profiles.length} profiles to process.`)

  const memberData = profiles.map(p => ({
    user_id: p.id,
    organization_id: p.org_id || defaultOrg.id,
    role: mapProfileRole(p.role),
    status: 'ACTIVE',
  }))

  const created = await prisma.organizationMember.createMany({
    data: memberData,
    skipDuplicates: true,
  })
  console.log(`Batch inserted ${created.count} OrganizationMember records.`)

  await prisma.candidate.updateMany({
    where: { org_id: null },
    data: { org_id: defaultOrg.id },
  })

  await prisma.job.updateMany({
    where: { org_id: null },
    data: { org_id: defaultOrg.id },
  })

  console.log('✅ Multi-Tenant Data Migration Complete!')
}

runMigration()
  .catch(err => {
    console.error('❌ Migration failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
