import { Avatar, Badge, Button, Icon, StatusPill } from '../ui'
import MarkdownView from '../MarkdownView'
import { ensureArray } from '../../lib/candidateHealth'

function displayDate(value) {
  if (!value) return 'Not recorded'
  const date = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function JobPreviewOverview({ job, health, candidates, assignees, updatedLabel, lastActivity, onCandidate, onPipeline, onExpandDescription }) {
  const skills = [...new Set(ensureArray(job.skills))]
  const candidateRow = candidate => (
    <button type="button" className="job-preview-person" key={candidate.id} onClick={() => onCandidate(candidate)}>
      <Avatar name={[candidate.first_name, candidate.last_name].filter(Boolean).join(' ') || 'Candidate'} size="sm" />
      <span className="job-preview-person-copy"><strong>{[candidate.first_name, candidate.last_name].filter(Boolean).join(' ') || 'Unnamed candidate'}</strong><small>{candidate.job_title || candidate.email || 'Candidate profile'}</small></span>
      <StatusPill status={candidate.internal_status || 'Pending'} size="sm" />
      <Icon name="chevronRight" size={13} />
    </button>
  )

  return (
    <div className="job-preview-overview">
      <div className="job-preview-updated"><Icon name="clock" size={12} /><span>{updatedLabel ? `Updated ${updatedLabel}` : 'Update time not recorded'}</span><span>{health.openDays} days open</span></div>

      <section className="job-preview-section" aria-labelledby="job-preview-role-title">
        <div className="job-preview-section-heading"><h3 id="job-preview-role-title">Role details</h3><Badge tone={job.priority === 'Urgent' ? 'red' : job.priority === 'High' ? 'orange' : 'neutral'}>{job.priority || 'Medium'} priority</Badge></div>
        <dl className="job-preview-facts">
          {[
            ['Location', 'building', job.location], ['Employment', 'jobs', job.type],
            ['Rate', 'reports', job.rate], ['Recruiter', 'users', assignees.join(', ')],
            ['Opened', 'calendar', displayDate(job.open_date)], ['Work mode', 'layers', job.work_mode],
          ].map(([label, icon, value]) => <div key={label}><dt><Icon name={icon} size={13} />{label}</dt><dd>{value || 'Not recorded'}</dd></div>)}
        </dl>
      </section>

      <section className="job-preview-section job-preview-hiring" aria-labelledby="job-preview-hiring-title">
        <div className="job-preview-section-heading"><h3 id="job-preview-hiring-title">Hiring snapshot</h3><StatusPill status={health.statusTag} tone={health.statusTone === 'amber' ? 'yellow' : health.statusTone} size="sm" /></div>
        <div className="job-preview-stats">{[['Submittals', health.submittals], ['Interviews', health.interviews], ['Offers', health.offers], ['Placed', health.hires]].map(([label, value]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
        <details className="job-preview-health-details"><summary>Health details <Icon name="chevronDown" size={12} /></summary><p>Last activity: {lastActivity}. Pipeline indicator: <strong>{health.placementProb}</strong>.</p><p>This rule-based indicator uses recorded recruiting stages; it is not a verified placement probability.</p></details>
      </section>

      <section className="job-preview-section" aria-labelledby="job-preview-skills-title">
        <div className="job-preview-section-heading"><h3 id="job-preview-skills-title">Required skills</h3><span>{skills.length} listed</span></div>
        <div className="job-preview-skills">{skills.length ? skills.map(skill => <Badge key={skill} tone="neutral">{skill}</Badge>) : <p className="job-preview-empty">No skills recorded for this requisition.</p>}</div>
      </section>

      <section className="job-preview-section" aria-labelledby="job-preview-people-title">
        <div className="job-preview-section-heading"><h3 id="job-preview-people-title">Submitted candidates <span>{candidates.length}</span></h3><Button size="sm" variant="ghost" rightIcon="arrowUpRight" onClick={onPipeline}>View pipeline</Button></div>
        {candidates.length ? <div className="job-preview-people">{candidates.slice(0, 4).map(candidateRow)}{candidates.length > 4 && <details className="job-preview-more"><summary>View {candidates.length - 4} more candidates</summary>{candidates.slice(4).map(candidateRow)}</details>}</div> : <p className="job-preview-empty">No candidates have been submitted to this requisition yet.</p>}
      </section>

      {job.description && <section className="job-preview-section" aria-labelledby="job-preview-description-title"><div className="job-preview-section-heading"><h3 id="job-preview-description-title">Position overview</h3><Button size="sm" variant="ghost" rightIcon="arrowUpRight" onClick={onExpandDescription}>Read full description</Button></div><div className="job-preview-description"><MarkdownView content={job.description} /></div></section>}
      {job.notes && <details className="job-preview-section job-preview-remarks"><summary>Internal remarks <Icon name="chevronDown" size={13} /></summary><div><MarkdownView content={job.notes} /></div></details>}
    </div>
  )
}
