// Real, deterministic job-health computation shared by Dashboard's Requisition
// Health panel and the Job Workspace — derived entirely from candidates whose
// job_id exactly matches this job, so a given job shows identical numbers
// everywhere. Nothing here is AI-generated or fabricated.
export function computeJobHealth(job, candidates) {
  const now = new Date().getTime()
  const jobCandidates = job.job_id ? candidates.filter(c => c.job_id === job.job_id) : []
  const submittals = jobCandidates.length
  const interviews = jobCandidates.filter(c => ['Interview Scheduled', 'Interview Done'].includes(c.internal_status || c.external_status)).length
  const offers = jobCandidates.filter(c => (c.internal_status || c.external_status) === 'Offer Extended').length
  const hires = jobCandidates.filter(c => (c.internal_status || c.external_status) === 'Hired').length
  const rejected = jobCandidates.filter(c => (c.internal_status || c.external_status) === 'Rejected').length
  const withdrawn = jobCandidates.filter(c => (c.internal_status || c.external_status) === 'Withdrew').length

  const openedAt = job.open_date || job.created_at
  const openDays = openedAt ? Math.max(0, Math.floor((now - new Date(openedAt).getTime()) / 86400000)) : 0

  // Deterministic placement-probability heuristic from this job's real funnel conversion
  const placementScore = submittals === 0
    ? 15
    : Math.min(95, Math.round(((interviews * 12 + offers * 25 + hires * 40) / submittals) + 20))

  const isStale = openDays > 14 && submittals < 3
  const priority = isStale ? 'Urgent' : (job.priority || 'Medium')

  let statusTag = 'Healthy'
  let statusTone = 'green'
  if (isStale || placementScore < 30) {
    statusTag = 'Critical'
    statusTone = 'red'
  } else if (submittals < 3 || placementScore < 55) {
    statusTag = 'At Risk'
    statusTone = 'amber'
  }

  return {
    priority,
    openDays,
    submittals,
    interviews,
    offers,
    hires,
    rejected,
    withdrawn,
    placementScore,
    placementProb: `${placementScore}%`,
    statusTag,
    statusTone,
  }
}
