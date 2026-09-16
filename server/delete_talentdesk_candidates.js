import { prisma } from './src/prisma.js'

async function removeTalentDeskCandidates() {
  console.log('🧹 Removing candidates for TalentDesk org...')

  // TalentDesk org ID from seed
  const ORG_ID = '4871af76-fa56-4069-af34-5f9ab4c0be10'

  // Also search by name if any org with 'talentdesk' exists
  const orgs = await prisma.organization.findMany({
    where: {
      OR: [
        { id: ORG_ID },
        { name: { contains: 'TalentDesk', mode: 'insensitive' } },
        { slug: { contains: 'talentdesk', mode: 'insensitive' } },
      ],
    },
  })

  const orgIds = orgs.map(o => o.id)
  if (!orgIds.includes(ORG_ID)) orgIds.push(ORG_ID)

  console.log('Target Organization IDs:', orgIds)

  // First clear submission_collisions for these orgs
  const deletedCollisions = await prisma.submissionCollision.deleteMany({
    where: {
      org_id: { in: orgIds },
    },
  })
  console.log(`Deleted ${deletedCollisions.count} submission collisions.`)

  // Next clear candidates for these orgs (or where org_id is null / matches)
  const deletedCandidates = await prisma.candidate.deleteMany({
    where: {
      OR: [
        { org_id: { in: orgIds } },
        { org_id: null }, // clean up unassigned demo candidates if any
      ],
    },
  })
  console.log(`Deleted ${deletedCandidates.count} candidates for TalentDesk org.`)

  console.log('✨ Clean up completed successfully!')
  process.exit(0)
}

removeTalentDeskCandidates().catch((err) => {
  console.error('❌ Deletion error:', err)
  process.exit(1)
})
