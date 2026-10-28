/**
 * Shared CRM Action Executor
 * Used by both the Dashboard Copilot and the AI Center chat.
 * All state is passed in so this function is pure (no component closure needed).
 */
import { db } from './api'
import { syncInterviewCallback } from './interviewScheduling'
import { getTodayDateString, normalizeTimezone, scheduledLocalToIso } from './timezone'

const INTERVIEW_DATE_PATTERN = /\b(\d{4}-\d{2}-\d{2}|\d{1,2}\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+\d{4})?|today|tomorrow|(?:next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i

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
  if (Number(minute) > 59 || hour > (match[3] ? 12 : 23) || (match[3] && hour < 1)) return null
  const period = match[3] || (hour >= 12 ? 'PM' : 'AM')
  if (hour > 12) hour -= 12
  if (hour === 0) hour = 12
  return `${String(hour).padStart(2, '0')}:${minute} ${period}`
}

export function normalizeDateString(rawDate, timezone) {
  const todayString = getTodayDateString(timezone)
  if (!rawDate) return todayString
  const lower = String(rawDate).trim().toLowerCase()
  const today = new Date(`${todayString}T12:00:00Z`)

  if (lower === 'today') return todayString
  if (lower === 'tomorrow') {
    const tom = new Date(today)
    tom.setUTCDate(tom.getUTCDate() + 1)
    return tom.toISOString().slice(0, 10)
  }

  const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const weekday = weekdays.indexOf(lower.replace(/^next\s+/, ''))
  if (weekday !== -1) {
    today.setUTCDate(today.getUTCDate() + ((weekday - today.getUTCDay() + 7) % 7 || 7))
    return today.toISOString().slice(0, 10)
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(lower)) {
    const date = new Date(`${lower}T12:00:00Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === lower ? lower : null
  }

  const cleanStr = String(rawDate).trim()
  if (!/^\d{1,2}\s+[a-z]+(?:\s+\d{4})?$/i.test(cleanStr)) return null
  const dateWithYear = cleanStr.match(/\b20\d\d\b/) ? cleanStr : `${cleanStr} ${today.getFullYear()}`
  const parsedMs = Date.parse(dateWithYear)
  if (!isNaN(parsedMs)) {
    const d = new Date(parsedMs)
    if (d.getDate() !== Number(cleanStr.split(' ')[0])) return null
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  }

  return null
}

function resolveRecord(rows, action, fields, label) {
  const term = String(action.entityName || '').toLowerCase().trim().replace(/^the\s+/, '').replace(/^#/, '')
  const values = row => fields.map(field => String(typeof field === 'function' ? field(row) : row[field] || '').toLowerCase().trim()).filter(Boolean)
  if (action.entityId) {
    const row = rows.find(item => String(item.id) === String(action.entityId))
    if (!row) throw new Error(`The specified ${label} was not found in accessible workspace records.`)
    if (term && !values(row).some(value => value.includes(term) || term.includes(value))) throw new Error(`The ${label} name does not match the record ID. Verify the record before confirming.`)
    return row
  }
  if (!term) throw new Error(`Specify the ${label} name or exact record ID.`)
  const exact = rows.filter(row => values(row).includes(term))
  const matches = exact.length ? exact : rows.filter(row => values(row).some(value => value.includes(term)))
  if (!matches.length) throw new Error(`The ${label} "${action.entityName}" was not found in accessible workspace records.`)
  if (matches.length > 1) throw new Error(`More than one ${label} matches "${action.entityName}". Specify its exact record ID.`)
  return matches[0]
}

async function checked(query) {
  const result = await query
  if (result.error) throw result.error
  return Array.isArray(result.data) ? result.data[0] : result.data
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
  const { type, entityName, params } = pendingAction || {}

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
      const targetJobs = [resolveRecord(jobs, pendingAction, ['job_id', 'title'], 'job')]
      for (const job of targetJobs) {
        const res = await db.from('jobs').update({ status: 'Closed' }).eq('id', job.id)
        if (res.error) throw res.error
      }
      refresh()
      return { success: true, message: 'Requisition updated to Closed.', actionTitle: 'Job Requisition Closed', actionEntityName: targetJobs.map(j => j.title).join(', '), updatedEntity: targetJobs }

    } else if (type === 'reopen_job') {
      const targetJobs = [resolveRecord(jobs, pendingAction, ['job_id', 'title'], 'job')]
      for (const job of targetJobs) {
        const res = await db.from('jobs').update({ status: 'Open' }).eq('id', job.id)
        if (res.error) throw res.error
      }
      refresh()
      return { success: true, message: 'Requisition status updated to Open.', actionTitle: 'Job Requisition Reopened', actionEntityName: targetJobs.map(j => j.title).join(', '), updatedEntity: targetJobs }

    } else if (type === 'delete_job' || type === 'remove_job') {
      const targetJobs = [resolveRecord(jobs, pendingAction, ['job_id', 'title'], 'job')]
      for (const job of targetJobs) {
        const res = await db.from('jobs').delete().eq('id', job.id)
        if (res.error) throw res.error
      }
      refresh()
      return { success: true, message: 'Job requisition permanently deleted.', actionTitle: 'Job Requisition Deleted', actionEntityName: targetJobs.map(j => j.title).join(', '), updatedEntity: null }

    } else if (type === 'hold_job' || type === 'fill_job') {
      const newStatus = type === 'hold_job' ? 'On Hold' : 'Filled'
      const targetJobs = [resolveRecord(jobs, pendingAction, ['job_id', 'title'], 'job')]
      for (const job of targetJobs) {
        const res = await db.from('jobs').update({ status: newStatus }).eq('id', job.id)
        if (res.error) throw res.error
      }
      refresh()
      return { success: true, message: `Job requisition status updated to ${newStatus}.`, actionTitle: 'Job Requisition Updated', actionEntityName: targetJobs.map(j => j.title).join(', '), updatedEntity: targetJobs }

    } else if (type === 'create_job' || type === 'post_job' || type === 'add_job') {
      const jobTitle = String(params?.title || entityName || '').trim()
      if (!jobTitle) throw new Error('Provide a job title before creating a requisition.')
      const newJobData = {
        job_id: params?.job_id || `JOB-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
        title: jobTitle,
        client: params?.client || '',
        location: params?.location || '',
        type: params?.type || 'Full-time',
        status: params?.status || 'Open',
        rate: params?.rate || '',
        open_date: normalizeDateString(params?.open_date, orgTimezone),
        priority: params?.priority || 'Medium',
        fe: params?.fe || profile?.full_name || 'AI Copilot',
        description: params?.description || '',
        user_id: userId, org_id: orgId,
      }
      const res = await db.from('jobs').insert([newJobData]).select()
      if (res.error) throw res.error
      refresh()
      return { success: true, message: `Job requisition "${jobTitle}" posted successfully.`, actionTitle: 'Job Requisition Posted', actionEntityName: jobTitle, updatedEntity: res.data?.[0] || newJobData }

    // ── CANDIDATES ──────────────────────────────────────────────────────────
    } else if (type === 'update_candidate_stage' || type === 'schedule_interview' || type === 'archive_candidate' || type === 'assign_recruiter') {
      const targetCandidates = [resolveRecord(candidates, pendingAction, [c => `${c.first_name || ''} ${c.last_name || ''}`.trim(), 'email'], 'candidate')]

      let targetStage = params?.stage
      if (!targetStage) {
        if (type === 'schedule_interview') targetStage = 'Interview Scheduled'
        else if (type === 'archive_candidate') targetStage = 'Rejected'
        else if (type !== 'assign_recruiter') throw new Error('Provide a valid candidate stage.')
      }
      if (targetStage && !['Pending', 'Submitted', 'Shortlisted', 'Interview Scheduled', 'Interview Done', 'Offer Extended', 'Hired', 'Rejected', 'On Hold', 'Withdrew'].includes(targetStage)) throw new Error(`The candidate stage "${targetStage}" is not supported.`)
      if (type === 'assign_recruiter' && !params?.recruiter_name) throw new Error('Provide the recruiter name to assign.')
      const isInterviewSchedule = type === 'schedule_interview' || targetStage === 'Interview Scheduled'

      for (const candidate of targetCandidates) {
        const updateData = type === 'assign_recruiter' ? {} : { internal_status: targetStage, external_status: targetStage }
        if (params?.recruiter_name) updateData.recruiter_name = params.recruiter_name
        if (isInterviewSchedule) {
          const rawDate = params?.interview_date || candidate.interview_date
          if (!rawDate) throw new Error('Provide an interview date before scheduling.')
          updateData.interview_date = normalizeDateString(rawDate, orgTimezone)
          if (!updateData.interview_date) throw new Error('Provide a valid interview date in YYYY-MM-DD format.')
          updateData.interview_time = extractInterviewTime(`at ${params?.interview_time || candidate.interview_time || ''}`)
          if (!updateData.interview_time) throw new Error('Provide a valid interview time before scheduling.')
          const rawType = params?.interview_type || candidate.interview_type
          updateData.interview_type = ({ Phone: 'Phone Screen', Video: 'Video Call', 'In-Person': 'On-site', Inperson: 'On-site' })[rawType] || rawType
          if (!['Phone Screen', 'Video Call', 'On-site', 'Panel', 'Technical'].includes(updateData.interview_type)) throw new Error('Provide an interview type: Phone Screen, Video Call, On-site, Panel, or Technical.')
        }
        const res = await db.from('candidates').update(updateData).eq('id', candidate.id).select()
        if (res.error) throw res.error

        if (isInterviewSchedule || candidate.internal_status === 'Interview Scheduled' || candidate.external_status === 'Interview Scheduled') {
          const updated = { ...candidate, ...updateData, ...(Array.isArray(res.data) ? res.data[0] : res.data) }
          const sync = await syncInterviewCallback(updated, { userId, orgId, timezone: orgTimezone, time: businessStart })
          if (sync.error || (isInterviewSchedule && !sync.synced)) {
            refresh()
            throw new Error(`Candidate status was saved, but the interview callback could not be ${isInterviewSchedule ? 'scheduled' : 'closed'}. ${sync.error?.message || 'Please retry.'}`)
          }
        }
      }
      refresh()
      const names = targetCandidates.map(c => `${c.first_name || ''} ${c.last_name || ''}`.trim()).join(', ')
      return {
        success: true,
        message: (isInterviewSchedule
          ? `Interview scheduled and callback created for ${names}.`
          : type === 'assign_recruiter' ? 'Recruiter assignment updated.' : `Candidate stage updated to ${targetStage}.`),
        actionTitle: isInterviewSchedule ? 'Interview Scheduled' : 'Candidate Stage Updated',
        actionEntityName: names,
        updatedEntity: targetCandidates,
      }

    } else if (type === 'delete_candidate' || type === 'remove_candidate') {
      const targetCandidates = [resolveRecord(candidates, pendingAction, [c => `${c.first_name || ''} ${c.last_name || ''}`.trim(), 'email'], 'candidate')]
      for (const candidate of targetCandidates) {
        const res = await db.from('candidates').delete().eq('id', candidate.id)
        if (res.error) throw res.error
      }
      refresh()
      return { success: true, message: 'Candidate record permanently removed.', actionTitle: 'Candidate Removed', actionEntityName: targetCandidates.map(c => `${c.first_name || ''} ${c.last_name || ''}`.trim()).join(', '), updatedEntity: null }

    } else if (type === 'add_candidate' || type === 'create_candidate') {
      const name = String(params?.name || entityName || '').trim()
      if (!name) throw new Error('Provide a candidate name before creating a record.')
      if (params?.stage && !['Pending', 'Submitted', 'Shortlisted', 'Interview Scheduled', 'Interview Done', 'Offer Extended', 'Hired', 'Rejected', 'On Hold', 'Withdrew'].includes(params.stage)) throw new Error('Provide a valid candidate stage.')
      const nameParts = name.split(/\s+/)
      const firstName = nameParts[0] || 'New'
      const lastName = nameParts.slice(1).join(' ') || 'Candidate'
      const newCand = {
        first_name: firstName, last_name: lastName,
        email: params?.email || '',
        job_id: params?.job_id || '',
        job_title: params?.job_title || '',
        client: params?.client || '',
        internal_status: params?.stage || 'Submitted',
        external_status: params?.stage || 'Submitted',
        submission_date: getTodayDateString(orgTimezone),
        recruiter_name: profile?.full_name || 'AI Copilot',
        user_id: userId, org_id: orgId,
      }
      const res = await db.from('candidates').insert([newCand]).select()
      if (res.error) throw res.error
      refresh()
      return { success: true, message: `Candidate ${firstName} ${lastName} added successfully.`, actionTitle: 'Candidate Added', actionEntityName: `${firstName} ${lastName}`, updatedEntity: res.data?.[0] || newCand }

    // ── CALLBACKS ───────────────────────────────────────────────────────────
    } else if (type === 'log_callback') {
      const candidateName = params?.candidateName || entityName
      if (!candidateName) throw new Error('Provide the callback contact name.')
      const callbackDate = normalizeDateString(params?.date || params?.callback_date, orgTimezone)
      const callbackTime = extractInterviewTime(`at ${params?.time || params?.callback_time || businessStart}`)
      if (!callbackDate || !callbackTime) throw new Error('Provide a valid callback date and time.')
      const res = await db.from('callbacks').insert({
        candidate_name: candidateName,
        date: callbackDate,
        time: callbackTime,
        timezone: orgTimezone,
        scheduled_at_utc: scheduledLocalToIso(callbackDate, callbackTime, orgTimezone),
        status: 'pending',
        phone: params?.phone || '', job: params?.job || '', notes: params?.notes || '',
        user_id: userId, org_id: orgId,
      })
      if (res.error) throw res.error
      refresh()
      return { success: true, message: 'Scheduled callback logged.', actionTitle: 'Callback Logged Successfully', actionEntityName: candidateName, updatedEntity: { candidate_name: candidateName } }

    } else if (type === 'complete_callback' || type === 'delete_callback') {
      const cb = resolveRecord(callbacks, pendingAction, ['candidate_name', 'job'], 'callback')
      if (cb) {
        if (type === 'complete_callback') await checked(db.from('callbacks').update({ status: 'done' }).eq('id', cb.id))
        else await checked(db.from('callbacks').delete().eq('id', cb.id))
        refresh()
      }
      return { success: true, message: type === 'complete_callback' ? 'Callback marked as completed.' : 'Callback removed.', actionTitle: 'Callback Updated', actionEntityName: cb.candidate_name, updatedEntity: null }

    // ── FOLLOW-UPS ──────────────────────────────────────────────────────────
    } else if (type === 'create_followup' || type === 'complete_followup' || type === 'delete_followup') {
      if (type === 'create_followup') {
        if (!params?.candidate_name && !entityName) throw new Error('Provide the follow-up contact name.')
        const date = normalizeDateString(params?.date || params?.due_date, orgTimezone)
        if (!date) throw new Error('Provide a valid follow-up date.')
        await checked(db.from('followups').insert({ candidate_name: params?.candidate_name || entityName || '', type: params?.type || 'Follow-up', notes: params?.notes || params?.text || '', next_action: params?.next_action || '', date, status: 'pending', user_id: userId, org_id: orgId }))
      } else {
        const row = resolveRecord(followups, pendingAction, ['candidate_name', 'type'], 'follow-up')
        await checked(type === 'complete_followup' ? db.from('followups').update({ status: 'done' }).eq('id', row.id) : db.from('followups').delete().eq('id', row.id))
      }
      refresh()
      return { success: true, message: 'Follow-up task updated successfully.', actionTitle: 'Follow-up Updated', actionEntityName: entityName || 'Follow-up', updatedEntity: null }

    } else if (type === 'create_task' || type === 'add_task') {
      const title = String(params?.title || params?.text || entityName || '').trim()
      if (!title) throw new Error('Provide a task title.')
      const due = params?.due_date || params?.date
      const dueDate = due ? normalizeDateString(due, orgTimezone) : null
      if (due && !dueDate) throw new Error('Provide a valid task due date.')
      const row = await checked(db.from('tasks').insert({ title, description: params?.description || '', category: 'Custom', priority: params?.priority || 'Medium', status: 'Pending', due_date: dueDate, assigned_to: userId, assigned_by: userId, assigned_to_name: profile?.full_name || '', assigned_by_name: profile?.full_name || '', org_id: orgId }).select())
      refresh()
      return { success: true, message: 'Task saved in Tasks & Targets.', actionTitle: 'Task Created', actionEntityName: title, updatedEntity: row }
    } else if (type === 'delete_task') {
      const tasks = ctx.tasks || (await db.from('tasks').select('*')).data || []
      const task = resolveRecord(tasks, pendingAction, ['title'], 'task')
      await checked(db.from('tasks').delete().eq('id', task.id))
      refresh()
      return { success: true, message: 'Task deleted.', actionTitle: 'Task Deleted', actionEntityName: task.title, updatedEntity: null }
    } else {
      return { success: false, error: `The action "${type || 'unspecified'}" is not supported. No records were changed.` }
    }
  } catch (err) {
    return { success: false, error: err.message || 'Unable to complete the operation. Please try again.' }
  }
}

