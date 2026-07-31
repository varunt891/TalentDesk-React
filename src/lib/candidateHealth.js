// Real, deterministic candidate-health computation shared by the Candidate
// Workspace and Pipeline Workspace, so a given candidate shows the same
// score/status color everywhere. Nothing here is AI-generated or fabricated.

export function ensureArray(val) {
  if (Array.isArray(val)) return val
  if (typeof val === 'string') {
    try {
      const parsed = JSON.parse(val)
      if (Array.isArray(parsed)) return parsed
    } catch {
      if (val.trim()) return val.split(',').map(s => s.trim()).filter(Boolean)
    }
  }
  return []
}

// Candidates' own status vocabulary (10 statuses) is richer than any generic
// guess StatusPill could make from the label alone, so we resolve tone here.
export const STATUS_TONE = {
  'Hired': 'green', 'Interview Scheduled': 'accent', 'Interview Done': 'ai', 'Offer Extended': 'green',
  'Submitted': 'accent', 'Shortlisted': 'orange', 'Rejected': 'red', 'On Hold': 'orange',
  'Withdrew': 'neutral', 'Pending': 'neutral',
}

export function computeScore(c) {
  const fields = ['first_name', 'last_name', 'email', 'phone', 'location', 'work_auth', 'experience', 'linkedin', 'submission_date', 'job_id', 'job_title', 'client', 'rate', 'fe_name', 'fe_extension', 'recruiter_name']
  const filled = fields.filter(f => c[f] && String(c[f]).trim() !== '').length
  const completeness = Math.round((filled / fields.length) * 25)
  const candSkills = ensureArray(c.skills)
  const skillCount = candSkills.length
  const skillScore = skillCount === 0 ? 0 : skillCount >= 8 ? 25 : skillCount >= 5 ? 20 : skillCount >= 3 ? 14 : 8
  const statusScores = { 'Pending': 0, 'Submitted': 8, 'Shortlisted': 14, 'Interview Scheduled': 20, 'Interview Done': 24, 'Offer Extended': 28, 'Hired': 30, 'Rejected': 4, 'On Hold': 5, 'Withdrew': 3 }
  const statusScore = statusScores[c.internal_status] || 0
  let recencyScore = 0
  if (c.submission_date) {
    const days = (Date.now() - new Date(c.submission_date).getTime()) / (1000 * 60 * 60 * 24)
    recencyScore = days <= 7 ? 20 : days <= 14 ? 16 : days <= 30 ? 12 : days <= 60 ? 6 : 2
  }
  const total = completeness + skillScore + statusScore + recencyScore
  const grade = total >= 80 ? 'excellent' : total >= 60 ? 'good' : total >= 40 ? 'fair' : 'weak'
  const gradeColor = total >= 80 ? '#1af0a0' : total >= 60 ? '#7eb8ff' : total >= 40 ? 'var(--yellow)' : 'var(--red)'
  const gradeLabel = total >= 80 ? 'Excellent' : total >= 60 ? 'Good' : total >= 40 ? 'Fair' : 'Weak'
  const insights = []
  if (!c.email) insights.push({ type: 'warn', text: 'Missing email' })
  if (!c.phone) insights.push({ type: 'warn', text: 'Missing phone' })
  if (skillCount === 0) insights.push({ type: 'bad', text: 'No skills listed' })
  else if (skillCount >= 5) insights.push({ type: 'good', text: `${skillCount} skills listed` })
  if (c.linkedin) insights.push({ type: 'good', text: 'LinkedIn present' })
  if (c.internal_status === 'Hired') insights.push({ type: 'good', text: 'Successfully placed!' })
  if (c.internal_status === 'Interview Scheduled') insights.push({ type: 'good', text: 'Interview booked' })
  if (c.feedback_status === 'Positive') insights.push({ type: 'good', text: 'Positive feedback' })
  if (c.priority === 'High') insights.push({ type: 'warn', text: 'High priority' })
  if (!c.followup_date) insights.push({ type: 'warn', text: 'No follow-up set' })
  return { total, grade, gradeColor, gradeLabel, insights, completeness, skillScore, statusScore, recencyScore }
}
