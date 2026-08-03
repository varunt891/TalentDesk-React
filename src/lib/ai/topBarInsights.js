// Real, deterministic commentary for the two top-bar pixel bots. Reuses the
// same workspace snapshot the AI Copilot sees (fetchWorkspaceSnapshot) so the
// robot and applicant narrate what is actually happening in the portal —
// open jobs, pipeline movement, tasks/callbacks/follow-ups due — instead of
// a handful of static flavor strings. Nothing here is AI-generated or
// fabricated; every line is derived from real rows.
import { useEffect, useMemo, useState } from 'react'
import { fetchWorkspaceSnapshot } from './workspaceSnapshot'

const POLL_MS = 90000

const STAGE_EMOJI = {
  'Pending': '⏳', 'Submitted': '📥', 'Shortlisted': '⭐', 'Interview Scheduled': '🗓️',
  'Interview Done': '✅', 'Offer Extended': '📝', 'Hired': '🎉', 'On Hold': '⏸️',
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

function hoursSince(dateStr) {
  if (!dateStr) return Infinity
  const t = new Date(dateStr).getTime()
  return Number.isNaN(t) ? Infinity : (Date.now() - t) / 3600000
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

export function buildRobotInsights(snapshot, { unreadCount = 0, userName = '' } = {}) {
  const insights = []
  if (userName) {
    insights.push({ emoji: '👋', text: `Hey ${userName.split(' ')[0]}, here's what's moving today`, path: null })
  }
  if (unreadCount > 0) {
    insights.push({ emoji: '🔔', text: `${plural(unreadCount, 'unread notification')} waiting`, path: null })
  }

  if (!snapshot) return insights

  const { candidates = [], jobs = [], tasks = [], callbacks = [], followups = [] } = snapshot
  const today = todayStr()

  const openJobs = jobs.filter(j => (j.status || 'Open') === 'Open')
  const activeCandidates = candidates.filter(c => !['Hired', 'Rejected', 'Withdrew'].includes(c.internal_status))
  const submittedToday = candidates.filter(c => (c.submission_date || '').slice(0, 10) === today)
  const interviews = candidates.filter(c => c.internal_status === 'Interview Scheduled')
  const offers = candidates.filter(c => c.internal_status === 'Offer Extended')
  // Matches the same "hired" check used everywhere else in the app (Admin,
  // Dashboard, Reports placement counts) — a candidate counts as hired if
  // EITHER status field says so. Checking internal_status alone (as this
  // used to) let the topbar celebrate candidates the actual Pipeline board
  // (which is driven by external_status) doesn't show as hired at all.
  const recentHires = candidates
    .filter(c => (c.external_status === 'Hired' || c.internal_status === 'Hired') && hoursSince(c.updated_at) <= 72)
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
  const tasksDueToday = tasks.filter(t => t.status !== 'Completed' && t.due_date === today)
  const callbacksToday = callbacks.filter(cb => cb.date === today)
  const overdueFollowups = followups.filter(f => f.status !== 'done' && f.date && f.date < today)
  const highPriorityCandidates = activeCandidates.filter(c => c.priority === 'High')
  const staleJobs = openJobs.filter(j => {
    const opened = j.open_date || j.created_at
    if (!opened) return false
    const days = (Date.now() - new Date(opened).getTime()) / 86400000
    const subs = candidates.filter(c => c.job_id === j.job_id).length
    return days > 14 && subs < 3
  })

  if (openJobs.length) insights.push({ emoji: '💼', text: `${plural(openJobs.length, 'open job')} hiring right now`, path: 'jobs' })
  if (activeCandidates.length) insights.push({ emoji: '👥', text: `${plural(activeCandidates.length, 'candidate')} active in the pipeline`, path: 'candidates' })
  if (submittedToday.length) insights.push({ emoji: '📥', text: `${plural(submittedToday.length, 'new candidate')} submitted today`, path: 'candidates' })
  if (interviews.length) insights.push({ emoji: '🗓️', text: `${plural(interviews.length, 'interview')} scheduled`, path: 'pipeline' })
  if (offers.length) insights.push({ emoji: '📝', text: `${plural(offers.length, 'offer')} out, awaiting reply`, path: 'pipeline' })
  if (tasksDueToday.length) insights.push({ emoji: '✅', text: `${plural(tasksDueToday.length, 'task')} due today`, path: 'tasks' })
  if (callbacksToday.length) insights.push({ emoji: '📞', text: `${plural(callbacksToday.length, 'callback')} on today's schedule`, path: 'callbacks' })
  if (overdueFollowups.length) insights.push({ emoji: '⏰', text: `${plural(overdueFollowups.length, 'follow-up')} overdue`, path: 'followups' })
  if (highPriorityCandidates.length) insights.push({ emoji: '🔥', text: `${plural(highPriorityCandidates.length, 'high-priority candidate')} need attention`, path: 'candidates' })
  if (staleJobs.length) {
    const job = staleJobs[0]
    const days = Math.floor((Date.now() - new Date(job.open_date || job.created_at).getTime()) / 86400000)
    insights.push({ emoji: '🐌', text: `'${job.title}' has been open ${days} days — needs love`, path: 'jobs' })
  }
  // Every recent hire gets its own hire-event insight (not just the latest)
  // so the robot's walk-over "YOU'RE HIRED!" moment rotates through all of
  // them instead of only ever celebrating the single most-recent hire.
  recentHires.slice(0, 8).forEach(c => {
    const name = `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'A candidate'
    insights.push({
      emoji: '🎉', text: `${name} was hired for ${c.job_title || 'a role'}!`, path: 'candidates',
      isHireEvent: true, candidate: c,
    })
  })

  if (insights.length === 0) {
    insights.push({ emoji: '🌱', text: 'Workspace is empty — post your first job to get started', path: 'jobs' })
  }

  return insights
}

// Several phrasings per stage so the applicant bot doesn't always repeat the
// same "Name: Stage for Role" template — one is picked per candidate.
const STAGE_PHRASES = {
  'Pending': (name, job) => [`${name} just applied for ${job}`, `${name}: application pending for ${job}`, `${name} is waiting to hear back about ${job}`],
  'Submitted': (name, job) => [`${name} was submitted for ${job}`, `${name}: freshly submitted for ${job}`, `${name} is in the queue for ${job}`],
  'Shortlisted': (name, job) => [`${name} made the shortlist for ${job}! ⭐`, `${name}: shortlisted for ${job}`, `${name} is on the shortlist for ${job}`],
  'Interview Scheduled': (name, job) => [`${name} has an interview lined up for ${job}`, `${name}: interview scheduled for ${job}`, `${name} is prepping to interview for ${job}`],
  'Interview Done': (name, job) => [`${name} just wrapped up an interview for ${job}`, `${name}: interview done for ${job}`, `${name} is waiting on interview feedback for ${job}`],
  'Offer Extended': (name, job) => [`${name} has an offer on the table for ${job}!`, `${name}: offer extended for ${job}`, `${name} is deciding on an offer for ${job}`],
  'On Hold': (name, job) => [`${name}'s application for ${job} is on hold`, `${name}: on hold for ${job}`, `${name} is waiting things out for ${job}`],
}

export function buildApplicantInsights(snapshot) {
  if (!snapshot) return []
  const { candidates = [] } = snapshot
  return candidates
    .filter(c => !['Hired', 'Rejected', 'Withdrew'].includes(c.internal_status))
    .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))
    .slice(0, 15)
    .map(c => {
      const name = (c.first_name || 'A candidate').trim()
      const stage = c.internal_status || 'Pending'
      const job = c.job_title || 'a role'
      const emoji = STAGE_EMOJI[stage] || '📄'
      const phrases = (STAGE_PHRASES[stage] || STAGE_PHRASES['Pending'])(name, job)
      const text = phrases[Math.floor(Math.random() * phrases.length)]
      return { emoji, text }
    })
}

export function useTopBarInsights({ unreadCount = 0, userName = '' } = {}) {
  const [snapshot, setSnapshot] = useState(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const snap = await fetchWorkspaceSnapshot()
        if (!cancelled) setSnapshot(snap)
      } catch {
        // Network hiccup — bots just keep narrating the last snapshot they had.
      }
    }
    load()
    const interval = setInterval(load, POLL_MS)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  const robotInsights = useMemo(
    () => buildRobotInsights(snapshot, { unreadCount, userName }),
    [snapshot, unreadCount, userName]
  )
  const applicantInsights = useMemo(() => buildApplicantInsights(snapshot), [snapshot])

  return { robotInsights, applicantInsights }
}
