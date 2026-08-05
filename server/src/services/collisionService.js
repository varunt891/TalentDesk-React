import { prisma } from '../prisma.js'

export function normalizeEmail(email) {
  const trimmed = (email || '').trim().toLowerCase()
  return trimmed || null
}

export function normalizePhone(phone) {
  const digits = (phone || '').replace(/\D/g, '')
  return digits || null
}

// Mirrors CommunicationWorkspace.jsx's RESUBMIT_STATUSES exactly — a prior
// row in one of these internal_status values is precisely what the
// legitimate bench-redeployment ("Resubmit") flow targets, so soft matches
// (same client, different job) against them are excluded to avoid false
// positives. Hard matches (same job_id) are never excluded by status.
const RESUBMIT_TERMINAL_STATUSES = ['Rejected', 'Withdrew', 'On Hold']

const CANDIDATE_SELECT = {
  id: true, first_name: true, last_name: true, email: true, phone: true,
  job_id: true, job_title: true, client: true, user_id: true,
  recruiter_name: true, internal_status: true,
}

export async function findMatches({ orgId, candidate, excludeId }) {
  const email = normalizeEmail(candidate.email)
  const phone = normalizePhone(candidate.phone)
  if (!orgId || (!email && !phone)) return []

  const pool = await prisma.candidate.findMany({
    where: {
      org_id: orgId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      OR: [
        ...(email ? [{ email: { not: null } }] : []),
        ...(phone ? [{ phone: { not: null } }] : []),
      ],
    },
    select: CANDIDATE_SELECT,
  })

  const matches = []
  for (const other of pool) {
    const emailHit = Boolean(email && normalizeEmail(other.email) === email)
    const phoneHit = Boolean(phone && normalizePhone(other.phone) === phone)
    if (!emailHit && !phoneHit) continue

    const matchField = emailHit && phoneHit ? 'both' : emailHit ? 'email' : 'phone'
    const sameJob = Boolean(candidate.job_id && other.job_id && candidate.job_id === other.job_id)
    const sameClient = Boolean(
      candidate.client && other.client &&
      candidate.client.trim().toLowerCase() === other.client.trim().toLowerCase()
    )

    if (sameJob) {
      matches.push({ type: 'hard', matchField, other })
    } else if (sameClient && !RESUBMIT_TERMINAL_STATUSES.includes(other.internal_status)) {
      matches.push({ type: 'soft', matchField, other })
    }
  }
  return matches
}

async function notifyBothRecruiters({ req, row, otherUserId }) {
  const orgId = req.organizationId || req.profile?.org_id
  const label = row.type === 'hard' ? 'the same job' : 'the same client'
  try {
    await prisma.notification.create({
      data: {
        org_id: orgId,
        user_id: req.user.id,
        title: 'Possible duplicate submission',
        message: `${row.candidate_name || 'A candidate'} may already be submitted (${label}) by ${row.matched_recruiter_name || 'another recruiter'}.`,
        link: '/collisions',
      },
    })
    if (otherUserId && otherUserId !== req.user.id) {
      await prisma.notification.create({
        data: {
          org_id: orgId,
          user_id: otherUserId,
          title: 'Possible duplicate submission',
          message: `${req.profile?.full_name || 'Another recruiter'} just submitted ${row.candidate_name || 'a candidate'} you already have on file (${label}).`,
          link: '/collisions',
        },
      })
    }
  } catch (err) {
    console.warn('[collisionService] Notification write failed:', err.message)
  }
}

// The one function every write path (single create, bulk create, edit) calls.
// Runs synchronously in the request — a narrow, org-scoped query is cheap,
// and there's no background-job infrastructure in this codebase to justify
// introducing one for this.
export async function detectAndRecordCollisions({ req, candidate, excludeId }) {
  const orgId = req.organizationId || req.profile?.org_id
  const matches = await findMatches({ orgId, candidate, excludeId })
  if (!matches.length) return []

  const created = []
  for (const m of matches) {
    const existing = await prisma.submissionCollision.findFirst({
      where: {
        org_id: orgId,
        status: 'open',
        OR: [
          { candidate_id: candidate.id, matched_candidate_id: m.other.id },
          { candidate_id: m.other.id, matched_candidate_id: candidate.id },
        ],
      },
    })
    if (existing) {
      created.push(existing)
      continue
    }

    const row = await prisma.submissionCollision.create({
      data: {
        org_id: orgId,
        type: m.type,
        match_field: m.matchField,
        candidate_id: candidate.id,
        candidate_name: `${candidate.first_name || ''} ${candidate.last_name || ''}`.trim(),
        candidate_email: candidate.email,
        candidate_phone: candidate.phone,
        job_id: candidate.job_id,
        job_title: candidate.job_title,
        client: candidate.client,
        submitting_user_id: req.user.id,
        submitting_recruiter_name: req.profile?.full_name || candidate.recruiter_name,
        matched_candidate_id: m.other.id,
        matched_recruiter_id: m.other.user_id,
        matched_recruiter_name: m.other.recruiter_name,
        matched_job_id: m.other.job_id,
        matched_job_title: m.other.job_title,
        matched_client: m.other.client,
      },
    })
    created.push(row)
    await notifyBothRecruiters({ req, row, otherUserId: m.other.user_id })
  }
  return created
}
