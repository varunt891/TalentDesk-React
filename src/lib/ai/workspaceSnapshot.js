// AI Context Awareness — gives the Copilot real, live workspace data
// (rather than requiring the recruiter to explain everything) by fetching
// a lightweight snapshot and serializing a token-budget-capped summary of
// it into the prompt, the same "real data only" pattern already used by
// Dashboard's candidate/job context lists.
import { ensureArray } from '../candidateHealth'
import { db } from '../api'

const todayStr = () => new Date().toISOString().slice(0, 10)

export async function fetchWorkspaceSnapshot() {
  const [candRes, jobsRes, tasksRes, cbRes, fuRes] = await Promise.all([
    db.from('candidates').select('*'),
    db.from('jobs').select('*'),
    db.from('tasks').select('*'),
    db.from('callbacks').select('*'),
    db.from('followups').select('*'),
  ])
  return {
    candidates: candRes.data || [],
    jobs: jobsRes.data || [],
    tasks: tasksRes.data || [],
    callbacks: cbRes.data || [],
    followups: fuRes.data || [],
    fetchedAt: new Date().toISOString(),
  }
}

function compactCandidate(c) {
  return {
    name: `${c.first_name || ''} ${c.last_name || ''}`.trim(),
    job_title: c.job_title, job_id: c.job_id, client: c.client,
    internal_status: c.internal_status, external_status: c.external_status,
    priority: c.priority, recruiter: c.recruiter_name,
    skills: ensureArray(c.skills).slice(0, 6),
    submission_date: c.submission_date, updated_at: c.updated_at, location: c.location,
  }
}
function compactJob(j) {
  return {
    title: j.title, job_id: j.job_id, client: j.client, status: j.status,
    priority: j.priority, location: j.location, skills: ensureArray(j.skills).slice(0, 8), open_date: j.open_date,
  }
}

// Formats the snapshot into a compact text block appended to the Copilot
// prompt as "WORKSPACE CONTEXT". Lists are capped so a large org's data
// doesn't blow the model's context window.
export function buildWorkspaceContextText(snapshot, meta = {}) {
  const today = todayStr()
  const activeCandidates = snapshot.candidates.filter(c => !['Hired', 'Rejected'].includes(c.internal_status))
  const openJobs = snapshot.jobs.filter(j => (j.status || 'Open') === 'Open')
  const tasksDue = snapshot.tasks.filter(t => t.status !== 'Completed' && t.due_date && t.due_date <= today)
  const callbacksToday = snapshot.callbacks.filter(cb => cb.date === today)
  const overdueFollowups = snapshot.followups.filter(f => f.status !== 'done' && f.date && f.date < today)

  return [
    `Organization: ${meta.orgName || 'Unknown'}`,
    `Recruiter: ${meta.userName || 'Unknown'} (${meta.role || 'recruiter'})`,
    `Current page: ${meta.currentPage || 'unknown'}`,
    ...(meta.pageContext && Object.keys(meta.pageContext).length ? [`Current page context (what the recruiter is looking at right now): ${JSON.stringify(meta.pageContext)}`] : []),
    ...(meta.behaviorInstruction ? [`Response style preference (from AI Settings): ${meta.behaviorInstruction}`] : []),
    `Snapshot as of: ${snapshot.fetchedAt}`,
    `Totals: ${snapshot.candidates.length} candidates (${activeCandidates.length} active), ${snapshot.jobs.length} jobs (${openJobs.length} open), ${tasksDue.length} tasks due, ${callbacksToday.length} callbacks today, ${overdueFollowups.length} overdue follow-ups.`,
    `Open Jobs: ${JSON.stringify(openJobs.slice(0, 40).map(compactJob))}`,
    `Active Candidates: ${JSON.stringify(activeCandidates.slice(0, 60).map(compactCandidate))}`,
    `Tasks Due: ${JSON.stringify(tasksDue.slice(0, 20).map(t => ({ title: t.title, category: t.category, assigned_to: t.assigned_to_name, due_date: t.due_date, priority: t.priority })))}`,
    `Callbacks Today: ${JSON.stringify(callbacksToday.slice(0, 20).map(cb => ({ candidate: cb.candidate_name, time: cb.time, status: cb.status })))}`,
    `Overdue Follow-ups: ${JSON.stringify(overdueFollowups.slice(0, 20).map(f => ({ candidate: f.candidate_name, due: f.date, priority: f.priority })))}`,
  ].join('\n')
}