/**
 * Parse a raw user message and derive the pendingAction object (fallback parser).
 * Only explicit commands become fallback proposals; questions remain read-only.
 */
export function parseCrmActionFromText(q) {

  const task = String(q || '').match(/^(?:create|add)\s+(?:a\s+)?task\s+(?:to\s+)?(.+)$/i)
  if (task) {
    const due = extractInterviewDate(task[1])
    const title = due ? task[1].replace(new RegExp(`\\s+(?:on\\s+)?${due}$`, 'i'), '').trim() : task[1].trim()
    return { type: 'create_task', entity: 'task', entityName: title, params: { title, due_date: due }, requiresConfirmation: true }
  }
  const callback = String(q || '').match(/^(?:log|schedule)\s+(?:a\s+)?callback\s+(?:for|with)\s+(.+)$/i)
  if (callback) return { type: 'log_callback', entity: 'callback', entityName: callback[1].split(/\s+(?:on|at|today|tomorrow|next)\b/i)[0].trim(), params: { date: extractInterviewDate(q), time: extractInterviewTime(q) }, requiresConfirmation: true }
  const jobAction = String(q || '').match(/^(close|archive|reopen|hold|fill|delete|remove)\s+(?:the\s+)?job\s+(.+)$/i)
  if (jobAction) return { type: `${jobAction[1].toLowerCase() === 'remove' ? 'delete' : jobAction[1].toLowerCase()}_job`, entity: 'job', entityName: jobAction[2].trim(), requiresConfirmation: true }

  const interview = String(q || '').match(/^(?:schedule|book|set up)\s+(?:a\s+)?(?:(phone|video|in-person|panel|technical)\s+)?interview\s+(?:for|with)\s+(.+)$/i)
  if (interview) return { type: 'schedule_interview', entity: 'candidate', entityName: interview[2].split(/\s+(?:on|at|today|tomorrow|next)\b/i)[0].trim(), params: { stage: 'Interview Scheduled', interview_date: extractInterviewDate(q), interview_time: extractInterviewTime(q), interview_type: ({ phone: 'Phone Screen', video: 'Video Call', 'in-person': 'On-site', panel: 'Panel', technical: 'Technical' })[interview[1]?.toLowerCase()] || 'Phone Screen' }, requiresConfirmation: true, rawQuery: q }
  const move = String(q || '').match(/^move\s+(?:candidate\s+)?(.+?)\s+to\s+(.+)$/i)
  if (move) {
    const stage = ['Pending', 'Submitted', 'Shortlisted', 'Interview Scheduled', 'Interview Done', 'Offer Extended', 'Hired', 'Rejected', 'On Hold', 'Withdrew'].find(value => value.toLowerCase() === move[2].toLowerCase())
    if (stage) return { type: 'update_candidate_stage', entity: 'candidate', entityName: move[1].trim(), params: { stage }, requiresConfirmation: true }
  }
  return null
}
