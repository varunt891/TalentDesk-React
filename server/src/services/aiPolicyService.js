import { prisma } from '../prisma.js'
import { DEFAULT_AI_POLICY, mergeAiPolicy } from '../../../shared/aiPolicy.js'
import { getTodayDateString, scheduledLocalToIso } from '../../../src/lib/timezone.js'
import { forbidden } from '../access.js'

const ACTION = 'organization_ai_policy'
export async function readAiPolicy(orgId, client = prisma) {
  const latest = await client.adminAuditLog.findFirst({ where: { org_id: orgId, action: ACTION }, orderBy: { created_at: 'desc' } })
  return mergeAiPolicy(DEFAULT_AI_POLICY, latest?.details?.policy || {})
}
// Policy snapshots are versioned in the existing company audit store. Locking
// the company row makes partial updates and daily reservations safe across APIs.
export async function saveAiPolicy(req, partial) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${req.organizationId}::uuid FOR UPDATE`
    const previous = await tx.adminAuditLog.findFirst({ where: { org_id: req.organizationId, action: ACTION }, orderBy: { created_at: 'desc' } })
    const policy = mergeAiPolicy(mergeAiPolicy(DEFAULT_AI_POLICY, previous?.details?.policy || {}), partial)
    await tx.adminAuditLog.create({ data: { org_id: req.organizationId, actor_id: req.user.id, action: ACTION, details: { policy }, created_at: new Date(Math.max(Date.now(), (previous?.created_at?.getTime() || 0) + 1)) } })
    return policy
  })
}
export async function authorizeAiRequest(req) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${req.organizationId}::uuid FOR UPDATE`
    const policy = await readAiPolicy(req.organizationId, tx)
    const feature = /copilot/.test(`${req.path} ${req.body?.toolId || ''}`) ? 'chat' : 'actions'
    if (policy.features[feature] === false) throw forbidden(`AI ${feature} is disabled by your company`)
    if (req.body?.workspace && policy.workspaces[req.body.workspace] === false) throw forbidden('AI is disabled in this workspace')
    if (policy.dailyRequestLimit) {
      const today = getTodayDateString(req.organization.timezone)
      const start = new Date(scheduledLocalToIso(today, '00:00', req.organization.timezone))
      const used = await tx.adminAuditLog.count({ where: { org_id: req.organizationId, actor_id: req.user.id, action: 'ai_request_started', created_at: { gte: start } } })
      if (used >= policy.dailyRequestLimit) throw Object.assign(new Error('Your company daily AI request limit has been reached'), { status: 429 })
    }
    await tx.adminAuditLog.create({ data: { org_id: req.organizationId, actor_id: req.user.id, action: 'ai_request_started', details: { feature } } })
    return policy
  })
}
