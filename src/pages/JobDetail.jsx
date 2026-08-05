import { useState, useEffect, useMemo, useCallback } from 'react'
import { db, apiRequest } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useAIGovernance } from '../lib/ai/governance'
import { useJobForm } from '../hooks/useJobForm'
import JobFormDrawer from '../components/jobs/JobFormDrawer'
import { PageContainer } from '../components/layout/PageContainer'
import {
  Button, Badge, StatusPill, Card, CardHeader, KPICard, PageHeader, Table, Textarea,
  EmptyState, Avatar, Icon, useToast, Skeleton, PageSpinner, UserMultiSelect,
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
    <div className="flex flex-col gap-0.5">
      <span className="text-[10.5px] font-semibold uppercase tracking-wide text-text3">{label}</span>
      <span className="text-[13px] text-text font-medium">{value || <span className="text-text3">Not set</span>}</span>
    </div>
  )
}

export default function JobDetail({ jobId, onNavigate }) {
  const { user, organization, profile } = useAuth()
  const orgId = organization?.id || profile?.org_id
  const userId = user?.id
  const { settings: aiSettings } = useAIGovernance(orgId)
  const aiEnabled = aiSettings.workspaces.jobs !== false
  const [job, setJob] = useState(null)
  const [candidates, setCandidates] = useState([])
  const [profiles, setProfiles] = useState([])
  const [activity, setActivity] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [remarks, setRemarks] = useState('')
  const [savingRemarks, setSavingRemarks] = useState(false)
  const { toast } = useToast()

  const load = useCallback(async () => {
    if (!jobId) return
    setLoading(true)
    setNotFound(false)
    const [jobsRes, profilesRes] = await Promise.all([
      db.from('jobs').select('*').eq('id', jobId).param('all_owners', 'true'),
      db.from('profiles').select('*'),
    ])
    const found = (jobsRes.data || [])[0]
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
      key: 'name', header: 'Candidate', sortable: true, sortValue: (c) => `${c.last_name || ''} ${c.first_name || ''}`,
      render: (c) => (
        <span className="flex items-center gap-2 min-w-0">
          <Avatar name={`${c.first_name || ''} ${c.last_name || ''}`.trim() || '?'} size="xs" />
          <span className="min-w-0">
            <strong className="text-[12.5px] text-text font-semibold truncate block">{c.first_name} {c.last_name}</strong>
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

  return (
    <PageContainer>
      <PageHeader
        eyebrow={job.job_id || 'Job Requisition'}
        title={job.title || 'Untitled role'}
        subtitle={`${job.client || 'No client'} · ${job.location || 'No location'}`}
        actions={
          <>
            <Button variant="ghost" onClick={() => onNavigate?.('jobs')}>Back to Jobs</Button>
            <Button variant="primary" leftIcon="edit" onClick={() => jobForm.openEdit(job)}>Edit Job</Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2 mt-5 mb-1">
        <StatusPill status={job.status || 'Open'} tone={STATUS_TONE_JOB[job.status] || 'neutral'} size="sm" />
        <Badge tone={job.priority === 'High' ? 'red' : job.priority === 'Low' ? 'neutral' : 'yellow'}>{job.priority || 'Medium'} Priority</Badge>
        <Badge tone="neutral">{job.type || 'Contract'}</Badge>
      </div>

      <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-4 mb-6">
        <KPICard label="Submissions" value={health.submittals} tone="accent" />
        <KPICard label="Interviews" value={health.interviews} tone="ai" />
        <KPICard label="Offers" value={health.offers} tone="green" />
        <KPICard label="Hires" value={job.openings ? `${health.hires} / ${job.openings}` : health.hires} tone="green" />
        <KPICard label="Days Open" value={health.openDays} tone={health.statusTone} />
        <KPICard label="Placement Prob." value={health.placementProb} tone={health.statusTone} />
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 flex flex-col gap-5">
          <Card>
            <CardHeader title="Job Details" />
            <div className="grid sm:grid-cols-3 gap-4 mt-3">
              <InfoRow label="Job ID" value={job.job_id} />
              <InfoRow label="Optional Ref #" value={job.optional_ref} />
              <InfoRow label="Client" value={job.client} />
              <InfoRow label="Location" value={job.location} />
              <InfoRow label="Work Mode" value={job.work_mode} />
              <InfoRow label="Employment Type" value={job.type} />
              <InfoRow label="Experience Level" value={job.experience_level} />
              {job.bill_rate || job.pay_rate ? (
                <>
                  <InfoRow label="Bill Rate" value={job.bill_rate} />
                  <InfoRow label="Pay Rate" value={job.pay_rate} />
                </>
              ) : (
                <InfoRow label="Rate" value={job.rate} />
              )}
              <InfoRow label="Workers Comp Code" value={job.workers_comp_code} />
              <InfoRow label="Open Date" value={job.open_date} />
              <InfoRow label="End Date" value={job.end_date} />
              <InfoRow label="Submittal Due" value={job.submittal_due} />
              <InfoRow label="Openings" value={job.openings} />
              <InfoRow label="Max Allowed Submittals" value={job.max_submittals} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Description & Skills" />
            <div className="text-[13px] text-text2 leading-relaxed mt-2">
              {job.description ? <MarkdownView content={job.description} /> : <span className="text-text3">No description yet.</span>}
            </div>
            {ensureArray(job.skills).length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {ensureArray(job.skills).map(s => <Badge key={s} tone="accent">{s}</Badge>)}
              </div>
            )}
          </Card>

          <Card padding="none" className="p-3">
            <CardHeader title="Submissions" subtitle={`${candidates.length} candidate${candidates.length === 1 ? '' : 's'} submitted to this job, across the org`} />
            <Table
              columns={submissionColumns}
              data={candidates}
              emptyState={<EmptyState icon="users" title="No submissions yet" description="No candidate has been submitted to this job." />}
            />
          </Card>

          <Card>
            <CardHeader title="Activity" subtitle="Every create/update on this job and its submissions, org-wide" />
            {activity.length === 0 ? (
              <EmptyState icon="reports" title="No activity yet" description="Changes to this job or its candidates will show up here." />
            ) : (
              <div className="flex flex-col gap-3 mt-2 max-h-96 overflow-y-auto">
                {activity.slice(0, 50).map(a => (
                  <div key={a.id} className="flex items-start gap-2.5 text-[12.5px]">
                    <Icon name={a.action === 'created' ? 'plus' : a.action === 'deleted' ? 'trash' : 'edit'} size={13} className="text-text3 mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <span className="text-text font-medium">{a.actor_name || 'Someone'}</span>{' '}
                      <span className="text-text3">{a.action} {a.entity === 'jobs' ? 'this job' : 'a candidate'}{a.summary ? ` — ${a.summary}` : ''}</span>
                      <div className="text-[10.5px] text-text3">{relativeTime(a.created_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="Team & Ownership" />
            {assignedProfiles.length > 0 ? (
              <UserMultiSelect users={profiles} selected={assignedIds} readOnly />
            ) : legacyFe ? (
              <div className="flex items-center gap-3 mt-2">
                <Avatar name={legacyFe} size="sm" />
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-text truncate">{legacyFe}</div>
                  <div className="text-[11px] text-text3 truncate">Legacy assignment — reassign via Edit Job</div>
                </div>
              </div>
            ) : (
              <p className="text-[12px] text-text3 mt-2">Unassigned</p>
            )}
            {job.contact_name && (
              <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border">
                <Avatar name={job.contact_name} size="sm" />
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-text truncate">{job.contact_name}</div>
                  <div className="text-[11px] text-text3 truncate">Client contact at {job.client || 'this client'}</div>
                </div>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Remarks" subtitle="Internal notes about this requisition — visible to the whole org" />
            <Textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={5} placeholder="e.g. client is flexible on rate, prioritize local candidates..." className="mt-2" />
            <div className="flex justify-end mt-2">
              <Button size="sm" variant="primary" loading={savingRemarks} disabled={remarks === (job.notes || '')} onClick={saveRemarks}>Save Remarks</Button>
            </div>
          </Card>

          <Card>
            <CardHeader title="Candidate Notes" subtitle="Rolled up from every submission on this job" />
            {notesRollup.length === 0 ? (
              <p className="text-[12px] text-text3 mt-2">No candidate notes on this job yet.</p>
            ) : (
              <div className="flex flex-col gap-3 mt-2 max-h-80 overflow-y-auto">
                {notesRollup.map(c => (
                  <div key={c.id} className="text-[12.5px] border-l-2 border-border pl-2.5">
                    <div className="font-semibold text-text">{c.first_name} {c.last_name}</div>
                    <div className="text-text2 whitespace-pre-wrap">{c.notes}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <JobFormDrawer jobForm={jobForm} showToast={showFormToast} onSaved={() => load()} />
    </PageContainer>
  )
}
