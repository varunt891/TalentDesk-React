import { useState, useEffect, useMemo, useCallback } from 'react'
import { db, apiRequest } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useAIGovernance } from '../lib/ai/governance'
import { PageContainer } from '../components/layout/PageContainer'
import CandidateFormDrawer from '../components/candidates/CandidateFormDrawer'
import {
  Button, Badge, StatusPill, Card, CardHeader, KPICard, PageHeader,
  EmptyState, Avatar, Icon, useToast, Skeleton, PageSpinner, Textarea, Select,
} from '../components/ui'
import MarkdownView from '../components/MarkdownView'
import AIInsightCard from '../components/ai/AIInsightCard'
import { ensureArray, STATUS_TONE, computeScore } from '../lib/candidateHealth'

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
  return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24))
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function InfoRow({ label, value, mono = false }) {
  return (
    <div className="flex justify-between items-start gap-3 py-2 border-b border-border last:border-0">
      <span className="text-[11.5px] text-text3 font-medium shrink-0">{label}</span>
      <span className={`text-[12.5px] text-text font-medium text-right break-all leading-snug ${mono ? 'font-mono text-accent' : ''}`}>
        {value || <span className="text-text3">—</span>}
      </span>
    </div>
  )
}

function SectionCard({ title, children, action }) {
  return (
    <Card>
      <CardHeader title={title} action={action} />
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
    <Card className="bg-surface2">
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
    <Card className="bg-surface2 py-3">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10.5px] font-bold text-accent uppercase tracking-wider flex items-center gap-1">
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
                  } ${active ? 'shadow-[0_0_6px_2px_color-mix(in_srgb,var(--accent)_35%,transparent)]' : ''}`}
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
    <Card className={`border ${isPast ? 'border-border bg-surface2' : 'border-accent/30 bg-accent/5'}`}>
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
    <Card className="bg-surface2">
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
    </Card>
  )
}

// ─── Multi-Job Submission History ────────────────────────────────────────────

function SubmissionHistory({ current, others, onNavigate }) {
  const all = [{ ...current, _isCurrent: true }, ...others]
  if (all.length <= 1 && others.length === 0) return null

  const STATUS_COLOR = {
    Hired: 'green', 'Offer Extended': 'green', Shortlisted: 'accent',
    'Interview Scheduled': 'accent', 'Interview Done': 'accent',
    Rejected: 'red', Withdrew: 'neutral', 'On Hold': 'yellow',
    Pending: 'neutral', Submitted: 'accent',
  }

  return (
    <Card>
      <CardHeader
        title={`Submission History (${all.length})`}
        subtitle="All jobs this candidate has been submitted to"
      />
      <div className="flex flex-col divide-y divide-border">
        {all.map(sub => (
          <div
            key={sub.id}
            className={`flex items-center justify-between gap-3 py-2.5 ${sub._isCurrent ? '' : 'cursor-pointer hover:bg-surface2 rounded-[var(--radius-sm)] px-1 -mx-1 transition-colors'
              }`}
            onClick={() => !sub._isCurrent && onNavigate?.('candidate_detail', { candidateId: sub.id })}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[12px] font-semibold font-mono text-accent">{sub.job_id}</span>
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
              {!sub._isCurrent && <Icon name="chevronRight" size={12} className="text-text3" />}
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
  if (!log || log.length === 0) return null
  return (
    <Card>
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
    <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-border bg-surface2 px-3.5 py-3 transition-colors hover:border-accent/30">
      <div
        className="w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}
      >
        <Icon name={iconName} size={14} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2 mb-0.5">
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
  const orgId = organization?.id || profile?.org_id
  const userId = user?.id
  const { settings: aiSettings } = useAIGovernance(orgId)
  const aiEnabled = aiSettings.workspaces.candidates !== false

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

  // Resume download
  const [downloadingResume, setDownloadingResume] = useState(false)

  // Edit drawer
  const [editOpen, setEditOpen] = useState(false)

  const { toast } = useToast()

  const load = useCallback(async () => {
    if (!candidateId) return
    setLoading(true)
    setNotFound(false)

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
        window.open(res.url, '_blank', 'noopener')
      } else {
        throw new Error(res?.error || 'Could not generate a download link.')
      }
    } catch (err) {
      toast({ tone: 'error', title: err.message || 'Failed to download resume' })
    } finally {
      setDownloadingResume(false)
    }
  }

  const handleSaveStatus = async () => {
    if (!candidate) return
    setSavingStatus(true)
    try {
      const { data } = await db.from('candidates').update(statusDraft).eq('id', candidate.id).select()
      const updated = Array.isArray(data) ? data[0] : data
      if (updated) setCandidate(prev => ({ ...prev, ...updated }))
      toast({ tone: 'success', title: 'Status updated' })
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
      await db.from('candidates').update({ notes }).eq('id', candidate.id)
      setCandidate(prev => ({ ...prev, notes }))
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
    { id: 'timeline', label: 'Timeline', count: candidateTimeline.length },
    { id: 'resume', label: 'Resume', hidden: !candidate.resume_text && !candidate.resume_file_name },
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
    <PageContainer>
      {/* ── Page Header ─────────────────────────────────────────────────── */}
      <PageHeader
        eyebrow="Candidate Profile"
        title={fullName}
        subtitle={
          <>
            {candidate.job_title && <span>{candidate.job_title}</span>}
            {candidate.job_id && <> · <span className="font-mono text-accent">{candidate.job_id}</span></>}
            {candidate.client && <> · {candidate.client}</>}
          </>
        }
        actions={
          <>
            <Button variant="ghost" leftIcon="chevronLeft" onClick={() => onNavigate?.('candidates')}>
              Back
            </Button>
            {candidate.resume_file_name && (
              <Button variant="secondary" leftIcon="download" loading={downloadingResume} onClick={handleDownloadResume}>
                Resume
              </Button>
            )}
            {aiEnabled && (
              <Button variant="secondary" leftIcon="sparkles" onClick={() => setActiveTab('ai')}>
                Deep AI Fit
              </Button>
            )}
            <Button
              variant="primary"
              leftIcon="edit"
              onClick={() => setEditOpen(true)}
            >
              Edit
            </Button>
          </>
        }
      />

      {/* ── Status / badge pills ────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 mt-5 mb-1">
        <StatusPill status={candidate.internal_status || 'Pending'} tone={STATUS_TONE[candidate.internal_status] || 'neutral'} size="sm" />
        <StatusPill status={`Client: ${candidate.external_status || 'Pending'}`} tone={STATUS_TONE[candidate.external_status] || 'neutral'} size="sm" />
        <Badge tone={PRIORITY_TONE[candidate.priority] || 'neutral'}>{candidate.priority || 'Medium'} Priority</Badge>
        {candidate.work_auth && <Badge tone="neutral">{candidate.work_auth}</Badge>}
        {candidate.feedback_status && candidate.feedback_status !== 'Awaiting' && (
          <Badge tone={FEEDBACK_TONE[candidate.feedback_status] || 'neutral'}>
            Feedback: {candidate.feedback_status}
          </Badge>
        )}
      </div>

      {/* ── KPI Strip ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 mb-6">
        <KPICard
          label="Callbacks"
          value={candidateTimeline.filter(e => e.type === 'Callback').length}
          tone="accent"
          icon="callbacks"
        />
        <KPICard
          label="Follow-ups"
          value={candidateTimeline.filter(e => e.type === 'Follow-up').length}
          tone="ai"
          icon="followups"
        />
        <KPICard
          label="Days Since Submission"
          value={daysSinceSubmission != null ? daysSinceSubmission : '—'}
          tone={daysSinceSubmission != null && daysSinceSubmission > 30 ? 'red' : daysSinceSubmission != null && daysSinceSubmission > 14 ? 'yellow' : 'green'}
          icon="calendar"
        />
        <KPICard
          label="Profile Complete"
          value={`${profileCompleteness}%`}
          tone={profileCompleteness >= 80 ? 'green' : profileCompleteness >= 50 ? 'yellow' : 'red'}
          icon="checkCircle"
        />
      </div>

      {/* ── Two-column layout ───────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-3 gap-5">

        {/* LEFT — tabbed main content */}
        <div className="lg:col-span-2 flex flex-col gap-5">

          {/* Tab bar */}
          <div className="flex items-center gap-0.5 border-b border-border pb-0">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative px-4 py-2.5 text-[12.5px] font-semibold transition-colors duration-150 rounded-t-[var(--radius-sm)] focus:outline-none ${activeTab === tab.id
                  ? 'text-accent border-b-2 border-accent -mb-px bg-accent/5'
                  : 'text-text3 hover:text-text hover:bg-surface2'
                  }`}
              >
                {tab.label}
                {tab.count != null && tab.count > 0 && (
                  <span className={`ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${activeTab === tab.id ? 'bg-accent text-bg' : 'bg-surface3 text-text3'}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── Overview Tab ─────────────────────────────────────────── */}
          {activeTab === 'overview' && (
            <div className="flex flex-col gap-5 pt-1">
              {/* ── Pipeline Stage Bar ──────────────────────────────── */}
              <PipelineStageBar status={candidate.internal_status} />

              <div className="grid sm:grid-cols-2 gap-4">
                {/* Personal Info */}
                <SectionCard title="Personal Info">
                  <InfoRow label="Full Name" value={fullName} />
                  <InfoRow label="Email" value={candidate.email} />
                  <InfoRow label="Phone" value={candidate.phone} />
                  <InfoRow label="Location" value={candidate.location} />
                  <InfoRow label="Work Auth" value={candidate.work_auth} />
                  <InfoRow label="Experience" value={candidate.experience ? `${candidate.experience} yrs` : null} />
                  <InfoRow label="LinkedIn" value={candidate.linkedin} />
                  <InfoRow label="Relocation" value={candidate.relocation} />
                </SectionCard>

                {/* Submission Info */}
                <SectionCard title="Current Submission">
                  <InfoRow label="Date" value={candidate.submission_date} />
                  <InfoRow label="Job ID" value={candidate.job_id} mono />
                  <InfoRow label="Job Title" value={candidate.job_title} />
                  <InfoRow label="Client" value={candidate.client} />
                  <InfoRow label="Rate" value={candidate.rate} />
                  <InfoRow label="Follow-up Date" value={candidate.followup_date} />
                </SectionCard>
              </div>

              {/* ── Interview Card ──────────────────────────────────── */}
              {candidate.interview_date && (
                <InterviewCard candidate={candidate} />
              )}

              {/* ── Rate & Margin ────────────────────────────────────── */}
              <RateMarginCard candidate={candidate} />

              {/* ── Skills ──────────────────────────────────────────── */}
              <SectionCard title={`Skills${skills.length ? ` (${skills.length})` : ''}`}>
                {skills.length > 0 ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {skills.map(s => (
                      <Badge key={s} tone="accent" className="text-[12px]">{s}</Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-text3">No skills listed for this candidate.</p>
                )}
              </SectionCard>

              {/* ── Multi-Job Submission History ─────────────────────── */}
              <SubmissionHistory current={candidate} others={otherSubmissions} onNavigate={onNavigate} />

              {/* ── Activity Log ─────────────────────────────────────── */}
              <ActivityLogSection log={activityLog} />

              {/* ── Notes Preview ────────────────────────────────────── */}
              {candidate.notes && (
                <SectionCard
                  title="Recruiter Notes"
                  action={
                    (candidate.recruiter_name || candidate.fe_name) ? (
                      <div className="flex items-center gap-1.5 text-xs text-text3 font-medium">
                        <Icon name="user" size={12} className="text-accent" />
                        <span>Added by <strong className="text-text">{candidate.recruiter_name || candidate.fe_name}</strong></span>
                      </div>
                    ) : null
                  }
                >
                  <p className="text-[13px] text-text2 leading-relaxed whitespace-pre-wrap">{candidate.notes}</p>
                </SectionCard>
              )}
            </div>
          )}

          {/* ── Timeline Tab ─────────────────────────────────────────── */}
          {activeTab === 'timeline' && (
            <div className="flex flex-col gap-3 pt-2">
              {candidateTimeline.length === 0 ? (
                <EmptyState
                  icon="calendar"
                  title="No timeline activity"
                  description="Callbacks and follow-ups logged for this candidate will appear here."
                />
              ) : (
                <>
                  <p className="text-xs text-text3 mb-1">
                    {candidateTimeline.length} event{candidateTimeline.length !== 1 ? 's' : ''} — sorted by most recent
                  </p>
                  {candidateTimeline.map(ev => <TimelineItem key={ev.id} event={ev} />)}
                </>
              )}
            </div>
          )}

          {/* ── Resume Tab ───────────────────────────────────────────── */}
          {activeTab === 'resume' && (
            <div className="flex flex-col gap-4 pt-2">
              {candidate.resume_file_name && (
                <Card className="bg-surface2 border-accent/20">
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-[var(--radius-md)] flex items-center justify-center"
                        style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)' }}
                      >
                        <Icon name="postings" size={18} className="text-accent" />
                      </div>
                      <div>
                        <div className="text-[13px] font-semibold text-text">{candidate.resume_file_name}</div>
                        {candidate.resume_file_size && (
                          <div className="text-xs text-text3">{Math.round(candidate.resume_file_size / 1024)} KB</div>
                        )}
                      </div>
                    </div>
                    <Button variant="primary" leftIcon="download" loading={downloadingResume} onClick={handleDownloadResume}>
                      Download Resume
                    </Button>
                  </div>
                </Card>
              )}

              {candidate.resume_text ? (
                <Card>
                  <CardHeader
                    title="Resume Text"
                    subtitle="Full parsed text from the uploaded resume"
                  />
                  <div className="text-[13px] text-text2 leading-relaxed prose prose-sm max-w-none">
                    <MarkdownView content={candidate.resume_text} />
                  </div>
                </Card>
              ) : (
                !candidate.resume_file_name && (
                  <EmptyState
                    icon="postings"
                    title="No resume on file"
                    description="Upload a resume in the candidate editor to see it here."
                    actionLabel="Edit Candidate"
                    onAction={() => onNavigate?.('candidates', { editCandidateId: candidate.id })}
                  />
                )
              )}
            </div>
          )}

          {/* ── AI Tab ───────────────────────────────────────────────── */}
          {activeTab === 'ai' && aiEnabled && (
            <div className="flex flex-col gap-3 pt-2">
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

        {/* RIGHT SIDEBAR */}
        <div className="flex flex-col gap-5">

          {/* Compact Health Score widget — top of sidebar */}
          <ScoreWidget sc={sc} />

          {/* Front End / Ownership */}
          <SectionCard title="Front End & Ownership">
            {(candidate.fe_name || candidate.recruiter_name || candidate.account_manager) ? (
              <div className="flex flex-col gap-3">
                {candidate.fe_name && (
                  <div className="flex items-center gap-3">
                    <Avatar name={candidate.fe_name} size="sm" />
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-text truncate">{candidate.fe_name}</div>
                      <div className="text-[11px] text-text3 truncate">
                        Front End{candidate.fe_extension ? ` · ext. ${candidate.fe_extension}` : ''}
                      </div>
                    </div>
                  </div>
                )}
                {candidate.recruiter_name && candidate.recruiter_name !== candidate.fe_name && (
                  <div className="flex items-center gap-3 pt-3 border-t border-border">
                    <Avatar name={candidate.recruiter_name} size="sm" />
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-text truncate">{candidate.recruiter_name}</div>
                      <div className="text-[11px] text-text3">Recruiter</div>
                    </div>
                  </div>
                )}
                {candidate.account_manager && (
                  <div className="flex items-center gap-3 pt-3 border-t border-border">
                    <Avatar name={candidate.account_manager} size="sm" />
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-text truncate">{candidate.account_manager}</div>
                      <div className="text-[11px] text-text3">Account Manager</div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[12px] text-text3">No ownership assigned.</p>
            )}
          </SectionCard>

          {/* Quick Status */}
          <Card>
            <CardHeader
              title="Quick Status"
              subtitle="Update pipeline status inline"
            />
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-[10.5px] font-bold uppercase tracking-wide text-text3 block mb-1.5">Internal</label>
                <Select
                  value={statusDraft.internal_status}
                  onChange={v => setStatusDraft(d => ({ ...d, internal_status: v }))}
                  options={STATUSES.map(s => ({ value: s, label: s }))}
                />
              </div>
              <div>
                <label className="text-[10.5px] font-bold uppercase tracking-wide text-text3 block mb-1.5">Client / External</label>
                <Select
                  value={statusDraft.external_status}
                  onChange={v => setStatusDraft(d => ({ ...d, external_status: v }))}
                  options={STATUSES.map(s => ({ value: s, label: s }))}
                />
              </div>
              <div>
                <label className="text-[10.5px] font-bold uppercase tracking-wide text-text3 block mb-1.5">Priority</label>
                <Select
                  value={statusDraft.priority}
                  onChange={v => setStatusDraft(d => ({ ...d, priority: v }))}
                  options={['High', 'Medium', 'Low'].map(o => ({ value: o, label: o }))}
                />
              </div>
              <Button
                variant="primary"
                size="sm"
                loading={savingStatus}
                disabled={
                  statusDraft.internal_status === (candidate.internal_status || 'Pending') &&
                  statusDraft.external_status === (candidate.external_status || 'Pending') &&
                  statusDraft.priority === (candidate.priority || 'Medium')
                }
                onClick={handleSaveStatus}
              >
                Save Status
              </Button>
            </div>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader title="Internal Notes" subtitle="Visible to your whole org" />
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={5}
              placeholder="Add internal notes about this candidate..."
              className="mt-1"
            />
            <div className="flex justify-end mt-2">
              <Button
                size="sm"
                variant="primary"
                loading={savingNotes}
                disabled={notes === (candidate.notes || '')}
                onClick={handleSaveNotes}
              >
                Save Notes
              </Button>
            </div>
          </Card>

          {/* Submission Details snapshot */}
          <SectionCard title="Submission Details">
            <InfoRow label="Submitted" value={candidate.submission_date} />
            <InfoRow label="Job ID" value={candidate.job_id} mono />
            <InfoRow label="Client" value={candidate.client} />
            <InfoRow label="Rate" value={candidate.rate} />
            <InfoRow label="Relocation" value={candidate.relocation} />
          </SectionCard>
        </div>
      </div>

      {/* ── Edit Drawer ─────────────────────────────────────────────────── */}
      <CandidateFormDrawer
        open={editOpen}
        onClose={() => setEditOpen(false)}
        candidateData={candidate}
        candidates={candidate ? [candidate] : []}
        onSaved={() => load()}
      />
    </PageContainer>
  )
}
