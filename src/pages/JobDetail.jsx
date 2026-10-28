import { formatRecordDate } from '../lib/formatRecordDate'
import { hasPermission } from '../lib/admin/permissions'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { db, apiRequest } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useAIGovernance } from '../lib/ai/governance'
import { useJobForm } from '../hooks/useJobForm'
import JobFormDrawer from '../components/jobs/JobFormDrawer'
import { PageContainer } from '../components/layout/PageContainer'
import {
  Button, Badge, StatusPill, Card, CardHeader, Table, Textarea,
  EmptyState, Avatar, Icon, useToast, Skeleton, PageSpinner,
} from '../components/ui'
import MarkdownView from '../components/MarkdownView'
import { ensureArray, STATUS_TONE } from '../lib/candidateHealth'
import { computeJobHealth } from '../lib/jobHealth'

const STATUS_TONE_JOB = { Open: 'green', Filled: 'accent', 'On Hold': 'yellow', Closed: 'neutral' }

function relativeTime(iso) {
  if (!iso) return ''
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
}

function InfoRow({ label, value }) {
  return (
    <div className="job-detail-field">
      <span className="job-detail-field-label">{label}</span>
      <span className="job-detail-field-value">{value !== null && value !== undefined && value !== '' ? value : <span className="text-text3">Not recorded</span>}</span>
    </div>
  )
}

