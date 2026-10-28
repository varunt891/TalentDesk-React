import { prisma } from '../prisma.js'
import { assertRoleChange, forbidden, roleOf } from '../access.js'

export async function managedAccount(req, id) {
  const account = await prisma.profile.findFirst({
    where: { AND: [{ OR: [{ id }, { memberships: { some: { id } } }] }, ...(!req.isPlatformAdmin ? [{ memberships: { some: { organization_id: req.organizationId, status: 'ACTIVE' } } }] : [])] },
    include: { memberships: true },
  })
  if (!account) throw Object.assign(new Error('Member not found in this organization'), { status: 404 })
  const membership = account.memberships.find(m => m.organization_id === req.organizationId)
  assertRoleChange(req, account.role?.toUpperCase() === 'SUPERADMIN' ? 'SUPERADMIN' : membership?.role, membership?.role || account.role)
  // Passwords and profile token versions belong to the account, not one company.
  if (!req.isPlatformAdmin && account.id !== req.user.id && account.memberships.some(m => m.status === 'ACTIVE' && m.organization_id !== req.organizationId)) throw forbidden('A platform administrator must manage this multi-company account')
  return account
}

export async function updateMemberRole(req, userId, nextRole, client = prisma) {
  await client.$queryRaw`SELECT id FROM organizations WHERE id = ${req.organizationId}::uuid FOR UPDATE`
  const member = await client.organizationMember.findUnique({ where: { user_id_organization_id: { user_id: userId, organization_id: req.organizationId } }, include: { user: { select: { role: true } } } })
  if (!member || member.status === 'REVOKED') throw Object.assign(new Error('Member not found in this organization'), { status: 404 })
  const next = assertRoleChange(req, member.user.role?.toUpperCase() === 'SUPERADMIN' ? 'SUPERADMIN' : member.role, nextRole)
  if (member.role === 'OWNER' && next !== 'OWNER' && await client.organizationMember.count({ where: { organization_id: req.organizationId, role: 'OWNER', status: 'ACTIVE' } }) <= 1) throw forbidden('The company must retain an active Owner')
  const updated = await client.organizationMember.update({ where: { id: member.id }, data: { role: next } })
  if (req.isPlatformAdmin && (next === 'SUPERADMIN' || member.user.role?.toUpperCase() === 'SUPERADMIN')) await client.profile.update({ where: { id: userId }, data: { role: next.toLowerCase() } })
  return updated
}

export async function removeMember(req, member) {
  if (!req.isPlatformAdmin && roleOf(req) !== 'OWNER') throw forbidden('An Owner is required to remove members')
  if (member.user_id === req.user.id) throw forbidden('You cannot remove yourself from the organization')
  const target = await prisma.profile.findUnique({ where: { id: member.user_id }, select: { role: true } })
  assertRoleChange(req, target.role?.toUpperCase() === 'SUPERADMIN' ? 'SUPERADMIN' : member.role, 'RECRUITER')
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${req.organizationId}::uuid FOR UPDATE`
    const current = await tx.organizationMember.findUnique({ where: { id: member.id } })
    if (current?.role === 'OWNER' && current.status === 'ACTIVE' && await tx.organizationMember.count({ where: { organization_id: req.organizationId, role: 'OWNER', status: 'ACTIVE' } }) <= 1) throw forbidden('The company must retain an active Owner')
    await tx.organizationMember.update({ where: { id: member.id }, data: { status: 'REVOKED' } })
    const next = await tx.organizationMember.findFirst({ where: { user_id: member.user_id, status: 'ACTIVE', organization: { is_active: true } } })
    await tx.profile.updateMany({ where: { id: member.user_id, org_id: req.organizationId }, data: { org_id: next?.organization_id || null } })
  })
}
