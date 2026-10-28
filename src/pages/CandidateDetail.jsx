import { formatRecordDate } from '../lib/formatRecordDate'
import { hasPermission } from '../lib/admin/permissions'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { db, apiRequest } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useAIGovernance } from '../lib/ai/governance'
import { PageContainer } from '../components/layout/PageContainer'
import CandidateFormDrawer from '../components/candidates/CandidateFormDrawer'
import {
  Button, Badge, StatusPill, Card, CardHeader,
  EmptyState, Avatar, Icon, useToast, Skeleton, PageSpinner, Textarea, Select, Input, TimePicker,
} from '../components/ui'
import MarkdownView from '../components/MarkdownView'
import AIInsightCard from '../components/ai/AIInsightCard'
import { ensureArray, STATUS_TONE, computeScore } from '../lib/candidateHealth'
import { INTERVIEW_SCHEDULED_STATUS, hasInterviewScheduledStatus, syncInterviewCallback } from '../lib/interviewScheduling'

const STATUSES = ['Pending', 'Submitted', 'Shortlisted', 'Interview Scheduled', 'Interview Done', 'Offer Extended', 'Hired', 'Rejected', 'On Hold', 'Withdrew']
const PRIORITY_TONE = { High: 'red', Medium: 'yellow', Low: 'neutral' }

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

function daysSince(iso) {
  if (!iso) return null
  const elapsed = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24))
  return Number.isFinite(elapsed) ? elapsed : null
}

function profileUrl(value) {
  if (!value) return null
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null
  } catch { return null }
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function InfoRow({ label, value, mono = false }) {
  return (
    <div className="job-detail-field">
      <span className="job-detail-field-label">{label}</span>
      <span className={`job-detail-field-value${mono ? ' font-mono' : ''}`}>
        {value !== null && value !== undefined && value !== '' ? value : <span className="text-text3">Not recorded</span>}
      </span>
    </div>
  )
}

function SectionCard({ title, subtitle, children, action, className = '' }) {
  return (
    <Card className={`job-detail-panel ${className}`}>
      <CardHeader title={title} subtitle={subtitle} action={action} />
      {children}
    </Card>
  )
}