export default function JobDetail({ jobId, onNavigate }) {
  const { user, organization, profile } = useAuth()
  const orgId = organization?.id || profile?.org_id
  const canEdit = hasPermission(profile?.role, 'Jobs', 'edit')
  const canUseAI = hasPermission(profile?.role, 'AI', 'edit')
  const userId = user?.id
  const { settings: aiSettings } = useAIGovernance(orgId)
  const aiEnabled = canUseAI && aiSettings.workspaces.jobs !== false
  const [job, setJob] = useState(null)
  const [candidates, setCandidates] = useState([])
  const [profiles, setProfiles] = useState([])
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [remarks, setRemarks] = useState('')
  const [savingRemarks, setSavingRemarks] = useState(false)
  const [remarksEditing, setRemarksEditing] = useState(false)
  const [activeView, setActiveView] = useState('overview')
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)
  const { toast } = useToast()

  const load = useCallback(async () => {
    if (!jobId) return
    setLoading(true)
    setNotFound(false)
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)
    let jobsQuery = db.from('jobs').select('*').param('all_owners', 'true')
    if (isUuid) {
      jobsQuery = jobsQuery.eq('id', jobId)
    } else {
      jobsQuery = jobsQuery.eq('job_id', jobId)
    }

    const [jobsRes, profilesRes] = await Promise.all([
      jobsQuery,
      db.from('profiles').select('*'),
    ])
    let found = (jobsRes.data || [])[0]
    if (!found && isUuid) {
      const fallbackRes = await db.from('jobs').select('*').eq('job_id', jobId).param('all_owners', 'true')
      found = (fallbackRes.data || [])[0]
    }
    setProfiles(profilesRes.data || [])

    if (!found) {
      setJob(null)
      setNotFound(true)
      setLoading(false)
      return
    }
    setJob(found)
    setRemarks(found.notes || '')

    if (found.job_id) {
      const [candsRes, actRes] = await Promise.all([
        db.from('candidates').select('*').eq('job_id', found.job_id).param('all_owners', 'true'),
        db.from('activity_logs').select('*'),
      ])
      const cands = candsRes.data || []
      setCandidates(cands)
      const candIds = new Set(cands.map(c => c.id))
      const relevant = (actRes.data || [])
        .filter(a => (a.entity === 'jobs' && a.entity_id === found.id) || (a.entity === 'candidates' && candIds.has(a.entity_id)))
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      setActivity(relevant)
    } else {
      setCandidates([])
      setActivity([])
    }
    setLoading(false)
  }, [jobId])

  useEffect(() => { load() }, [load])

  const assignedIds = useMemo(() => (Array.isArray(job?.assigned_to) ? job.assigned_to : []), [job])
  const assignedProfiles = useMemo(() => assignedIds.map(id => profiles.find(p => p.id === id)).filter(Boolean), [assignedIds, profiles])
  // Legacy jobs created before assigned_to existed only have the free-text
  // fe field — show it as a plain read-only fallback, never fuzzy-matched
  // back to a real profile (that matching was fragile and broke on renames).
  const legacyFe = assignedProfiles.length === 0 ? job?.fe : null
  const health = useMemo(() => job ? computeJobHealth(job, candidates) : null, [job, candidates])
  const notesRollup = useMemo(() => candidates.filter(c => c.notes && c.notes.trim()), [candidates])

  const jobForm = useJobForm({ jobs: job ? [job] : [], fetchJobs: load, profile, user, orgId, userId, aiEnabled })
  const showFormToast = (msg, type) => toast({ tone: type === 'error' ? 'error' : 'success', title: msg })

  const saveRemarks = async () => {
    if (!job) return
    setSavingRemarks(true)
    try {
      const { data } = await apiRequest(`/data/jobs/${job.id}/remarks`, { method: 'PATCH', body: { notes: remarks } })
      setJob(j => ({ ...j, notes: data.notes }))
      setRemarksEditing(false)
      toast({ tone: 'success', title: 'Remarks saved' })
    } catch (err) {
      toast({ tone: 'error', title: 'Failed to save remarks', description: err.message })
    } finally {
      setSavingRemarks(false)
    }
  }

  if (loading) {
    return (
      <PageContainer>
        <Skeleton className="h-10 w-72 mb-4" />
        <PageSpinner />
      </PageContainer>
    )
  }

  if (notFound || !job) {
    return (
      <PageContainer>
        <EmptyState
          icon="jobs"
          title="Job not found"
          description="This job may have been deleted, or you don't have access to it."
          actionLabel="Back to Jobs"
          onAction={() => onNavigate?.('jobs')}
        />
      </PageContainer>
    )
  }

  const submissionColumns = [
    {
      key: 'name', header: 'Candidate', width: 200, sortable: true, sortValue: (c) => `${c.last_name || ''} ${c.first_name || ''}`,
      render: (c) => (
        <span className="flex items-center gap-2 min-w-0">
          <Avatar name={`${c.first_name || ''} ${c.last_name || ''}`.trim() || '?'} size="xs" className="shrink-0" />
          <span className="min-w-0">
            <button type="button" className="job-detail-candidate-name" onClick={() => onNavigate?.('candidate_detail', { candidateId: c.id })}>{c.first_name} {c.last_name}</button>
            <small className="block text-[11px] text-text3 truncate leading-tight">{c.email || 'No email'}</small>
          </span>
        </span>
      ),
    },
    { key: 'recruiter_name', header: 'Recruiter', render: (c) => c.recruiter_name || <span className="text-text3">—</span> },
    { key: 'internal_status', header: 'Internal', render: (c) => <StatusPill status={c.internal_status || 'Pending'} tone={STATUS_TONE[c.internal_status] || 'neutral'} size="sm" /> },
    { key: 'external_status', header: 'Client Status', render: (c) => <StatusPill status={c.external_status || 'Pending'} tone={STATUS_TONE[c.external_status] || 'neutral'} size="sm" /> },
    { key: 'submission_date', header: 'Submitted', render: (c) => c.submission_date || '—' },
  ]

  const dateLabel = value => formatRecordDate(value, organization?.date_format)
  const hasLongDescription = (job.description || '').length > 1000
  const overviewFields = [
    ['Location', job.location], ['Work mode', job.work_mode], ['Employment type', job.type],
    ['Experience level', job.experience_level], ['Openings', job.openings], ['Open date', dateLabel(job.open_date)],
  ]
  const additionalFields = [
    ['Job ID', job.job_id], ['Optional reference', job.optional_ref], ['Workers comp code', job.workers_comp_code],
    ['End date', dateLabel(job.end_date)], ['Submittal due', dateLabel(job.submittal_due)], ['Max allowed submittals', job.max_submittals],
  ]

  return (
    <PageContainer className="job-detail-page">
      <div className="job-detail-breadcrumb"><Button size="sm" variant="ghost" leftIcon="chevronLeft" onClick={() => onNavigate?.('jobs')}>Back to Jobs</Button><span aria-hidden="true">/</span><span className="job-detail-reference">{job.job_id || 'Job requisition'}</span>{job.updated_at && <span className="job-detail-updated">Updated {relativeTime(job.updated_at)}</span>}</div>
      <header className="job-detail-header">
        <div className="job-detail-identity"><span className="job-detail-eyebrow">JOB REQUISITION</span><div className="job-detail-title"><h1>{job.title || 'Untitled role'}</h1><StatusPill status={job.status || 'Open'} tone={STATUS_TONE_JOB[job.status] || 'neutral'} size="sm" /></div><div className="job-detail-meta"><span><Icon name="building" size={13} />{job.client || 'Client not recorded'}</span><span>{job.location || 'Location not recorded'}</span>{job.work_mode && <span>{job.work_mode}</span>}<Badge tone={job.priority === 'Urgent' ? 'red' : job.priority === 'High' ? 'orange' : 'neutral'}>{job.priority || 'Medium'} priority</Badge></div></div>
        {canEdit && <Button variant="primary" leftIcon="edit" onClick={() => jobForm.openEdit(job)}>Edit Job</Button>}
      </header>

      <section className="job-detail-summary" aria-label="Hiring snapshot">{[
        ['Submissions', health.submittals, 'Recorded candidate submissions'], ['Interviews', health.interviews, 'Scheduled or completed'],
        ['Offers', health.offers, 'Recorded offers extended'], ['Hires', job.openings ? `${health.hires} / ${job.openings}` : health.hires, job.openings ? `${job.openings} openings on this requisition` : 'Recorded placements'],
      ].map(([label, value, helper]) => <div key={label}><span>{label}</span><strong>{value}</strong><small>{helper}</small></div>)}</section>

      <nav className="job-detail-views" aria-label="Job detail views">{[['overview', 'Overview', null], ['submissions', 'Submissions', candidates.length], ['activity', 'Activity', activity.length]].map(([id, label, count]) => <button type="button" key={id} aria-current={activeView === id ? 'page' : undefined} aria-controls="job-detail-content" onClick={() => setActiveView(id)}>{label}{count !== null && <span>{count}</span>}</button>)}</nav>

      <div className="job-detail-columns">
        <div id="job-detail-content" className="job-detail-content">
          {activeView === 'overview' && <>
            <Card className="job-detail-panel">
              <CardHeader title="Job Details" subtitle="Role essentials and hiring terms" />
              <div className="job-detail-fields">{overviewFields.map(([label, value]) => <InfoRow label={label} value={value} key={label} />)}</div>
              <div className="job-detail-compensation"><h3>Compensation</h3><div className="job-detail-fields">{job.bill_rate || job.pay_rate ? <><InfoRow label="Bill rate" value={job.bill_rate} /><InfoRow label="Pay rate" value={job.pay_rate} /></> : <InfoRow label="Rate" value={job.rate} />}</div></div>
              <details className="job-detail-additional"><summary>Additional requisition details <Icon name="chevronDown" size={13} /></summary><div className="job-detail-fields">{additionalFields.map(([label, value]) => <InfoRow key={label} label={label} value={value} />)}</div></details>
            </Card>
            <Card className="job-detail-panel job-detail-description-panel">
              <CardHeader title="Description & Skills" subtitle="The role and requirements shared with your team" />
              <div className="job-detail-skill-list">{ensureArray(job.skills).length ? ensureArray(job.skills).map((skill, index) => <Badge key={`${skill}-${index}`} tone="neutral">{skill}</Badge>) : <p className="job-detail-empty-copy">No required skills recorded.</p>}</div>
              <div id="job-description-content" className={`job-detail-description${hasLongDescription && !descriptionExpanded ? ' is-collapsed' : ''}`}>{job.description ? <MarkdownView content={job.description} /> : <p className="job-detail-empty-copy">No description yet.</p>}</div>
              {hasLongDescription && <Button size="sm" variant="ghost" rightIcon={descriptionExpanded ? 'chevronUp' : 'chevronDown'} aria-expanded={descriptionExpanded} aria-controls="job-description-content" onClick={() => setDescriptionExpanded(previous => !previous)}>{descriptionExpanded ? 'Show less' : 'Read full description'}</Button>}
            </Card>
          </>}

          {activeView === 'submissions' && <Card className="job-detail-panel job-detail-submissions"><CardHeader title="Submissions" subtitle={`${candidates.length} candidate${candidates.length === 1 ? '' : 's'} submitted to this requisition`} /><Table columns={submissionColumns} data={candidates} compact mobileCard={candidate => <div className="job-detail-mobile-candidate"><div><Avatar name={[candidate.first_name, candidate.last_name].filter(Boolean).join(' ') || 'Candidate'} size="sm" /><span><button type="button" className="job-detail-candidate-name" onClick={() => onNavigate?.('candidate_detail', { candidateId: candidate.id })}>{candidate.first_name} {candidate.last_name}</button><small>{candidate.email || 'Email not recorded'}</small></span></div><dl><div><dt>Recruiter</dt><dd>{candidate.recruiter_name || 'Not recorded'}</dd></div><div><dt>Internal</dt><dd><StatusPill status={candidate.internal_status || 'Pending'} tone={STATUS_TONE[candidate.internal_status] || 'neutral'} size="sm" /></dd></div><div><dt>Client status</dt><dd><StatusPill status={candidate.external_status || 'Pending'} tone={STATUS_TONE[candidate.external_status] || 'neutral'} size="sm" /></dd></div><div><dt>Submitted</dt><dd>{dateLabel(candidate.submission_date) || 'Not recorded'}</dd></div></dl></div>} emptyState={<EmptyState icon="users" title="No submissions yet" description="No candidate has been submitted to this job." />} /></Card>}

          {activeView === 'activity' && <Card className="job-detail-panel"><CardHeader title="Activity" subtitle="Recorded updates to this job and its submissions" />{activity.length === 0 ? <EmptyState icon="reports" title="No activity yet" description="Changes to this job or its candidates will show up here." /> : <div className="job-detail-timeline">{activity.slice(0, 50).map(entry => <div className="job-detail-timeline-item" key={entry.id}><span className="job-detail-timeline-icon"><Icon name={entry.action === 'created' ? 'plus' : entry.action === 'deleted' ? 'trash' : 'edit'} size={14} /></span><div><p><strong>{entry.actor_name || 'Someone'}</strong> {entry.action} {entry.entity === 'jobs' ? 'this job' : 'a candidate'}{entry.summary ? ` — ${entry.summary}` : ''}</p><time dateTime={entry.created_at}>{relativeTime(entry.created_at)}</time></div></div>)}</div>}</Card>}
        </div>

        <aside className="job-detail-sidebar" aria-label="Requisition team and notes">
          <Card className="job-detail-panel job-detail-team">
            <div className="job-detail-health-heading"><h3>Requisition health</h3><StatusPill status={health.statusTag} tone={health.statusTone === 'amber' ? 'yellow' : health.statusTone} size="sm" /></div>
            <div className="job-detail-health-meta"><span><Icon name="clock" size={13} />{health.openDays} days open</span><span>{job.openings !== null && job.openings !== undefined ? `${job.openings} openings` : 'Openings not recorded'}</span></div>
            <details className="job-detail-indicator"><summary>Pipeline indicator <span>{health.placementProb}<Icon name="chevronDown" size={12} /></span></summary><p>Rule-based indicator from recorded recruiting stages. This is not a verified placement probability.</p></details>
            <div className="job-detail-ownership"><h3>Team &amp; Ownership</h3>{assignedProfiles.length ? <div className="job-detail-owner-list">{assignedProfiles.map(owner => <div className="job-detail-person" key={owner.id}><Avatar name={owner.full_name || owner.email || 'Recruiter'} size="sm" /><span><strong>{owner.full_name || owner.email || 'Recruiter'}</strong><small>Assigned recruiter</small></span></div>)}</div> : legacyFe ? <div className="job-detail-person"><Avatar name={legacyFe} size="sm" /><span><strong>{legacyFe}</strong><small>Legacy assignment · update with Edit Job</small></span></div> : <p className="job-detail-empty-copy">Unassigned</p>}{job.contact_name && <div className="job-detail-person job-detail-client-contact"><Avatar name={job.contact_name} size="sm" /><span><strong>{job.contact_name}</strong><small>Client contact at {job.client || 'this client'}</small></span></div>}</div>
          </Card>

          <Card className="job-detail-panel job-detail-remarks"><CardHeader title="Remarks" subtitle="Shared internal notes for this requisition" action={canEdit && !remarksEditing && <Button size="sm" variant="ghost" leftIcon={job.notes ? 'edit' : 'plus'} onClick={() => setRemarksEditing(true)}>{job.notes ? 'Edit remarks' : 'Add remarks'}</Button>} />{remarksEditing ? <><label htmlFor="job-detail-remarks-input" className="job-detail-sr-label">Requisition remarks</label><Textarea id="job-detail-remarks-input" value={remarks} onChange={event => setRemarks(event.target.value)} rows={7} placeholder="Add role context, sourcing searches, or client updates…" /><div className="job-detail-note-actions"><Button size="sm" variant="ghost" disabled={savingRemarks} onClick={() => { setRemarks(job.notes || ''); setRemarksEditing(false) }}>Cancel</Button><Button size="sm" loading={savingRemarks} disabled={remarks === (job.notes || '')} onClick={saveRemarks}>Save Remarks</Button></div></> : <div className="job-detail-remarks-body">{job.notes ? <MarkdownView content={job.notes} /> : <p className="job-detail-empty-copy">No remarks yet. Add context or save a reviewed AI draft to this job.</p>}</div>}</Card>

          <Card className="job-detail-panel job-detail-candidate-notes"><details><summary><span>Candidate Notes <b>{notesRollup.length}</b></span><Icon name="chevronDown" size={13} /></summary><p className="job-detail-empty-copy">Notes recorded on submissions to this requisition.</p>{notesRollup.length ? <div className="job-detail-note-rollup">{notesRollup.map(candidate => <div key={candidate.id}><strong>{candidate.first_name} {candidate.last_name}</strong><p>{candidate.notes}</p></div>)}</div> : <p className="job-detail-empty-copy">No candidate notes on this job yet.</p>}</details></Card>
        </aside>
      </div>
      <JobFormDrawer jobForm={jobForm} showToast={showFormToast} onSaved={() => load()} />
    </PageContainer>
  )
}
