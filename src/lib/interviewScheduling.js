import { db } from './api'
import { normalizeTimezone, scheduledLocalToIso } from './timezone'

export const INTERVIEW_SCHEDULED_STATUS = 'Interview Scheduled'
export const INTERVIEW_CALLBACK_MARKER = 'TalentDesk interview callback'

export function hasInterviewScheduledStatus(candidate = {}) {
  return [candidate.internal_status, candidate.external_status].includes(INTERVIEW_SCHEDULED_STATUS)
}

export function getCandidateDisplayName(candidate = {}) {
  return `${candidate.first_name || ''} ${candidate.last_name || ''}`.trim()
}

export function buildInterviewCallbackPayload(candidate = {}, context = {}) {
  const name = getCandidateDisplayName(candidate)
  const interviewType = candidate.interview_type || 'Interview'
  const job = [candidate.job_id, candidate.job_title].filter(Boolean).join(' - ') || candidate.job_title || 'Interview'
  const timezone = normalizeTimezone(context.timezone || candidate.timezone || 'America/New_York')
  const time = candidate.interview_time || context.time || '10:00 AM'
  const noteLines = [
    `${INTERVIEW_CALLBACK_MARKER}: ${interviewType}`,
    candidate.client ? `Client: ${candidate.client}` : null,
    candidate.id ? `Candidate ID: ${candidate.id}` : null,
    candidate.email ? `Email: ${candidate.email}` : null,
    candidate.notes ? `Candidate notes: ${candidate.notes}` : null,
  ].filter(Boolean)

  return {
    candidate_name: name,
    phone: candidate.phone || '',
    job,
    date: candidate.interview_date || null,
    time,
    timezone,
    scheduled_at_utc: scheduledLocalToIso(candidate.interview_date, time, timezone),
    snoozed_until: null,
    interest: 'Hot',
    notes: noteLines.join('\n'),
    status: 'pending',
    user_id: context.userId || candidate.user_id || null,
    org_id: context.orgId || candidate.org_id || null,
  }
}

export async function syncInterviewCallback(candidate = {}, context = {}) {
  const { data: existingRows, error: loadError } = await db.from('callbacks').select('*')
  if (loadError) return { synced: false, error: loadError }

  const payload = buildInterviewCallbackPayload(candidate, context)
  const candidateId = candidate.id ? String(candidate.id) : ''
  const normalizedName = payload.candidate_name.toLowerCase()
  const existing = (existingRows || []).find(callback => {
    const notes = String(callback.notes || '')
    if (candidateId && notes.includes(`Candidate ID: ${candidateId}`) && notes.includes(INTERVIEW_CALLBACK_MARKER)) return true
    return String(callback.candidate_name || '').trim().toLowerCase() === normalizedName
      && String(callback.date || '').slice(0, 10) === String(payload.date || '').slice(0, 10)
      && notes.includes(INTERVIEW_CALLBACK_MARKER)
  })

  if (!hasInterviewScheduledStatus(candidate) || !candidate.interview_date) {
    if (existing?.id && existing.status === 'pending') {
      const notes = `${existing.notes || ''}\nClosed automatically because the candidate interview status changed.`.trim()
      const { data, error } = await db.from('callbacks').update({ status: 'done', notes }).eq('id', existing.id).select()
      if (error) return { synced: false, error }
      window.dispatchEvent(new CustomEvent('callback-updated'))
      return { synced: true, action: 'closed', data: Array.isArray(data) ? data[0] : data }
    }
    return { synced: false, reason: 'No scheduled interview date.' }
  }

  if (!payload.candidate_name) return { synced: false, reason: 'Candidate name is missing.' }

  if (existing?.id) {
    const { data, error } = await db.from('callbacks').update(payload).eq('id', existing.id).select()
    if (error) return { synced: false, error }
    window.dispatchEvent(new CustomEvent('callback-updated'))
    return { synced: true, action: 'updated', data: Array.isArray(data) ? data[0] : data }
  }

  const { data, error } = await db.from('callbacks').insert([payload]).select()
  if (error) return { synced: false, error }
  window.dispatchEvent(new CustomEvent('callback-updated'))
  return { synced: true, action: 'created', data: Array.isArray(data) ? data[0] : data }
}