function ScoreWidget({ sc }) {
  const r = 24
  const circumference = 2 * Math.PI * r
  const offset = circumference - (sc.total / 100) * circumference
  const subScores = [
    { label: 'Profile', score: sc.completeness, max: 25 },
    { label: 'Skills', score: sc.skillScore, max: 25 },
    { label: 'Pipeline', score: sc.statusScore, max: 30 },
    { label: 'Recency', score: sc.recencyScore, max: 20 },
  ]

  return (
    <Card className="job-detail-panel candidate-detail-health">
      <details>
      <summary><span>Profile health</span><span>{sc.total}<small>/100</small><Icon name="chevronDown" size={13} /></span></summary>
      <p className="job-detail-empty-copy candidate-detail-score-disclaimer">A record-health indicator based on profile details and recruiting activity.</p>
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10.5px] font-bold text-accent uppercase tracking-wider flex items-center gap-1">
          <Icon name="checkCircle" size={11} />
          Health Score
        </span>
        <Badge tone={sc.total >= 80 ? 'green' : sc.total >= 60 ? 'accent' : sc.total >= 40 ? 'yellow' : 'red'}>
          {sc.gradeLabel}
        </Badge>
      </div>

      {/* Ring + score + sub-scores in one row */}
      <div className="flex items-center gap-3">
        {/* Mini ring */}
        <div className="relative shrink-0">
          <svg width="56" height="56" viewBox="0 0 56 56" style={{ transform: 'rotate(-90deg)' }}>
            <circle cx="28" cy="28" r={r} fill="none" stroke="var(--surface3)" strokeWidth="5" />
            <circle
              cx="28" cy="28" r={r} fill="none"
              stroke={sc.gradeColor} strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              style={{ transition: 'stroke-dashoffset 1s cubic-bezier(0.34,1.56,0.64,1)' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="text-[15px] font-extrabold font-mono leading-none" style={{ color: sc.gradeColor }}>{sc.total}</div>
            <div className="text-[7px] text-text3 uppercase tracking-wide leading-none mt-0.5">/ 100</div>
          </div>
        </div>

        {/* Sub-score rows */}
        <div className="flex flex-col gap-1.5 flex-1 min-w-0">
          {subScores.map(({ label, score, max }) => (
            <div key={label} className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] text-text3 w-[50px] shrink-0 font-medium">{label}</span>
              <div className="h-1 bg-surface3 rounded-full overflow-hidden flex-1">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${Math.round(score / max * 100)}%`, background: sc.gradeColor }}
                />
              </div>
              <span className="text-[10px] font-bold font-mono shrink-0 tabular-nums" style={{ color: sc.gradeColor }}>
                {score}<span className="text-text3 font-normal">/{max}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Insight badges */}
      {sc.insights.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t border-border">
          {sc.insights.slice(0, 6).map((insight, i) => (
            <Badge key={i} size="sm" tone={insight.type === 'good' ? 'green' : insight.type === 'bad' ? 'red' : 'yellow'}>
              {insight.text}
            </Badge>
          ))}
        </div>
      )}
      </details>
    </Card>
  )
}


// ─── Pipeline Stage Bar ──────────────────────────────────────────────────────

const PIPELINE_STAGES = [
  { key: 'Pending', short: 'Pending' },
  { key: 'Submitted', short: 'Submitted' },
  { key: 'Shortlisted', short: 'Shortlisted' },
  { key: 'Interview Scheduled', short: 'Interview' },
  { key: 'Interview Done', short: 'Done' },
  { key: 'Offer Extended', short: 'Offer' },
  { key: 'Hired', short: 'Hired' },
]
const TERMINAL_STAGES = { Rejected: 'red', 'On Hold': 'yellow', Withdrew: 'neutral' }

function PipelineStageBar({ status }) {
  const currentIdx = PIPELINE_STAGES.findIndex(s => s.key === status)
  const isTerminal = TERMINAL_STAGES[status]
  return (
    <Card className="job-detail-panel candidate-detail-pipeline">
      <div className="flex items-center justify-between mb-3">
        <span className="candidate-detail-section-label">
          <Icon name="pipeline" size={11} />
          Pipeline Stage
        </span>
        {isTerminal && (
          <Badge tone={TERMINAL_STAGES[status]} size="sm">{status}</Badge>
        )}
      </div>
      <div className="flex items-center gap-1">
        {PIPELINE_STAGES.map((stage, i) => {
          const passed = currentIdx !== -1 && i <= currentIdx
          const active = i === currentIdx
          return (
            <div key={stage.key} className="flex flex-col items-center flex-1 min-w-0 gap-1.5">
              <div
                className={`w-full h-1.5 rounded-full transition-all duration-500 ${passed ? 'bg-accent' : 'bg-surface3'
                  }`}
              />
              <span className={`text-[9px] font-semibold truncate w-full text-center transition-colors leading-none ${active ? 'text-accent' : passed ? 'text-text2' : 'text-text3'
                }`}>{stage.short}</span>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

// ─── Interview Card ───────────────────────────────────────────────────────────

function InterviewCard({ candidate }) {
  const interviewDate = candidate.interview_date ? new Date(candidate.interview_date) : null
  const now = new Date()
  const diffDays = interviewDate ? Math.ceil((interviewDate - now) / (1000 * 60 * 60 * 24)) : null
  const isPast = diffDays !== null && diffDays < 0
  const isToday = diffDays === 0
  const INTERVIEW_ICON = { 'Phone Screen': 'phone', 'Video Call': 'video', 'On-site': 'building', 'Panel': 'users', 'Technical': 'code' }
  const iconName = INTERVIEW_ICON[candidate.interview_type] || 'calendar'

  return (
    <Card className="job-detail-panel candidate-detail-interview">
      <div className="flex items-start gap-3">
        <div
          className="w-10 h-10 rounded-[var(--radius-md)] flex items-center justify-center shrink-0"
          style={{ background: isPast ? 'var(--surface3)' : 'color-mix(in srgb, var(--accent) 14%, transparent)', color: isPast ? 'var(--text3)' : 'var(--accent)' }}
        >
          <Icon name={iconName} size={18} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <div className="text-[13px] font-bold text-text">
                {candidate.interview_type || 'Interview'}
              </div>
              <div className="text-[11.5px] text-text3 mt-0.5">
                {interviewDate?.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                {candidate.interview_time ? ` at ${candidate.interview_time}` : ''}
              </div>
            </div>
            <div className="text-right">
              {isToday && <Badge tone="green" size="sm">Today!</Badge>}
              {!isToday && diffDays !== null && (
                <Badge tone={isPast ? 'neutral' : diffDays <= 3 ? 'yellow' : 'accent'} size="sm">
                  {isPast ? `${Math.abs(diffDays)}d ago` : `In ${diffDays}d`}
                </Badge>
              )}
              {candidate.feedback_status && candidate.feedback_status !== 'Awaiting' && (
                <Badge
                  tone={candidate.feedback_status === 'Positive' ? 'green' : candidate.feedback_status === 'Negative' ? 'red' : 'neutral'}
                  size="sm" className="ml-1"
                >
                  Feedback: {candidate.feedback_status}
                </Badge>
              )}
            </div>
          </div>
          {candidate.client && (
            <div className="text-[11px] text-text3 mt-1.5 flex items-center gap-1">
              <Icon name="building" size={10} />
              {candidate.client}
              {candidate.job_title && <> · {candidate.job_title}</>}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

// ─── Rate & Margin Analysis ───────────────────────────────────────────────────

function parseRate(rateStr) {
  if (!rateStr) return null
  const match = String(rateStr).replace(/,/g, '').match(/[\d.]+/)
  return match ? parseFloat(match[0]) : null
}

function RateMarginCard({ candidate }) {
  const billRate = parseRate(candidate.rate)
  if (!billRate) return null

  // Rough standard margin tiers (staffing industry typical)
  const lowPayRate = +(billRate * 0.68).toFixed(0)
  const highPayRate = +(billRate * 0.78).toFixed(0)
  const lowMargin = +(billRate - highPayRate).toFixed(0)
  const highMargin = +(billRate - lowPayRate).toFixed(0)
  const marginPct = Math.round(((lowMargin + highMargin) / 2 / billRate) * 100)

  return (
    <Card className="job-detail-panel candidate-detail-margin">
      <details><summary>Estimated rate &amp; margin <Icon name="chevronDown" size={13} /></summary>
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10.5px] font-bold text-accent uppercase tracking-wider flex items-center gap-1">
          <Icon name="dollar" size={11} />
          Rate & Margin Analysis
        </span>
        <Badge tone={marginPct >= 25 ? 'green' : marginPct >= 18 ? 'yellow' : 'red'} size="sm">
          ~{marginPct}% margin
        </Badge>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-surface border border-border rounded-[var(--radius-sm)] px-3 py-2.5 text-center">
          <div className="text-[10px] text-text3 uppercase tracking-wide font-medium mb-1">Bill Rate</div>
          <div className="text-[15px] font-extrabold font-mono text-accent">${billRate}<span className="text-[10px] text-text3 font-normal">/hr</span></div>
        </div>
        <div className="bg-surface border border-border rounded-[var(--radius-sm)] px-3 py-2.5 text-center">
          <div className="text-[10px] text-text3 uppercase tracking-wide font-medium mb-1">Est. Pay Rate</div>
          <div className="text-[13px] font-bold font-mono text-text2">${lowPayRate}–${highPayRate}<span className="text-[10px] text-text3 font-normal">/hr</span></div>
        </div>
        <div className="bg-surface border border-border rounded-[var(--radius-sm)] px-3 py-2.5 text-center">
          <div className="text-[10px] text-text3 uppercase tracking-wide font-medium mb-1">Est. Margin</div>
          <div className="text-[13px] font-bold font-mono text-green-500">${lowMargin}–${highMargin}<span className="text-[10px] text-text3 font-normal">/hr</span></div>
        </div>
      </div>
      <div className="mt-3 h-1.5 bg-surface3 rounded-full overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-r from-accent to-green-500 transition-all duration-700" style={{ width: `${Math.min(marginPct * 2.5, 100)}%` }} />
      </div>
      <p className="text-[10px] text-text3 mt-1.5">Based on industry-standard 22–32% gross margin range. Actual pay rate may vary.</p>
      </details>
    </Card>
  )
}

// ─── Multi-Job Submission History ────────────────────────────────────────────

function SubmissionHistory({ current, others, onNavigate }) {
  const all = [{ ...current, _isCurrent: true }, ...others]

  const STATUS_COLOR = {
    Hired: 'green', 'Offer Extended': 'green', Shortlisted: 'accent',
    'Interview Scheduled': 'accent', 'Interview Done': 'accent',
    Rejected: 'red', Withdrew: 'neutral', 'On Hold': 'yellow',
    Pending: 'neutral', Submitted: 'accent',
  }

  return (
    <Card className="job-detail-panel candidate-detail-submissions">
      <CardHeader
        title={`Submission History (${all.length})`}
        subtitle="All jobs this candidate has been submitted to"
      />
      <div className="flex flex-col divide-y divide-border">
        {all.map(sub => (
          <div
            key={sub.id}
            className="candidate-detail-submission-row"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                {sub.job_id && <button type="button" className="candidate-detail-job-link" onClick={() => onNavigate?.('job_detail', { jobId: sub.job_id })}>{sub.job_id}<Icon name="arrowUpRight" size={12} /></button>}
                {sub.job_title && <span className="text-[12px] text-text truncate">{sub.job_title}</span>}
                {sub._isCurrent && <Badge size="sm" tone="accent">Current</Badge>}
              </div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {sub.client && <span className="text-[11px] text-text3">{sub.client}</span>}
                {sub.submission_date && <span className="text-[11px] text-text3">· {sub.submission_date}</span>}
                {sub.rate && <span className="text-[11px] text-text3 font-mono">· {sub.rate}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge size="sm" tone={STATUS_COLOR[sub.internal_status] || 'neutral'}>{sub.internal_status || 'Pending'}</Badge>
              {!sub._isCurrent && <Button size="sm" variant="ghost" rightIcon="chevronRight" onClick={() => onNavigate?.('candidate_detail', { candidateId: sub.id })}>View submission</Button>}
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

// ─── Activity Log ─────────────────────────────────────────────────────────────

const ACTION_LABEL = {
  created: 'added this candidate',
  updated: 'updated candidate details',
  deleted: 'deleted this record',
  uploaded: 'uploaded a file',
  status_changed: 'changed the status',
  note_added: 'added a note',
  ai_run: 'ran an AI action',
}

const ACTION_ICON = {
  created: 'plus', updated: 'edit', deleted: 'trash', uploaded: 'download',
  status_changed: 'refresh', note_added: 'note', ai_run: 'sparkles',
}

function formatActivityDescription(entry) {
  const label = ACTION_LABEL[entry.action] || entry.action || 'changed candidate'

  if (entry.details?.updates) {
    const updates = entry.details.updates
    if (typeof updates === 'object') {
      const keys = Object.keys(updates)
      if (keys.includes('internal_status') || keys.includes('external_status')) {
        const statuses = []
        if (updates.internal_status) statuses.push(`internal: ${updates.internal_status}`)
        if (updates.external_status) statuses.push(`external: ${updates.external_status}`)
        return `changed status (${statuses.join(', ')})`
      }
      if (keys.includes('notes')) {
        return 'updated recruiter notes'
      }
      if (keys.length > 0) {
        return `updated ${keys.slice(0, 3).join(', ')}`
      }
    }
  }

  if (entry.summary) {
    return `${label} (${entry.summary})`
  }
  return label
}

function ActivityLogSection({ log }) {
  if (!log || log.length === 0) return <SectionCard title="Activity Log" subtitle="Recorded changes to this candidate"><EmptyState icon="reports" title="No recorded changes" description="Updates to this candidate will appear here." /></SectionCard>
  return (
    <Card className="job-detail-panel candidate-detail-activity">
      <CardHeader title="Activity Log" subtitle="Who changed what and when" />
      <div className="flex flex-col divide-y divide-border">
        {log.map((entry, i) => {
          const actor = entry.actor_name || entry.user_name || entry.user_email || 'Recruiter'
          const description = formatActivityDescription(entry)
          const iconKey = ACTION_ICON[entry.action] || 'edit'
          return (
            <div key={entry.id || i} className="flex items-start gap-3 py-2.5">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: 'color-mix(in srgb, var(--accent) 10%, transparent)', color: 'var(--accent)' }}
              >
                <Icon name={iconKey} size={12} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] text-text leading-snug">
                  <span className="font-semibold text-accent">{actor}</span>
                  {' '}
                  <span className="text-text2">{description}</span>
                </div>
                {entry.created_at && (
                  <div className="text-[10.5px] text-text3 mt-0.5">{relativeTime(entry.created_at)}</div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}

// ─── Timeline Item ────────────────────────────────────────────────────────────

function TimelineItem({ event }) {
  const iconName = event.type === 'Callback' ? 'callbacks' : 'followups'
  const statusColor = event.status === 'completed' ? 'green' : event.status === 'pending' ? 'yellow' : 'neutral'
  return (
    <div className="candidate-detail-timeline-item flex items-start gap-3 rounded-[var(--radius-md)] border border-border px-3.5 py-3">
      <div
        className="w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}
      >
        <Icon name={iconName} size={14} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-0.5">
          <strong className="text-[12.5px] font-semibold text-text">{event.type}: {event.title}</strong>
          <span className="text-[11px] text-text3 shrink-0 tabular-nums">{event.date || '—'}</span>
        </div>
        {event.sub && <p className="text-xs text-text3 mt-1 leading-relaxed">{event.sub}</p>}
        {event.status && <Badge size="sm" tone={statusColor} className="mt-1.5">{event.status}</Badge>}
      </div>
    </div>
  )
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function CandidateDetail({ candidateId, onNavigate }) {
  const { user, organization, profile } = useAuth()
  const dateLabel = value => formatRecordDate(value, organization?.date_format)
  const orgId = organization?.id || profile?.org_id
  const canEdit = hasPermission(profile?.role, 'Candidates', 'edit')
  const canUseAI = hasPermission(profile?.role, 'AI', 'edit')
  const userId = user?.id
  const { settings: aiSettings } = useAIGovernance(orgId)
  const aiEnabled = canUseAI && aiSettings.workspaces.candidates !== false

  const [candidate, setCandidate] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')

  // Timeline data
  const [callbacksLog, setCallbacksLog] = useState([])
  const [followupsLog, setFollowupsLog] = useState([])

  // Other submissions (same candidate email, different jobs)
  const [otherSubmissions, setOtherSubmissions] = useState([])

  // Activity log
  const [activityLog, setActivityLog] = useState([])

  // Quick-edit status
  const [statusDraft, setStatusDraft] = useState({})
  const [savingStatus, setSavingStatus] = useState(false)

  // Notes editing
  const [notes, setNotes] = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [notesEditing, setNotesEditing] = useState(false)

  // Resume download
  const [downloadingResume, setDownloadingResume] = useState(false)

  // Edit drawer
  const [editOpen, setEditOpen] = useState(false)

  const { toast } = useToast()

  const load = useCallback(async () => {
    if (!candidateId) return
    setLoading(true)
    setNotFound(false)
    setOtherSubmissions([])

    const [candRes, cbRes, fuRes] = await Promise.all([
      db.from('candidates').select('*').eq('id', candidateId),
      db.from('callbacks').select('*'),
      db.from('followups').select('*'),
    ])

    const found = (candRes.data || [])[0]
    setCallbacksLog(cbRes.data || [])
    setFollowupsLog(fuRes.data || [])

    if (!found) {
      setNotFound(true)
      setLoading(false)
      return
    }

    setCandidate(found)
    setNotes(found.notes || '')
    setStatusDraft({
      internal_status: found.internal_status || 'Pending',
      external_status: found.external_status || 'Pending',
      feedback_status: found.feedback_status || 'Awaiting',
      priority: found.priority || 'Medium',
      interview_date: found.interview_date || '',
      interview_time: found.interview_time || '',
      interview_type: found.interview_type || '',
    })

    // Fetch other submissions by same candidate email
    if (found.email) {
      const { data: subs } = await db.from('candidates').select('id,job_id,job_title,client,internal_status,external_status,submission_date,rate').eq('email', found.email)
      setOtherSubmissions((subs || []).filter(s => s.id !== found.id))
    }

    // Fetch activity log for this candidate
    const { data: acts } = await db.from('activity_logs').select('*').eq('entity_id', candidateId).order('created_at', { ascending: false })
    setActivityLog((acts || []).slice(0, 20))

    setLoading(false)
  }, [candidateId])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    setActiveTab('overview')
    setNotesEditing(false)
  }, [candidateId])

  const candidateTimeline = useMemo(() => {
    if (!candidate) return []
    const fullName = `${candidate.first_name || ''} ${candidate.last_name || ''}`.trim().toLowerCase()
    if (!fullName) return []
    const matches = (name) => (name || '').trim().toLowerCase() === fullName
    return [
      ...callbacksLog.filter(cb => matches(cb.candidate_name)).map(cb => ({
        id: `cb-${cb.id}`, type: 'Callback', title: cb.job || 'Callback', date: cb.date, status: cb.status, sub: cb.notes,
      })),
      ...followupsLog.filter(fu => matches(fu.candidate_name)).map(fu => ({
        id: `fu-${fu.id}`, type: 'Follow-up', title: fu.type || 'Follow-up', date: fu.date, status: fu.status, sub: fu.notes,
      })),
    ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
  }, [candidate, callbacksLog, followupsLog])

  const sc = useMemo(() => candidate ? computeScore(candidate) : null, [candidate])

  const profileCompleteness = useMemo(() => {
    if (!candidate) return 0
    const fields = ['first_name', 'last_name', 'email', 'phone', 'location', 'work_auth', 'experience', 'linkedin', 'submission_date', 'job_id', 'job_title', 'client', 'rate', 'fe_name', 'fe_extension', 'recruiter_name']
    const filled = fields.filter(f => candidate[f] && String(candidate[f]).trim() !== '').length
    return Math.round((filled / fields.length) * 100)
  }, [candidate])

  const handleDownloadResume = async () => {
    setDownloadingResume(true)
    try {
      const res = await apiRequest(`/upload/resume-url/${candidateId}`)
      if (res?.success && res.url) {
        const link = document.createElement('a')
        link.href = res.url
        if (res.fileName) link.download = res.fileName
        link.target = '_blank'
        link.rel = 'noopener'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      } else {
        throw new Error(res?.error || 'Could not generate a download link.')
      }
    } catch (err) {
      toast({ tone: 'error', title: err.message || 'Failed to download resume' })
    } finally {
      setDownloadingResume(false)
    }
  }

  const setStatusField = (field, value) => {
    setStatusDraft(d => ({
      ...d,
      [field]: value,
      interview_time: value === INTERVIEW_SCHEDULED_STATUS && !d.interview_time ? '10:00 AM' : d.interview_time,
      interview_type: value === INTERVIEW_SCHEDULED_STATUS && !d.interview_type ? 'Video Call' : d.interview_type,
    }))
  }

  const handleSaveStatus = async () => {
    if (!candidate) return
    if (hasInterviewScheduledStatus(statusDraft) && !statusDraft.interview_date) {
      toast({ tone: 'error', title: 'Interview date required', description: 'Add a date before scheduling the interview callback.' })
      return
    }
    if (hasInterviewScheduledStatus(statusDraft) && !statusDraft.interview_time) {
      toast({ tone: 'error', title: 'Interview time required', description: 'Add a time before scheduling the interview callback.' })
      return
    }
    if (hasInterviewScheduledStatus(statusDraft) && !statusDraft.interview_type) {
      toast({ tone: 'error', title: 'Interview type required', description: 'Choose phone, video, panel, or another interview type.' })
      return
    }

    setSavingStatus(true)
    try {
      const { data, error } = await db.from('candidates').update(statusDraft).eq('id', candidate.id).select()
      if (error) throw error
      const updated = Array.isArray(data) ? data[0] : data
      const nextCandidate = updated || { ...candidate, ...statusDraft }
      if (updated) setCandidate(prev => ({ ...prev, ...updated }))
      const sync = await syncInterviewCallback(nextCandidate, {
        userId,
        orgId,
        timezone: organization?.timezone,
      })
      if (sync.error) throw sync.error
      if (sync.data) {
        setCallbacksLog(prev => {
          const exists = prev.some(cb => cb.id === sync.data.id)
          return exists ? prev.map(cb => cb.id === sync.data.id ? sync.data : cb) : [sync.data, ...prev]
        })
      }
      const title = sync.action === 'closed'
        ? 'Status updated and interview callback closed'
        : sync.synced
          ? 'Status updated and callback scheduled'
          : 'Status updated'
      toast({
        tone: 'success',
        title,
      })
    } catch (err) {
      toast({ tone: 'error', title: 'Failed to update status', description: err.message })
    } finally {
      setSavingStatus(false)
    }
  }

  const handleSaveNotes = async () => {
    if (!candidate) return
    setSavingNotes(true)
    try {
      const { error } = await db.from('candidates').update({ notes }).eq('id', candidate.id)
      if (error) throw error
      setCandidate(prev => ({ ...prev, notes }))
      setNotesEditing(false)
      toast({ tone: 'success', title: 'Notes saved' })
    } catch (err) {
      toast({ tone: 'error', title: 'Failed to save notes', description: err.message })
    } finally {
      setSavingNotes(false)
    }
  }

  // ── Loading / Not Found states ─────────────────────────────────────────────

  if (loading) {
    return (
      <PageContainer>
        <Skeleton className="h-10 w-80 mb-4" />
        <PageSpinner />
      </PageContainer>
    )
  }

  if (notFound || !candidate) {
    return (
      <PageContainer>
        <EmptyState
          icon="users"
          title="Candidate not found"
          description="This candidate may have been deleted, or you don't have access."
          actionLabel="Back to Candidates"
          onAction={() => onNavigate?.('candidates')}
        />
      </PageContainer>
    )
  }

  const fullName = `${candidate.first_name || ''} ${candidate.last_name || ''}`.trim() || 'Unknown Candidate'
  const daysSinceSubmission = daysSince(candidate.submission_date)
  const skills = ensureArray(candidate.skills)

  const FEEDBACK_TONE = { Positive: 'green', Negative: 'red', Awaiting: 'yellow', 'No Response': 'neutral' }

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'submissions', label: 'Submissions', count: otherSubmissions.length + 1 },
    { id: 'activity', label: 'Activity', count: candidateTimeline.length + activityLog.length },
    { id: 'resume', label: 'Resume' },
    { id: 'ai', label: 'AI', hidden: !aiEnabled },
  ].filter(t => !t.hidden)

  // AI profile content for AIInsightCards
  const aiProfileText = [
    `Name: ${fullName}`,
    `Target Role: ${candidate.job_title || 'Not specified'}`,
    `Experience: ${candidate.experience ? candidate.experience + ' years' : 'Not specified'}`,
    `Location: ${candidate.location || 'Not specified'}`,
    `Work Authorization: ${candidate.work_auth || 'Not specified'}`,
    `Skills: ${skills.join(', ') || 'None listed'}`,
    `Internal Status: ${candidate.internal_status || 'Pending'}`,
    `External Status: ${candidate.external_status || 'Pending'}`,
    `Feedback: ${candidate.feedback_status || 'Awaiting'}`,
    candidate.notes ? `Recruiter Notes: ${candidate.notes}` : null,
    candidate.resume_text ? `Resume:\n${candidate.resume_text}` : null,
  ].filter(Boolean).join('\n')

  return (
    <PageContainer className="job-detail-page candidate-detail-page">
      <div className="job-detail-breadcrumb">
        <Button size="sm" variant="ghost" leftIcon="chevronLeft" onClick={() => onNavigate?.('candidates')}>Back to Candidates</Button>
        <span aria-hidden="true">/</span><span className="job-detail-reference">Candidate profile</span>
        {candidate.updated_at && <span className="job-detail-updated">Updated {relativeTime(candidate.updated_at)}</span>}
      </div>
      <header className="job-detail-header">
        <div className="candidate-detail-identity">
          <Avatar name={fullName} size="lg" />
          <div className="job-detail-identity">
            <span className="job-detail-eyebrow">CANDIDATE WORKSPACE</span>
            <div className="job-detail-title"><h1>{fullName}</h1><StatusPill status={candidate.internal_status || 'Pending'} tone={STATUS_TONE[candidate.internal_status] || 'neutral'} size="sm" /></div>
            <div className="job-detail-meta">
              {candidate.job_title && <span>{candidate.job_title}</span>}
              {candidate.location && <span><Icon name="building" size={12} />{candidate.location}</span>}
              <Badge tone={PRIORITY_TONE[candidate.priority] || 'neutral'}>{candidate.priority || 'Medium'} priority</Badge>
            </div>
          </div>
        </div>
        <div className="candidate-detail-header-actions">
          {candidate.resume_file_name && <Button variant="secondary" size="sm" leftIcon="download" loading={downloadingResume} onClick={handleDownloadResume}>Resume</Button>}
          {aiEnabled && <Button variant="ghost" size="sm" leftIcon="sparkles" onClick={() => setActiveTab('ai')}>Deep AI Fit</Button>}
          {canEdit && <Button variant="primary" size="sm" leftIcon="edit" onClick={() => setEditOpen(true)}>Edit Candidate</Button>}
        </div>
      </header>

      <section className="job-detail-summary" aria-label="Candidate snapshot">{[
        ['Callbacks', candidateTimeline.filter(event => event.type === 'Callback').length, 'Logged candidate callbacks'],
        ['Follow-ups', candidateTimeline.filter(event => event.type === 'Follow-up').length, 'Logged follow-up activity'],
        ['Days since submission', daysSinceSubmission ?? '—', dateLabel(candidate.submission_date) || 'Submission date not recorded'],
        ['Profile complete', `${profileCompleteness}%`, 'Recorded profile details'],
      ].map(([label, value, helper]) => <div key={label}><span>{label}</span><strong>{value}</strong><small>{helper}</small></div>)}</section>

      <nav className="job-detail-views candidate-detail-views" aria-label="Candidate detail views">
        {tabs.map(tab => <button type="button" key={tab.id} aria-current={activeTab === tab.id ? 'page' : undefined} aria-controls="candidate-detail-content" onClick={() => setActiveTab(tab.id)}>{tab.label}{tab.count !== undefined && <span>{tab.count}</span>}</button>)}
      </nav>

      <div className="job-detail-columns">
        <div id="candidate-detail-content" className="job-detail-content">
          {activeTab === 'overview' && <>
            <SectionCard title="Personal Info" subtitle="Contact details and work preferences" className="candidate-detail-personal">
              <div className="job-detail-fields">
                <InfoRow label="Email" value={candidate.email ? <a href={`mailto:${candidate.email}`}>{candidate.email}</a> : null} />
                <InfoRow label="Phone" value={candidate.phone ? <a href={`tel:${candidate.phone}`}>{candidate.phone}</a> : null} />
                <InfoRow label="Location" value={candidate.location} />
                <InfoRow label="Work authorization" value={candidate.work_auth} />
                <InfoRow label="Experience" value={candidate.experience !== null && candidate.experience !== undefined && candidate.experience !== '' ? `${candidate.experience} years` : null} />
                <InfoRow label="Relocation" value={candidate.relocation} />
              </div>
              <div className="candidate-detail-contact-links">{profileUrl(candidate.linkedin) ? <a href={profileUrl(candidate.linkedin)} target="_blank" rel="noopener noreferrer"><Icon name="arrowUpRight" size={13} />LinkedIn profile</a> : <span className="job-detail-empty-copy">LinkedIn: {candidate.linkedin || 'Not recorded'}</span>}</div>
            </SectionCard>
            <PipelineStageBar status={candidate.internal_status || 'Pending'} />
            <SectionCard title="Current Submission" subtitle="The requisition linked to this candidate record" action={candidate.job_id && <Button size="sm" variant="ghost" rightIcon="arrowUpRight" onClick={() => onNavigate?.('job_detail', { jobId: candidate.job_id })}>View job</Button>}>
              <div className="job-detail-fields">
                <InfoRow label="Job ID" value={candidate.job_id} mono /><InfoRow label="Role" value={candidate.job_title} /><InfoRow label="Client" value={candidate.client} />
                <InfoRow label="Submitted" value={dateLabel(candidate.submission_date)} /><InfoRow label="Rate" value={candidate.rate} /><InfoRow label="Follow-up date" value={dateLabel(candidate.followup_date)} />
                <InfoRow label="Client status" value={<StatusPill status={candidate.external_status || 'Pending'} tone={STATUS_TONE[candidate.external_status] || 'neutral'} size="sm" />} />
                <InfoRow label="Feedback" value={<StatusPill status={candidate.feedback_status || 'Awaiting'} tone={FEEDBACK_TONE[candidate.feedback_status] || 'neutral'} size="sm" />} />
              </div>
            </SectionCard>
            {candidate.interview_date && <InterviewCard candidate={candidate} />}
            <SectionCard title={`Skills${skills.length ? ` (${skills.length})` : ''}`} subtitle="Skills recorded on this candidate's profile">
              <div className="job-detail-skill-list candidate-detail-skills">{skills.length ? skills.map((skill, index) => <Badge key={`${skill}-${index}`} tone="neutral">{skill}</Badge>) : <p className="job-detail-empty-copy">No skills listed for this candidate.</p>}</div>
            </SectionCard>
            <RateMarginCard candidate={candidate} />
          </>}

          {activeTab === 'submissions' && <SubmissionHistory current={candidate} others={otherSubmissions} onNavigate={onNavigate} />}
          {activeTab === 'activity' && <>
            <SectionCard title="Callbacks & Follow-ups" subtitle="Candidate conversations and follow-up history">
              {candidateTimeline.length ? <div className="candidate-detail-timeline">{candidateTimeline.map(event => <TimelineItem key={event.id} event={event} />)}</div> : <EmptyState icon="calendar" title="No timeline activity" description="Callbacks and follow-ups logged for this candidate will appear here." />}
            </SectionCard>
            <ActivityLogSection log={activityLog} />
          </>}
          {activeTab === 'resume' && <>
            {candidate.resume_file_name && <Card className="job-detail-panel candidate-detail-resume-file">
              <div><span className="candidate-detail-file-icon"><Icon name="postings" size={18} /></span><span><strong>{candidate.resume_file_name}</strong>{candidate.resume_file_size && <small>{Math.round(candidate.resume_file_size / 1024)} KB</small>}</span></div>
              <Button size="sm" variant="secondary" leftIcon="download" loading={downloadingResume} onClick={handleDownloadResume}>Download Resume</Button>
            </Card>}
            {candidate.resume_text ? <SectionCard title="Resume Text" subtitle="Parsed text from the uploaded resume"><div className="candidate-detail-resume-text"><MarkdownView content={candidate.resume_text} /></div></SectionCard> : !candidate.resume_file_name ? <SectionCard title="Resume"><EmptyState icon="postings" title="No resume on file" description="Upload a resume in the candidate editor to see it here." actionLabel="Edit Candidate" onAction={() => setEditOpen(true)} /></SectionCard> : <SectionCard title="Resume Text"><p className="job-detail-empty-copy">No parsed text is stored. Download the original resume to review it.</p></SectionCard>}
          </>}
          {activeTab === 'ai' && aiEnabled && (
            <div className="candidate-detail-ai">
              <AIInsightCard
                orgId={orgId} userId={userId} source="candidates"
                title="Candidate Snapshot" icon="sparkles" actionId="analyze"
                content={aiProfileText}
                context="Surface this candidate's key strengths, potential concerns, and overall recruiting fit in concise bullet points. Reference only the data provided."
              />
              <AIInsightCard
                orgId={orgId} userId={userId} source="candidates"
                title="Interview Questions" icon="checkCircle" actionId="draft"
                content={`Generate targeted interview questions for a candidate applying for: ${candidate.job_title || 'this role'}. Skills: ${skills.join(', ') || 'not listed'}. Experience: ${candidate.experience || 'not specified'} years.`}
                context="Generate 6 targeted interview questions — mix of technical depth, behavioral scenarios, and past-project experience. Tailor to the specific role and skills listed."
              />
              <AIInsightCard
                orgId={orgId} userId={userId} source="candidates"
                title="Outreach Email Draft" icon="mail" actionId="draft"
                content={`Write a brief, professional outreach email to ${fullName} about the ${candidate.job_title || 'open role'} at ${candidate.client || 'the client'}. The role is in ${candidate.location || 'the listed location'}.`}
                context="Write a concise recruiter outreach email (3–4 short paragraphs). Be professional, warm, and specific. Avoid generic filler phrases."
                cta="Draft Outreach Email"
              />
              <AIInsightCard
                orgId={orgId} userId={userId} source="candidates"
                title="Resume Rewrite Suggestions" icon="edit" actionId="improve"
                content={candidate.resume_text || ''}
                context="Suggest specific improvements to strengthen this resume for client submissions — focus on clarity, impact, and quantifiable achievements."
                emptyHint="No resume text on file for this candidate."
                cta="Generate Suggestions"
              />
            </div>
          )}

        </div>
        <aside className="job-detail-sidebar" aria-label="Candidate team and notes">
          <SectionCard title="Team & Ownership" subtitle="Your recruiting team for this candidate" className="candidate-detail-team">
            {candidate.fe_name || candidate.recruiter_name || candidate.account_manager ? <div className="candidate-detail-owner-list">
              {[
                [candidate.fe_name, `${candidate.recruiter_name === candidate.fe_name ? 'Recruiter · Front End' : 'Front End'}${candidate.fe_extension ? ` · ext. ${candidate.fe_extension}` : ''}`],
                [candidate.recruiter_name !== candidate.fe_name ? candidate.recruiter_name : null, 'Recruiter'],
                [candidate.account_manager, 'Account Manager'],
              ].filter(([name]) => name).map(([name, role]) => <div className="job-detail-person" key={role}><Avatar name={name} size="sm" /><span><strong>{name}</strong><small>{role}</small></span></div>)}
            </div> : <p className="job-detail-empty-copy">No ownership assigned.</p>}
          </SectionCard>
          <Card className="job-detail-panel candidate-detail-status"><fieldset disabled={!canEdit} className="min-w-0">
            <details><summary><span><strong>Update status</strong><small>Pipeline, feedback &amp; interview scheduling</small></span><Icon name="chevronDown" size={14} /></summary>
            <div className="candidate-detail-status-fields">
              <div role="group" aria-label="Internal">
                <label className="text-[10.5px] font-bold uppercase tracking-wide text-text3 block mb-1.5">Internal</label>
                <Select
                  value={statusDraft.internal_status}
                  onChange={v => setStatusField('internal_status', v)}
                  options={STATUSES.map(s => ({ value: s, label: s }))}
                />
              </div>
              <div role="group" aria-label="Client / External">
                <label className="text-[10.5px] font-bold uppercase tracking-wide text-text3 block mb-1.5">Client / External</label>
                <Select
                  value={statusDraft.external_status}
                  onChange={v => setStatusField('external_status', v)}
                  options={STATUSES.map(s => ({ value: s, label: s }))}
                />
              </div>
              <div role="group" aria-label="Feedback">
                <label className="text-[10.5px] font-bold uppercase tracking-wide text-text3 block mb-1.5">Feedback</label>
                <Select
                  value={statusDraft.feedback_status}
                  onChange={v => setStatusDraft(d => ({ ...d, feedback_status: v }))}
                  options={['Awaiting', 'Positive', 'Negative', 'No Response'].map(o => ({ value: o, label: o }))}
                />
              </div>
              <div role="group" aria-label="Priority">
                <label className="text-[10.5px] font-bold uppercase tracking-wide text-text3 block mb-1.5">Priority</label>
                <Select
                  value={statusDraft.priority}
                  onChange={v => setStatusDraft(d => ({ ...d, priority: v }))}
                  options={['High', 'Medium', 'Low'].map(o => ({ value: o, label: o }))}
                />
              </div>
              {hasInterviewScheduledStatus(statusDraft) && (
                <div className="rounded-[var(--radius-md)] border border-accent/20 bg-accent/5 p-3 flex flex-col gap-3">
                  <div className="flex items-start gap-2">
                    <span className="w-7 h-7 rounded-[var(--radius-sm)] bg-accent/12 text-accent flex items-center justify-center shrink-0">
                      <Icon name="calendar" size={13} />
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-text">Schedule interview callback</div>
                      <div className="text-[11px] text-text3 leading-snug">Saving this status creates or updates one pending callback for this candidate.</div>
                    </div>
                  </div>
                  <div role="group" aria-label="Interview Date">
                    <label className="text-[10.5px] font-bold uppercase tracking-wide text-text3 block mb-1.5">Interview Date</label>
                    <Input
                      type="date"
                      value={statusDraft.interview_date || ''}
                      onChange={e => setStatusDraft(d => ({ ...d, interview_date: e.target.value }))}
                    />
                  </div>
                  <div role="group" aria-label="Interview Time">
                    <label className="text-[10.5px] font-bold uppercase tracking-wide text-text3 block mb-1.5">Interview Time</label>
                    <TimePicker
                      value={statusDraft.interview_time || ''}
                      onChange={v => setStatusDraft(d => ({ ...d, interview_time: v }))}
                      placeholder="Select time..."
                    />
                  </div>
                  <div role="group" aria-label="Interview Type">
                    <label className="text-[10.5px] font-bold uppercase tracking-wide text-text3 block mb-1.5">Interview Type</label>
                    <Select
                      value={statusDraft.interview_type || ''}
                      onChange={v => setStatusDraft(d => ({ ...d, interview_type: v }))}
                      options={['Phone Screen', 'Video Call', 'On-site', 'Panel', 'Technical'].map(o => ({ value: o, label: o }))}
                      placeholder="Select type..."
                    />
                  </div>
                </div>
              )}
              <Button
                variant="primary"
                size="sm"
                loading={savingStatus}
                disabled={
                  statusDraft.internal_status === (candidate.internal_status || 'Pending') &&
                  statusDraft.external_status === (candidate.external_status || 'Pending') &&
                  statusDraft.feedback_status === (candidate.feedback_status || 'Awaiting') &&
                  statusDraft.priority === (candidate.priority || 'Medium') &&
                  (statusDraft.interview_date || '') === (candidate.interview_date || '') &&
                  (statusDraft.interview_time || '') === (candidate.interview_time || '') &&
                  (statusDraft.interview_type || '') === (candidate.interview_type || '')
                }
                onClick={handleSaveStatus}
              >
                Save Status
              </Button>
            </div>

            </details></fieldset>
          </Card>
          <Card className="job-detail-panel job-detail-remarks candidate-detail-notes">
            <CardHeader title="Internal Notes" subtitle="Shared with your recruiting team" action={canEdit && !notesEditing && <Button size="sm" variant="ghost" leftIcon={candidate.notes ? 'edit' : 'plus'} onClick={() => setNotesEditing(true)}>{candidate.notes ? 'Edit notes' : 'Add notes'}</Button>} />
            {notesEditing ? <>
              <label htmlFor="candidate-detail-notes-input" className="job-detail-sr-label">Candidate notes</label>
              <Textarea id="candidate-detail-notes-input" value={notes} onChange={event => setNotes(event.target.value)} rows={7} placeholder="Add candidate context, interview feedback, or next steps…" />
              <div className="job-detail-note-actions"><Button size="sm" variant="ghost" disabled={savingNotes} onClick={() => { setNotes(candidate.notes || ''); setNotesEditing(false) }}>Cancel</Button><Button size="sm" variant="primary" loading={savingNotes} disabled={notes === (candidate.notes || '')} onClick={handleSaveNotes}>Save Notes</Button></div>
            </> : <div className="job-detail-remarks-body">{candidate.notes ? <MarkdownView content={candidate.notes} /> : <p className="job-detail-empty-copy">No notes yet. Add context or save a reviewed AI draft to this candidate.</p>}</div>}
          </Card>
          <ScoreWidget sc={sc} />
        </aside>
      </div>
      <CandidateFormDrawer open={editOpen} onClose={() => setEditOpen(false)} candidateData={candidate} candidates={candidate ? [candidate] : []} onSaved={() => load()} />
    </PageContainer>
  )
}
