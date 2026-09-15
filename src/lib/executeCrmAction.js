/**
 * Shared CRM Action Executor
 * Used by both the Dashboard Copilot and the AI Center chat.
 * All state is passed in so this function is pure (no component closure needed).
 */
import { db } from './api'
import { syncInterviewCallback } from './interviewScheduling'
import { normalizeTimezone, scheduledLocalToIso } from './timezone'

const INTERVIEW_DATE_PATTERN = /(\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+\d{4})?|today|tomorrow|monday|tuesday|wednesday|thursday|friday|\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))/i

export function extractInterviewDate(text = '') {
  return text.match(INTERVIEW_DATE_PATTERN)?.[1] || null
}

export function extractInterviewTime(text = '') {
  const raw = String(text || '')
  const explicit = raw.match(/(?:\bat\b|@)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)(?:\s*(?:est|cst|mst|pst|ist|et|ct|mt|pt))?/i)
  const withMeridiem = raw.match(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))(?:\s*(?:est|cst|mst|pst|ist|et|ct|mt|pt))?\b/i)
  const value = (explicit?.[1] || withMeridiem?.[1] || '').trim()
  if (!value) return null

  const match = value.toUpperCase().match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/)
  if (!match) return value
  let hour = parseInt(match[1], 10)
  const minute = match[2] || '00'
  const period = match[3] || (hour >= 12 ? 'PM' : 'AM')
  if (hour > 12) hour -= 12
  if (hour === 0) hour = 12
  return `${String(hour).padStart(2, '0')}:${minute} ${period}`
}

export function normalizeDateString(rawDate) {
  if (!rawDate) return new Date().toISOString().slice(0, 10)
  const lower = String(rawDate).trim().toLowerCase()
  const today = new Date()

  if (lower === 'today') return today.toISOString().slice(0, 10)
  if (lower === 'tomorrow') {
    const tom = new Date(today)
    tom.setDate(tom.getDate() + 1)
    return tom.toISOString().slice(0, 10)
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate.trim())) return rawDate.trim()

  const cleanStr = rawDate.trim()
  const dateWithYear = cleanStr.match(/\b20\d\d\b/) ? cleanStr : `${cleanStr} ${today.getFullYear()}`
  const parsedMs = Date.parse(dateWithYear)
  if (!isNaN(parsedMs)) {
    const d = new Date(parsedMs)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  return rawDate
}

/**
 * @param {object} pendingAction - The action object from the AI response
 * @param {object} ctx           - Runtime context
 * @param {Array}  ctx.candidates
 * @param {Array}  ctx.jobs
 * @param {Array}  ctx.callbacks
 * @param {Array}  ctx.followups
 * @param {string} ctx.userId
 * @param {string} ctx.orgId
 * @param {object} ctx.profile
 * @param {Function} [ctx.onRefresh]  - Called after a successful write so the caller can refetch
 */
