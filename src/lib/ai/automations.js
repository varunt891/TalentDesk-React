// AI Automation (Phase 5.4) — reusable automation definitions, not backend
// schedulers. Each automation is pure data: a content-builder function that
// turns the real workspace snapshot (Phase 5.1's fetchWorkspaceSnapshot)
// into the same {content, context} shape the shared Action Framework
// already takes. "Running" an automation is just calling runAiAction with
// that output — no new prompt logic, no new AI pathway. Ready to be
// triggered on a schedule later without any change to this file.
import { computeJobHealth } from '../jobHealth'

const todayStr = () => new Date().toISOString().slice(0, 10)
const fmt = (value) => JSON.stringify(value)

export const AUTOMATIONS = [
  {
    id: 'daily_briefing',
    label: 'Daily Recruiter Briefing',
    icon: 'sparkles',
    description: "A short briefing of what needs attention today.",
    actionId: 'recommend',
    buildContent: (snap) => {
      const today = todayStr()
      const tasksDue = snap.tasks.filter(t => t.status !== 'Completed' && t.due_date && t.due_date <= today)
      const callbacksToday = snap.callbacks.filter(cb => cb.date === today)
      const overdueFollowups = snap.followups.filter(f => f.status !== 'done' && f.date && f.date < today)
      return {
        content: [
          `Tasks due today or overdue: ${tasksDue.length}`,
          `Callbacks scheduled today: ${callbacksToday.length}`,
          `Overdue follow-ups: ${overdueFollowups.length}`,
          `Tasks: ${fmt(tasksDue.slice(0, 15).map(t => ({ title: t.title, category: t.category, priority: t.priority })))}`,
          `Callbacks: ${fmt(callbacksToday.slice(0, 15).map(c => ({ candidate: c.candidate_name, time: c.time })))}`,
        ].join('\n'),
        context: 'Give a 3-4 sentence daily briefing: what to prioritize first, what is at risk, and a realistic plan of attack for today.',
      }
    },
  },
  {
    id: 'jobs_attention',
    label: 'Jobs Requiring Attention',
    icon: 'jobs',
    description: 'Open jobs that are stalling or under-resourced.',
    actionId: 'analyze',
    buildContent: (snap) => {
      const openJobs = snap.jobs.filter(j => (j.status || 'Open') === 'Open')
      const withHealth = openJobs.map(j => ({ job: j, health: computeJobHealth(j, snap.candidates) }))
      const atRisk = withHealth.filter(({ health }) => health.statusTag === 'Critical' || health.statusTag === 'At Risk')
      return {
        content: `${atRisk.length} of ${openJobs.length} open jobs are at risk or critical.\n${fmt(atRisk.slice(0, 15).map(({ job, health }) => ({ title: job.title, client: job.client, status: health.statusTag, submittals: health.submittals, openDays: health.openDays })))}`,
        context: 'For each job, briefly explain why it needs attention and suggest one concrete next step. Be specific and concise.',
      }
    },
  },
  {
    id: 'followup_suggestions',
    label: 'Candidate Follow-up Suggestions',
    icon: 'followups',
    description: 'Candidates overdue for contact and what to say.',
    actionId: 'recommend',
    buildContent: (snap) => {
      const today = todayStr()
      const overdue = snap.candidates.filter(c => c.followup_date && c.followup_date <= today && !['Hired', 'Rejected'].includes(c.internal_status))
      return {
        content: `${overdue.length} candidates overdue for follow-up.\n${fmt(overdue.slice(0, 15).map(c => ({ name: `${c.first_name || ''} ${c.last_name || ''}`.trim(), status: c.internal_status, followup_date: c.followup_date, job_title: c.job_title })))}`,
        context: 'For the top 5 most overdue, suggest a specific follow-up action and talking point for each.',
      }
    },
  },
  {
    id: 'pipeline_health',
    label: 'Pipeline Health Summary',
    icon: 'pipeline',
    description: 'Overall pipeline distribution and risk.',
    actionId: 'summarize',
    buildContent: (snap) => {
      const stageCounts = {}
      snap.candidates.forEach(c => { stageCounts[c.external_status || 'Unknown'] = (stageCounts[c.external_status || 'Unknown'] || 0) + 1 })
      return {
        content: `Total candidates: ${snap.candidates.length}\nStage distribution: ${fmt(stageCounts)}`,
        context: 'Summarize pipeline health in 3-4 sentences: where candidates are concentrated, any bottleneck stages, and overall momentum.',
      }
    },
  },
  {
    id: 'overdue_tasks',
    label: 'Overdue Task Summary',
    icon: 'tasks',
    description: 'What is overdue and how to catch up.',
    actionId: 'recommend',
    buildContent: (snap) => {
      const today = todayStr()
      const overdue = snap.tasks.filter(t => t.status !== 'Completed' && t.due_date && t.due_date < today)
      return {
        content: `${overdue.length} overdue tasks.\n${fmt(overdue.slice(0, 15).map(t => ({ title: t.title, category: t.category, priority: t.priority, due_date: t.due_date, assigned_to: t.assigned_to_name })))}`,
        context: 'Suggest a realistic order to clear this backlog, grouping by priority and quick wins first.',
      }
    },
  },
  {
    id: 'weekly_summary',
    label: 'Weekly Recruiting Summary',
    icon: 'reports',
    description: 'Submissions, interviews, offers, and hires this week.',
    actionId: 'analyze',
    buildContent: (snap) => {
      const weekAgoMs = new Date().getTime() - 7 * 86400000
      const inWindow = (dateStr) => Boolean(dateStr) && new Date(dateStr).getTime() >= weekAgoMs
      const submissions = snap.candidates.filter(c => inWindow(c.submission_date))
      const interviews = snap.candidates.filter(c => ['Interview Scheduled', 'Interview Done'].includes(c.external_status) && inWindow(c.updated_at))
      const offers = snap.candidates.filter(c => c.external_status === 'Offer Extended' && inWindow(c.updated_at))
      const hires = snap.candidates.filter(c => c.external_status === 'Hired' && inWindow(c.updated_at))
      return {
        content: `This week: ${submissions.length} submissions, ${interviews.length} interviews in progress, ${offers.length} offers extended, ${hires.length} hires.`,
        context: 'Write a short weekly recruiting summary highlighting momentum and any notable wins or gaps.',
      }
    },
  },
  {
    id: 'hiring_progress',
    label: 'Hiring Progress Summary',
    icon: 'checkCircle',
    description: 'Overall placement progress across all open jobs.',
    actionId: 'summarize',
    buildContent: (snap) => {
      const openJobs = snap.jobs.filter(j => (j.status || 'Open') === 'Open')
      const filled = snap.jobs.filter(j => j.status === 'Filled')
      const hires = snap.candidates.filter(c => c.external_status === 'Hired')
      return {
        content: `Open jobs: ${openJobs.length}. Filled jobs: ${filled.length}. Total hires recorded: ${hires.length}.`,
        context: 'Summarize overall hiring progress and placement rate in 2-3 sentences.',
      }
    },
  },
]

export function getAutomation(id) {
  return AUTOMATIONS.find(a => a.id === id) || AUTOMATIONS[0]
}