export async function executeCrmAction(pendingAction, ctx = {}) {
  const { type, entityId, entityName, params, successMessage } = pendingAction || {}
  const searchName = (entityName || '').toLowerCase().trim()

  const candidates = ctx.candidates || []
  const jobs = ctx.jobs || []
  const callbacks = ctx.callbacks || []
  const followups = ctx.followups || []
  const { userId, orgId, profile, onRefresh } = ctx
  const orgTimezone = normalizeTimezone(ctx.organization?.timezone || profile?.organization?.timezone || profile?.organizations?.timezone || 'America/New_York')
  const businessStart = ctx.organization?.business_hours_start || profile?.organization?.business_hours_start || '09:00'

  const refresh = () => { if (onRefresh) onRefresh() }

  try {
    // ── JOBS ────────────────────────────────────────────────────────────────
    if (type === 'close_job' || type === 'archive_job') {
      let targetJobs = []
      if (entityId) {
        targetJobs = jobs.filter(j => String(j.id) === String(entityId))
      } else if (searchName && !['all', 'all open jobs', 'active jobs'].includes(searchName)) {
        targetJobs = jobs.filter(j => (j.title || '').toLowerCase().includes(searchName))
      } else {
        targetJobs = jobs.filter(j => j.status === 'Open')
      }
      if (!targetJobs.length) return { success: false, error: 'The specified job requisition could not be found.' }
      for (const job of targetJobs) {
        const res = await db.from('jobs').update({ status: 'Closed' }).eq('id', job.id)
        if (res.error) throw res.error
      }
      refresh()
      return { success: true, message: successMessage || 'Requisition updated to Closed.', actionTitle: 'Job Requisition Closed', actionEntityName: targetJobs.map(j => j.title).join(', '), updatedEntity: targetJobs }

    } else if (type === 'reopen_job') {
      let targetJobs = []
      if (entityId) targetJobs = jobs.filter(j => String(j.id) === String(entityId))
      else if (searchName) targetJobs = jobs.filter(j => (j.title || '').toLowerCase().includes(searchName))
      else targetJobs = jobs.filter(j => j.status === 'Closed' || j.status === 'On Hold')
      if (!targetJobs.length) return { success: false, error: 'The selected closed job could not be found.' }
      for (const job of targetJobs) {
        const res = await db.from('jobs').update({ status: 'Open' }).eq('id', job.id)
        if (res.error) throw res.error
      }
      refresh()
      return { success: true, message: successMessage || 'Requisition status updated to Open.', actionTitle: 'Job Requisition Reopened', actionEntityName: targetJobs.map(j => j.title).join(', '), updatedEntity: targetJobs }

    } else if (type === 'delete_job' || type === 'remove_job') {
      let targetJobs = []
      if (entityId) targetJobs = jobs.filter(j => String(j.id) === String(entityId))
      else if (searchName) targetJobs = jobs.filter(j => (j.title || '').toLowerCase().includes(searchName))
      if (!targetJobs.length) return { success: false, error: `The job requisition "${entityName || 'specified'}" could not be found.` }
      for (const job of targetJobs) {
        const res = await db.from('jobs').delete().eq('id', job.id)
        if (res.error) throw res.error
      }
      refresh()
      return { success: true, message: successMessage || 'Job requisition permanently deleted.', actionTitle: 'Job Requisition Deleted', actionEntityName: targetJobs.map(j => j.title).join(', '), updatedEntity: null }

    } else if (type === 'hold_job' || type === 'fill_job') {
      const newStatus = type === 'hold_job' ? 'On Hold' : 'Filled'
      let targetJobs = jobs.filter(j => (j.title || '').toLowerCase().includes(searchName))
      if (!targetJobs.length) return { success: false, error: `The job requisition "${entityName || 'specified'}" could not be found.` }
      for (const job of targetJobs) {
        const res = await db.from('jobs').update({ status: newStatus }).eq('id', job.id)
        if (res.error) throw res.error
      }
      refresh()
      return { success: true, message: `Job requisition status updated to ${newStatus}.`, actionTitle: 'Job Requisition Updated', actionEntityName: targetJobs.map(j => j.title).join(', '), updatedEntity: targetJobs }

    } else if (type === 'create_job' || type === 'post_job' || type === 'add_job') {
      const jobTitle = params?.title || entityName || 'New Job Requisition'
      const newJobData = {
        job_id: params?.job_id || `JOB-${Math.floor(100 + Math.random() * 900)}`,
        title: jobTitle,
        client: params?.client || 'Internal Client',
        location: params?.location || 'Remote',
        type: params?.type || 'Full-time',
        status: params?.status || 'Open',
        rate: params?.rate || 'Competitive',
        open_date: params?.open_date || new Date().toISOString().slice(0, 10),
        priority: params?.priority || 'Medium',
        fe: params?.fe || profile?.full_name || 'AI Copilot',
        description: params?.description || 'Posted via AI Action Copilot',
        user_id: userId,
      }
      const res = await db.from('jobs').insert([newJobData]).select()
      if (res.error) throw res.error
      refresh()
      return { success: true, message: successMessage || `Job requisition "${jobTitle}" posted successfully.`, actionTitle: 'Job Requisition Posted', actionEntityName: jobTitle, updatedEntity: res.data?.[0] || newJobData }

    // ── CANDIDATES ──────────────────────────────────────────────────────────
    } else if (type === 'update_candidate_stage' || type === 'schedule_interview' || type === 'archive_candidate' || type === 'assign_recruiter') {
      let targetCandidates = []
      if (entityId) {
        targetCandidates = candidates.filter(c => String(c.id) === String(entityId))
      } else if (searchName) {
        const cleanSearch = searchName
          .replace(/\b(candidate|applicant|submitted|on|for|job|requisition)\b/gi, '')
          .replace(/\bjob-?\d+\b/gi, '')
          .replace(/[,;.]/g, '')
          .trim()

        const targetTerm = (cleanSearch || searchName).toLowerCase()
        const tokens = targetTerm.split(/\s+/).filter(t => t.length > 0)

        targetCandidates = candidates.filter(c => {
          const firstName = (c.first_name || '').toLowerCase()
          const lastName = (c.last_name || '').toLowerCase()
          const fullName = `${firstName} ${lastName}`.trim()
          const email = (c.email || '').toLowerCase()

          if (fullName.includes(targetTerm) || email.includes(targetTerm)) return true
          if (tokens.length > 0) {
            return tokens.every(tok => firstName.includes(tok) || lastName.includes(tok) || fullName.includes(tok))
          }
          return false
        })

        // Job requisition filter if specified in raw query or search term
        const rawQuery = (pendingAction.rawQuery || entityName || searchName || '').toUpperCase()
        const jobMatch = rawQuery.match(/JOB-?\d+/i)
        if (jobMatch && targetCandidates.length > 1) {
          const jobCode = jobMatch[0].replace('-', '')
          const jobFiltered = targetCandidates.filter(c => {
            const cJob = String(c.job_id || c.job_title || '').toUpperCase().replace('-', '')
            return cJob.includes(jobCode)
          })
          if (jobFiltered.length > 0) targetCandidates = jobFiltered
        }
      }

      // DO NOT fallback to candidates[0] when candidate is not found!
      if (!targetCandidates.length) {
        const attemptedName = entityName || searchName || 'specified candidate'
        return {
          success: false,
          error: `Candidate "${attemptedName}" was not found in workspace records. Please verify the candidate name or create the candidate record first.`
        }
      }

      let targetStage = params?.stage
      if (!targetStage) {
        if (type === 'schedule_interview') targetStage = 'Interview Scheduled'
        else if (type === 'archive_candidate') targetStage = 'Rejected'
        else targetStage = 'Screening'
      }
      const isInterviewSchedule = type === 'schedule_interview' || targetStage === 'Interview Scheduled'

      for (const candidate of targetCandidates) {
        const updateData = { internal_status: targetStage, external_status: targetStage }
        if (params?.recruiter_name) updateData.recruiter_name = params.recruiter_name
        if (isInterviewSchedule) {
          if (params?.interview_date) updateData.interview_date = normalizeDateString(params.interview_date)
          if (params?.interview_time) updateData.interview_time = params.interview_time
          if (params?.interview_type) updateData.interview_type = params.interview_type
        }
        const res = await db.from('candidates').update(updateData).eq('id', candidate.id).select()
        if (res.error) throw res.error

        if (isInterviewSchedule) {
          const updated = (Array.isArray(res.data) ? res.data[0] : res.data) || { ...candidate, ...updateData }
          await syncInterviewCallback(updated, { userId, orgId, timezone: orgTimezone, time: businessStart })
        }
      }
      refresh()
      const names = targetCandidates.map(c => `${c.first_name || ''} ${c.last_name || ''}`.trim()).join(', ')
      return {
        success: true,
        message: successMessage || (isInterviewSchedule
          ? `Interview scheduled and callback created for ${names}.`
          : `Candidate stage updated to ${targetStage}.`),
        actionTitle: isInterviewSchedule ? 'Interview Scheduled' : 'Candidate Stage Updated',
        actionEntityName: names,
        updatedEntity: targetCandidates,
      }

    } else if (type === 'delete_candidate' || type === 'remove_candidate') {
      let targetCandidates = []
      if (entityId) targetCandidates = candidates.filter(c => String(c.id) === String(entityId))
      else if (searchName) {
        targetCandidates = candidates.filter(c =>
          `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase().includes(searchName) ||
          (c.email && c.email.toLowerCase().includes(searchName))
        )
      }
      if (!targetCandidates.length) return { success: false, error: `The candidate record "${entityName || 'specified'}" could not be found.` }
      for (const candidate of targetCandidates) {
        const res = await db.from('candidates').delete().eq('id', candidate.id)
        if (res.error) throw res.error
      }
      refresh()
      return { success: true, message: successMessage || 'Candidate record permanently removed.', actionTitle: 'Candidate Removed', actionEntityName: targetCandidates.map(c => `${c.first_name || ''} ${c.last_name || ''}`.trim()).join(', '), updatedEntity: null }

    } else if (type === 'add_candidate' || type === 'create_candidate') {
      const nameParts = (params?.name || entityName || 'New Candidate').split(' ')
      const firstName = nameParts[0] || 'New'
      const lastName = nameParts.slice(1).join(' ') || 'Candidate'
      const newCand = {
        first_name: firstName, last_name: lastName,
        email: params?.email || `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
        job_title: params?.job_title || 'Software Developer',
        client: params?.client || 'Internal Client',
        internal_status: params?.stage || 'Submitted',
        external_status: params?.stage || 'Submitted',
        submission_date: new Date().toISOString().slice(0, 10),
        recruiter_name: profile?.full_name || 'AI Copilot',
        user_id: userId, org_id: orgId,
      }
      const res = await db.from('candidates').insert([newCand]).select()
      if (res.error) throw res.error
      refresh()
      return { success: true, message: `Candidate ${firstName} ${lastName} added successfully.`, actionTitle: 'Candidate Added', actionEntityName: `${firstName} ${lastName}`, updatedEntity: res.data?.[0] || newCand }

    // ── CALLBACKS ───────────────────────────────────────────────────────────
    } else if (type === 'log_callback') {
      const candidateName = params?.candidateName || entityName || 'Candidate'
      const callbackDate = new Date().toISOString().slice(0, 10)
      const callbackTime = businessStart
      const res = await db.from('callbacks').insert({
        candidate_name: candidateName,
        date: callbackDate,
        time: callbackTime,
        timezone: orgTimezone,
        scheduled_at_utc: scheduledLocalToIso(callbackDate, callbackTime, orgTimezone),
        status: 'pending',
        user_id: userId, org_id: orgId,
      })
      if (res.error) throw res.error
      refresh()
      return { success: true, message: successMessage || 'Scheduled callback logged.', actionTitle: 'Callback Logged Successfully', actionEntityName: candidateName, updatedEntity: { candidate_name: candidateName } }

    } else if (type === 'complete_callback' || type === 'delete_callback') {
      let cb = callbacks.find(c => (c.candidate_name || '').toLowerCase().includes(searchName))
      if (!cb && callbacks.length > 0) cb = callbacks[0]
      if (cb) {
        if (type === 'complete_callback') await db.from('callbacks').update({ status: 'done' }).eq('id', cb.id)
        else await db.from('callbacks').delete().eq('id', cb.id)
        refresh()
      }
      return { success: true, message: type === 'complete_callback' ? 'Callback marked as completed.' : 'Callback removed.', actionTitle: 'Callback Updated', actionEntityName: searchName || 'Candidate Callback', updatedEntity: null }

    // ── FOLLOW-UPS ──────────────────────────────────────────────────────────
    } else if (type === 'create_followup' || type === 'complete_followup' || type === 'delete_followup') {
      if (type === 'create_followup') {
        await db.from('followups').insert({ title: entityName || 'Follow up with candidate', date: new Date().toISOString().slice(0, 10), status: 'pending', user_id: userId, org_id: orgId })
      } else if (type === 'complete_followup' && followups.length > 0) {
        await db.from('followups').update({ status: 'done' }).eq('id', followups[0].id)
      } else if (type === 'delete_followup' && followups.length > 0) {
        await db.from('followups').delete().eq('id', followups[0].id)
      }
      refresh()
      return { success: true, message: 'Follow-up task updated successfully.', actionTitle: 'Follow-up Updated', actionEntityName: entityName || 'Follow-up', updatedEntity: null }

    } else {
      return { success: true, message: successMessage || 'Operation completed.', actionTitle: 'Action Executed', updatedEntity: null }
    }
  } catch (err) {
    console.error('[executeCrmAction] error:', err)
    return { success: false, error: 'Unable to complete the operation right now. Please try again in a few moments.' }
  }
}

/**
 * Parse a raw user message and derive the pendingAction object (fallback parser).
 * Mirrors the fallback logic in Dashboard.jsx so both surfaces behave the same.
 */
export function parseCrmActionFromText(q) {
  const lowerQ = (q || '').toLowerCase()

  if (lowerQ.includes('close job') || lowerQ.includes('archive job')) {
    const targetTitle = q.replace(/close job|archive job/gi, '').trim()
    return { type: 'close_job', entity: 'job', entityName: targetTitle || 'specified job', requiresConfirmation: true, confirmTitle: 'Confirm Closing Job Requisition', confirmPrompt: `Close "${targetTitle || 'selected job'}"?`, successMessage: `Requisition "${targetTitle || 'selected job'}" closed.` }
  }
  if (lowerQ.includes('reopen job') || lowerQ.includes('reopen it')) {
    const t = q.replace(/reopen job|reopen it|reopen/gi, '').trim()
    return { type: 'reopen_job', entity: 'job', entityName: t || 'specified job', requiresConfirmation: true, confirmTitle: 'Confirm Reopening Job', confirmPrompt: `Reopen "${t || 'selected job'}"?`, successMessage: `Requisition "${t || 'selected job'}" reopened.` }
  }
  if (lowerQ.includes('delete candidate') || lowerQ.includes('remove candidate')) {
    const cn = q.replace(/delete candidate|remove candidate/gi, '').trim()
    return { type: 'delete_candidate', entity: 'candidate', entityName: cn, requiresConfirmation: true, confirmTitle: 'Confirm Candidate Deletion', confirmPrompt: `Permanently delete candidate record for "${cn || 'selected candidate'}"?`, successMessage: `Candidate record for "${cn || 'selected candidate'}" permanently removed.` }
  }
  if (lowerQ.includes('schedule callback') || lowerQ.includes('log callback')) {
    const cn = q.replace(/schedule callback for|log callback for|schedule callback|log callback/gi, '').trim()
    return { type: 'log_callback', entity: 'callback', entityName: cn || 'Candidate', requiresConfirmation: false, successMessage: `Scheduled callback logged for ${cn || 'Candidate'}.` }
  }
  if (lowerQ.includes('schedule interview') || lowerQ.includes('schedule a interview') || lowerQ.includes('book interview') || lowerQ.includes('set up interview')) {
    let candName = 'Candidate'
    const nameMatch = q.match(/(?:for|with)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i)
    if (nameMatch) {
      candName = nameMatch[1]
        .replace(/\b(candidate|applicant|submitted|on|job|requisition)\b/gi, '')
        .replace(/\bjob-?\d+\b/gi, '')
        .trim() || nameMatch[1].trim()
    }
    const interviewDate = extractInterviewDate(q)
    const interviewTime = extractInterviewTime(q)
    const typeMatch = q.match(/\b(phone|video|in-?person|panel)\b/i)
    const iType = typeMatch ? typeMatch[1].charAt(0).toUpperCase() + typeMatch[1].slice(1).toLowerCase().replace('-', '') : 'Phone'
    return {
      type: 'schedule_interview', entity: 'candidate', entityName: candName, rawQuery: q,
      params: { stage: 'Interview Scheduled', interview_date: interviewDate, interview_time: interviewTime, interview_type: iType },
      requiresConfirmation: true, confirmTitle: 'Confirm Interview Scheduling',
      confirmPrompt: `Schedule a ${iType} interview for candidate "${candName}"${interviewDate ? ` on ${interviewDate}` : ''}${interviewTime ? ` at ${interviewTime}` : ''}? This will also create a callback entry.`,
      successMessage: `Interview scheduled for ${candName}. Callback created automatically.`,
    }
  }
  if (lowerQ.includes('move candidate') || lowerQ.includes('to offer extended') || lowerQ.includes('to interview') || lowerQ.includes('to rejected')) {
    const match = q.match(/candidate\s+([A-Za-z\s]+?)\s+to/i) || q.match(/move\s+([A-Za-z\s]+?)\s+to/i)
    const cn = match ? match[1].trim() : 'Candidate'
    let stage = 'Screening'
    const isInt = lowerQ.includes('interview')
    if (lowerQ.includes('offer')) stage = 'Offer Extended'
    else if (isInt) stage = 'Interview Scheduled'
    else if (lowerQ.includes('reject')) stage = 'Rejected'
    else if (lowerQ.includes('hired')) stage = 'Hired'
    return { type: isInt ? 'schedule_interview' : 'update_candidate_stage', entity: 'candidate', entityName: cn, params: { stage }, requiresConfirmation: true, confirmTitle: isInt ? 'Confirm Interview Scheduling' : 'Confirm Stage Update', confirmPrompt: isInt ? `Schedule interview for "${cn}"?` : `Move "${cn}" to ${stage}?`, successMessage: isInt ? `Interview scheduled for ${cn}. Callback created.` : `Candidate "${cn}" moved to ${stage}.` }
  }
  return null
}
