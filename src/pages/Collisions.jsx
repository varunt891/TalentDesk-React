import { useState, useEffect, useMemo, useCallback } from 'react'
import { db, apiRequest } from '../lib/api'
import { PageContainer } from '../components/layout/PageContainer'
import { EntityDrawer } from '../components/workspace'
import {
  Button, Badge, Card, KPICard, PageHeader, Tabs, Table, EmptyState,
  useToast, SearchBar, Select, Avatar, Icon,
} from '../components/ui'
import { cn } from '../components/ui/utils'

const TABS = [
  { id: 'open', label: 'Open' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'dismissed', label: 'Dismissed' },
]

function getSeverity(r) {
  const isDual = r.match_field === 'both'
  if (r.type === 'hard') {
    return isDual
      ? { label: 'Critical Risk', tone: 'red', color: 'text-rose-500', bg: 'bg-rose-500/10 border-rose-500/20', stripe: 'bg-rose-500' }
      : { label: 'High Risk', tone: 'red', color: 'text-rose-400', bg: 'bg-rose-500/8 border-rose-500/15', stripe: 'bg-rose-400' }
  }
  return isDual
    ? { label: 'Medium Risk', tone: 'yellow', color: 'text-amber-500', bg: 'bg-amber-500/10 border-amber-500/20', stripe: 'bg-amber-400' }
    : { label: 'Low Risk', tone: 'neutral', color: 'text-text3', bg: 'bg-surface2/60 border-border/60', stripe: 'bg-border' }
}

function enhanceRow(r, map) {
  const c1 = map[r.candidate_id]
  const c2 = map[r.matched_candidate_id]

  // If either candidate no longer exists in DB → orphaned collision
  const c1Deleted = r.candidate_id && !c1
  const c2Deleted = r.matched_candidate_id && !c2
  const isOrphaned = c1Deleted || c2Deleted

  // Live emails & phones
  const c1EmailRaw = c1 ? c1.email : r.candidate_email
  const c2EmailRaw = c2 ? c2.email : r.candidate_email
  const c1PhoneRaw = c1 ? c1.phone : r.candidate_phone
  const c2PhoneRaw = c2 ? c2.phone : r.candidate_phone

  const c1Email = c1EmailRaw && String(c1EmailRaw).trim() ? String(c1EmailRaw).trim() : null
  const c2Email = c2EmailRaw && String(c2EmailRaw).trim() ? String(c2EmailRaw).trim() : null
  const c1Phone = c1PhoneRaw && String(c1PhoneRaw).trim() ? String(c1PhoneRaw).trim() : null
  const c2Phone = c2PhoneRaw && String(c2PhoneRaw).trim() ? String(c2PhoneRaw).trim() : null

  // Check live field matching
  const c1HasEmail = !!c1Email
  const c2HasEmail = !!c2Email
  const emailsMatch = c1HasEmail && c2HasEmail && c1Email.toLowerCase() === c2Email.toLowerCase()

  const c1HasPhone = !!c1Phone
  const c2HasPhone = !!c2Phone
  const c1PhoneClean = c1Phone ? c1Phone.replace(/\D/g, '') : ''
  const c2PhoneClean = c2Phone ? c2Phone.replace(/\D/g, '') : ''
  const phonesMatch = c1HasPhone && c2HasPhone && c1PhoneClean === c2PhoneClean && c1PhoneClean.length >= 7

  // Match triggers
  const emailTrigger = r.match_field === 'email' || r.match_field === 'both'
  const phoneTrigger = r.match_field === 'phone' || r.match_field === 'both'

  // Per-trigger staleness
  const emailStale = !isOrphaned && emailTrigger && !emailsMatch
  const phoneStale = !isOrphaned && phoneTrigger && !phonesMatch
  const isStale = emailStale || phoneStale

  // Per-candidate cleared flags
  const c1EmailCleared = !isOrphaned && emailTrigger && !c1HasEmail
  const c2EmailCleared = !isOrphaned && emailTrigger && !c2HasEmail
  const c1PhoneCleared = !isOrphaned && phoneTrigger && !c1HasPhone
  const c2PhoneCleared = !isOrphaned && phoneTrigger && !c2HasPhone

  const c1JobId = c1?.job_id || r.job_id || ''
  const c2JobId = c2?.job_id || r.matched_job_id || ''
  const differentJobSameClient = r.type === 'soft' && c1JobId && c2JobId && c1JobId !== c2JobId

  return {
    ...r,
    isStale,
    emailStale,
    phoneStale,
    emailsMatch,
    phonesMatch,
    c1EmailCleared,
    c2EmailCleared,
    c1PhoneCleared,
    c2PhoneCleared,
    isOrphaned,
    c1Deleted,
    c2Deleted,
    differentJobSameClient,
    c1Name: c1 ? `${c1.first_name || ''} ${c1.last_name || ''}`.trim() : r.candidate_name || 'Candidate A',
    c1Email: c1Email || 'No email',
    c1Phone: c1Phone || 'No phone',
    c1JobTitle: c1?.job_title || r.job_title || 'No job specified',
    c1JobId,
    c1Client: c1?.client || r.client || 'No client',
    c1Recruiter: c1?.recruiter_name || r.submitting_recruiter_name || 'Recruiter A',
    c1Status: c1?.internal_status || 'Submitted',
    c1Date: c1?.submission_date || (r.created_at ? new Date(r.created_at).toLocaleDateString() : 'Recent'),
    c2Name: c2 ? `${c2.first_name || ''} ${c2.last_name || ''}`.trim() : r.candidate_name || 'Candidate B',
    c2Email: c2Email || 'No email',
    c2Phone: c2Phone || 'No phone',
    c2JobTitle: c2?.job_title || r.matched_job_title || 'No job specified',
    c2JobId,
    c2Client: c2?.client || r.matched_client || 'No client',
    c2Recruiter: c2?.recruiter_name || r.matched_recruiter_name || 'Recruiter B',
    c2Status: c2?.internal_status || 'Submitted',
    c2Date: c2?.submission_date || (r.created_at ? new Date(r.created_at).toLocaleDateString() : 'Recent'),
  }
}

// Group collision rows by Candidate Identity to collapse multi-submission clusters
function groupCollisions(rows) {
  const map = new Map()

  rows.forEach(r => {
    const emailKey = r.candidate_email || (r.c1Email !== 'No email' ? r.c1Email : null) || (r.c2Email !== 'No email' ? r.c2Email : null)
    const phoneKey = r.candidate_phone || (r.c1Phone !== 'No phone' ? r.c1Phone : null) || (r.c2Phone !== 'No phone' ? r.c2Phone : null)
    const key = (emailKey || phoneKey || r.c1Name || r.id).toLowerCase()

    if (!map.has(key)) map.set(key, [])
    map.get(key).push(r)
  })

  const result = []

  map.forEach((groupRows, key) => {
    if (groupRows.length === 1) {
      result.push({ isCluster: false, data: groupRows[0] })
    } else {
      const subMap = new Map()

      groupRows.forEach(r => {
        const k1 = r.candidate_id || (r.c1Name + r.c1JobId)
        if (!subMap.has(k1)) {
          subMap.set(k1, {
            id: r.candidate_id,
            name: r.c1Name,
            email: r.c1Email,
            phone: r.c1Phone,
            recruiter: r.c1Recruiter,
            jobTitle: r.c1JobTitle,
            jobId: r.c1JobId,
            client: r.c1Client,
            status: r.c1Status,
            date: r.c1Date,
            isDeleted: r.c1Deleted,
          })
        }
        const k2 = r.matched_candidate_id || (r.c2Name + r.c2JobId)
        if (!subMap.has(k2)) {
          subMap.set(k2, {
            id: r.matched_candidate_id,
            name: r.c2Name,
            email: r.c2Email,
            phone: r.c2Phone,
            recruiter: r.c2Recruiter,
            jobTitle: r.c2JobTitle,
            jobId: r.c2JobId,
            client: r.c2Client,
            status: r.c2Status,
            date: r.c2Date,
            isDeleted: r.c2Deleted,
          })
        }
      })

      const first = groupRows[0]
      result.push({
        isCluster: true,
        id: `cluster-${key}`,
        candidateName: first.c1Name || first.candidate_name,
        candidateEmail: first.c1Email !== 'No email' ? first.c1Email : first.c2Email,
        candidatePhone: first.c1Phone !== 'No phone' ? first.c1Phone : first.c2Phone,
        client: first.c1Client,
        submissions: Array.from(subMap.values()),
        rows: groupRows,
        status: groupRows.every(r => r.status === 'dismissed') ? 'dismissed' :
          groupRows.every(r => r.status === 'confirmed') ? 'confirmed' : 'open',
        created_at: first.created_at,
      })
    }
  })

  return result
}

export default function Collisions({ onNavigate }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('open')
  const [viewMode, setViewMode] = useState('cards')
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const [matchFilter, setMatchFilter] = useState('all')
  const [inspecting, setInspecting] = useState(null)
  const [resolvingId, setResolvingId] = useState(null)
  const { toast } = useToast()

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [cRes, candRes] = await Promise.all([
        db.from('submission_collisions').select('*').order('created_at', { ascending: false }),
        db.from('candidates').select('*'),
      ])
      if (cRes.error) toast({ tone: 'error', title: 'Failed to load collisions', description: cRes.error.message })
      const map = {}
      if (candRes?.data) candRes.data.forEach(c => { map[c.id] = c })
      const enhanced = (cRes.data || []).map(r => enhanceRow(r, map))
      setRows(enhanced)
      setInspecting(prev => prev ? enhanced.find(i => i.id === prev.id) || null : null)
    } catch (err) {
      toast({ tone: 'error', title: 'Failed to load collision data', description: err.message })
    } finally {
      if (!silent) setLoading(false)
    }
  }, [toast])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const fn = () => { if (document.visibilityState === 'visible') load(true) }
    document.addEventListener('visibilitychange', fn)
    return () => document.removeEventListener('visibilitychange', fn)
  }, [load])

  const counts = useMemo(() => ({
    open: rows.filter(r => r.status === 'open').length,
    confirmed: rows.filter(r => r.status === 'confirmed').length,
    dismissed: rows.filter(r => r.status === 'dismissed').length,
  }), [rows])

  const filtered = useMemo(() => rows.filter(r => {
    if (r.status !== tab) return false
    if (typeFilter !== 'all' && r.type !== typeFilter) return false
    if (matchFilter !== 'all' && r.match_field !== matchFilter) return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      const t = [r.c1Name, r.c1Email, r.c1Phone, r.c1JobTitle, r.c1JobId, r.c1Client, r.c1Recruiter,
      r.c2Name, r.c2Email, r.c2Phone, r.c2JobTitle, r.c2JobId, r.c2Client, r.c2Recruiter].join(' ').toLowerCase()
      if (!t.includes(q)) return false
    }
    return true
  }), [rows, tab, typeFilter, matchFilter, searchQuery])

  // Group filtered rows for Cards view
  const groupedCards = useMemo(() => groupCollisions(filtered), [filtered])

  const resolve = async (id, status) => {
    setResolvingId(id)
    try {
      await apiRequest(`/data/submission_collisions/${id}/resolve`, { method: 'PATCH', body: { status } })
      toast({ tone: 'success', title: status === 'dismissed' ? 'Marked not a duplicate' : 'Confirmed duplicate' })
      await load()
    } catch (err) {
      toast({ tone: 'error', title: 'Failed to update', description: err.message })
    } finally {
      setResolvingId(null)
    }
  }

  const resolveCluster = async (clusterRows, status) => {
    const primaryId = clusterRows[0].id
    setResolvingId(primaryId)
    try {
      await Promise.all(clusterRows.map(r => apiRequest(`/data/submission_collisions/${r.id}/resolve`, { method: 'PATCH', body: { status } })))
      toast({ tone: 'success', title: status === 'dismissed' ? 'Marked cluster as valid' : 'Confirmed cluster duplicates' })
      await load()
    } catch (err) {
      toast({ tone: 'error', title: 'Failed to update cluster', description: err.message })
    } finally {
      setResolvingId(null)
    }
  }

  const tableColumns = [
    {
      key: 'pair', header: 'Submissions (A vs B)',
      render: (r) => (
        <div className="flex flex-col gap-1 py-0.5 min-w-[220px]">
          <div className="flex items-center gap-2">
            <Avatar name={r.c1Name} size="xs" className="shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold text-xs text-text truncate">{r.c1Name}</div>
              <div className="text-[10px] text-text3 truncate">{r.c1Email !== 'No email' ? r.c1Email : r.c1Phone}<span className="opacity-60"> · {r.c1Recruiter}</span></div>
            </div>
          </div>
          <div className="text-[9.5px] text-text3 pl-1 font-mono">vs</div>
          <div className="flex items-center gap-2">
            <Avatar name={r.c2Name} size="xs" className="shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold text-xs text-text truncate">{r.c2Name}</div>
              <div className="text-[10px] text-text3 truncate">{r.c2Email !== 'No email' ? r.c2Email : r.c2Phone}<span className="opacity-60"> · {r.c2Recruiter}</span></div>
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'severity', header: 'Severity & Cause',
      render: (r) => {
        const sev = getSeverity(r)
        return (
          <div className="flex flex-col gap-1 min-w-[140px]">
            <Badge size="sm" tone={r.isStale ? 'yellow' : sev.tone} className="self-start font-bold text-[10px]">
              {r.isStale ? 'Stale Data' : sev.label}
            </Badge>
            <div className="text-[10px] text-text2">
              {r.isStale ? 'Contact info changed' :
                r.type === 'hard' ? 'Same job · 2 recruiters' :
                  r.differentJobSameClient ? 'Same client · diff jobs' :
                    'Same client · same role'}
            </div>
          </div>
        )
      },
    },
    {
      key: 'matched_value', header: 'Trigger Value',
      render: (r) => {
        const val = r.match_field === 'email' || r.match_field === 'both'
          ? (r.c1Email !== 'No email' ? r.c1Email : r.c2Email)
          : (r.c1Phone !== 'No phone' ? r.c1Phone : r.c2Phone)
        return (
          <div className="min-w-[130px]">
            {r.isStale
              ? <span className="font-mono text-[10.5px] text-text3 line-through bg-surface2/50 px-2 py-0.5 rounded border border-border/40 block truncate">{val}</span>
              : <span className="font-mono text-[10.5px] text-rose-400 font-medium bg-rose-500/8 px-2 py-0.5 rounded border border-rose-500/15 select-all block truncate">{val}</span>}
            {r.isStale && <span className="text-[9px] text-amber-500 mt-0.5 flex items-center gap-1"><Icon name="alertCircle" size={9} className="shrink-0" /> Changed</span>}
          </div>
        )
      },
    },
    {
      key: 'requisition', header: 'Jobs / Client',
      render: (r) => (
        <div className="flex flex-col gap-1 text-xs min-w-[150px]">
          <div className="bg-surface2/40 px-2 py-1.5 rounded border border-border/30">
            <div
              className={cn("font-medium text-text text-[11px] truncate", onNavigate && r.c1JobId && "hover:text-accent cursor-pointer")}
              onClick={(e) => {
                if (onNavigate && r.c1JobId) {
                  e.stopPropagation()
                  onNavigate('job_detail', { jobId: r.c1JobId })
                }
              }}
              title={r.c1JobId ? `Click to view Job ${r.c1JobId}` : r.c1JobTitle}
            >
              {r.c1JobTitle}
            </div>
            <div className="text-[10px] text-text3 flex items-center justify-between mt-0.5">
              <span className="truncate">{r.c1Client}</span>
              {r.c1JobId && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (onNavigate) onNavigate('job_detail', { jobId: r.c1JobId })
                  }}
                  className="font-mono text-accent shrink-0 ml-1 text-[9.5px] font-bold hover:underline hover:text-accent-light cursor-pointer flex items-center gap-0.5 bg-accent/10 px-1 py-0.2 rounded border border-accent/20"
                  title={`Navigate to Job ${r.c1JobId}`}
                >
                  {r.c1JobId}
                  <Icon name="arrowUpRight" size={9} />
                </button>
              )}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'created_at', header: 'Detected',
      render: (r) => (
        <div className="flex flex-col text-[11px] min-w-[95px]">
          <span className="text-text font-medium">{r.created_at ? new Date(r.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}</span>
          <span className="text-[10px] text-text3">{r.created_at ? new Date(r.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
        </div>
      ),
    },
  ]

  const tableRowActions = (r) => (
    <div className="flex items-center gap-1">
      <Button size="xs" variant="secondary" leftIcon="search" onClick={() => setInspecting(r)}>Inspect</Button>
      {tab === 'open' && (
        <>
          <Button size="xs" variant="ghost" loading={resolvingId === r.id} onClick={() => resolve(r.id, 'dismissed')}>Not Duplicate</Button>
          <Button size="xs" variant="danger" loading={resolvingId === r.id} onClick={() => resolve(r.id, 'confirmed')}>Confirm</Button>
        </>
      )}
    </div>
  )

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Submission Integrity"
        title="Collisions & Duplicate Submissions"
        subtitle="Identify, inspect, and resolve duplicate candidate submissions across recruiters, jobs, and clients."
        actions={<Button variant="secondary" leftIcon="refresh" onClick={() => load()} loading={loading} size="sm">Refresh</Button>}
      />

      {/* KPI Stats Bar - Compact & Soft */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3.5 mt-5 mb-5">
        <KPICard label="Open Collisions" value={counts.open} tone="red" className="p-3" />
        <KPICard label="Confirmed Duplicates" value={counts.confirmed} tone="orange" className="p-3" />
        <KPICard label="Dismissed / Valid" value={counts.dismissed} tone="neutral" className="p-3" />
      </div>

      {/* Responsive Filter & View Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <Tabs items={TABS} value={tab} onChange={setTab} />

        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          <div className="flex items-center gap-1 bg-surface2/80 p-1 rounded-full border border-border shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={cn('px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer',
                viewMode === 'cards' ? 'bg-surface text-accent shadow-xs border border-border/80' : 'text-text3 hover:text-text')}
            >
              <Icon name="grid" size={12} /> Cards
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={cn('px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer',
                viewMode === 'table' ? 'bg-surface text-accent shadow-xs border border-border/80' : 'text-text3 hover:text-text')}
            >
              <Icon name="list" size={12} /> Table
            </button>
          </div>

          <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder="Search candidate, job, email..." className="w-full sm:w-52 text-xs" />
          <Select value={typeFilter} onChange={setTypeFilter} className="w-full sm:w-36 text-xs" options={[{ value: 'all', label: 'All Types' }, { value: 'hard', label: 'Hard (Same Job)' }, { value: 'soft', label: 'Soft (Same Client)' }]} />
          <Select value={matchFilter} onChange={setMatchFilter} className="w-full sm:w-32 text-xs" options={[{ value: 'all', label: 'All Triggers' }, { value: 'email', label: 'Email Match' }, { value: 'phone', label: 'Phone Match' }, { value: 'both', label: 'Dual Match' }]} />
        </div>
      </div>

      {/* Main Content Area */}
      {viewMode === 'cards' ? (
        <div className="flex flex-col gap-3.5 mb-8">
          {groupedCards.length === 0 ? (
            <Card className="p-8">
              <EmptyState icon="alertCircle" title="No collisions found" description={searchQuery || typeFilter !== 'all' || matchFilter !== 'all' ? 'No records match your active search filters.' : 'No submission collisions recorded in this view.'} />
            </Card>
          ) : groupedCards.map(item => {
            if (item.isCluster) {
              // Multi-submission cluster card (3+ submissions for same candidate)
              const cluster = item
              const activeCount = cluster.submissions.filter(s => !s.isDeleted).length
              const deletedCount = cluster.submissions.filter(s => s.isDeleted).length
              const isOrphanedCluster = activeCount <= 1

              return (
                <Card key={cluster.id} className="border-amber-500/25 hover:border-amber-500/40 transition-all shadow-xs relative overflow-hidden bg-surface p-0">
                  <div className={cn('absolute left-0 top-0 bottom-0 w-1', isOrphanedCluster ? 'bg-text3' : 'bg-amber-400')} />
                  <div className="p-3.5 sm:p-4 flex flex-col gap-3">
                    {/* Header */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={cluster.candidateName} size="sm" />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-text">{cluster.candidateName}</span>
                            <Badge size="xs" tone={isOrphanedCluster ? 'neutral' : 'yellow'} className="font-bold text-[9.5px]">
                              {isOrphanedCluster
                                ? `Orphaned (${deletedCount} Deleted)`
                                : deletedCount > 0
                                  ? `${activeCount} Active · ${deletedCount} Deleted`
                                  : `${cluster.submissions.length} Submissions Cluster`}
                            </Badge>
                          </div>
                          <div className="text-[11px] text-text3 flex items-center gap-2 mt-0.5">
                            <span className="font-mono text-accent">{cluster.candidateEmail}</span>
                            {cluster.candidatePhone && <span>· <span className="font-mono">{cluster.candidatePhone}</span></span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10.5px] text-text3">{cluster.created_at ? new Date(cluster.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Recently'}</span>
                        <Badge size="xs" tone={cluster.status === 'open' ? 'red' : cluster.status === 'confirmed' ? 'orange' : 'neutral'}>{cluster.status.toUpperCase()}</Badge>
                      </div>
                    </div>

                    {/* Submissions Horizontal Scroll Container */}
                    <div className="flex items-stretch gap-2.5 overflow-x-auto pb-1.5 pt-0.5 scroll-smooth" style={{ scrollbarWidth: 'thin' }}>
                      {cluster.submissions.map((sub, idx) => (
                        <div
                          key={sub.id || idx}
                          className={cn(
                            'p-2.5 rounded-lg border flex flex-col gap-1.5 text-xs min-w-[220px] sm:min-w-[240px] max-w-[260px] shrink-0 relative',
                            sub.isDeleted ? 'bg-surface2/20 border-border/30 opacity-60' : 'bg-surface2/40 border-border/50'
                          )}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[9.5px] font-bold text-accent uppercase tracking-wider">Sub #{idx + 1} · {sub.recruiter}</span>
                            {sub.isDeleted
                              ? <span className="text-[8.5px] font-bold text-text3 bg-surface2/80 px-1.5 py-0.5 rounded border border-border/40 tracking-wide">DELETED</span>
                              : <span className="text-[9px] text-text3 font-medium bg-surface2/80 px-1.5 py-0.5 rounded border border-border/40">{sub.status}</span>}
                          </div>
                          <div
                            className={cn(
                              'font-semibold text-xs line-clamp-1',
                              sub.isDeleted ? 'text-text3 line-through' : onNavigate && sub.jobId ? 'text-text hover:text-accent cursor-pointer' : 'text-text'
                            )}
                            title={sub.jobId ? `Click to view Job ${sub.jobId}` : sub.jobTitle}
                            onClick={() => {
                              if (onNavigate && sub.jobId) onNavigate('job_detail', { jobId: sub.jobId })
                            }}
                          >
                            {sub.jobTitle}
                          </div>
                          <div className="flex items-center justify-between text-[10.5px] text-text3 mt-0.5">
                            <span className="truncate">{sub.client}</span>
                            {sub.jobId && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  if (onNavigate) onNavigate('job_detail', { jobId: sub.jobId })
                                }}
                                className="font-mono text-accent font-bold shrink-0 ml-1 text-[9.5px] hover:underline hover:text-accent-light cursor-pointer flex items-center gap-0.5 bg-accent/10 px-1.5 py-0.5 rounded border border-accent/20"
                                title={`Navigate to Job ${sub.jobId}`}
                              >
                                {sub.jobId}
                                <Icon name="arrowUpRight" size={9} />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Cluster Action Footer */}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/30 flex-wrap">
                      <Button size="xs" variant="secondary" leftIcon="search" onClick={() => setInspecting({ isCluster: true, ...cluster })}>Inspect Cluster Details</Button>
                      {tab === 'open' ? (
                        <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end">
                          <Button size="xs" variant="ghost" loading={resolvingId === cluster.rows[0].id} onClick={() => resolveCluster(cluster.rows, 'dismissed')}>Mark All Valid</Button>
                          <Button size="xs" variant="danger" leftIcon="check" loading={resolvingId === cluster.rows[0].id} onClick={() => resolveCluster(cluster.rows, 'confirmed')}>Confirm All Duplicates</Button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-text3 font-medium">Resolved Cluster</span>
                      )}
                    </div>
                  </div>
                </Card>
              )
            }

            // Standard single pairwise collision card
            const r = item.data
            const sev = getSeverity(r)
            return (
              <Card key={r.id} className="border-border/60 hover:border-border transition-all shadow-xs relative overflow-hidden bg-surface p-0">
                <div className={cn('absolute left-0 top-0 bottom-0 w-0.5',
                  r.isOrphaned ? 'bg-text3' : r.isStale ? 'bg-amber-400' : sev.stripe)} />

                <div className="p-3 sm:p-3.5 flex flex-col gap-2.5">
                  {/* Card Header Row */}
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge size="xs" tone={r.isOrphaned ? 'neutral' : r.isStale ? 'yellow' : sev.tone} className="font-semibold shrink-0 text-[10px]">
                        {r.isOrphaned ? 'Orphaned' : r.isStale ? 'Stale Data' : sev.label}
                      </Badge>
                      <span className="text-[11px] text-text2">
                        {r.isOrphaned ? `${r.c1Deleted && r.c2Deleted ? 'Both candidates' : 'One candidate'} deleted from DB` :
                          r.isStale ? 'Contact data changed — collision may no longer apply' :
                            r.type === 'hard' ? 'Same job submitted by two recruiters' :
                              r.differentJobSameClient ? 'Same client · different job IDs' :
                                'Same candidate submitted to same client'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] text-text3">{r.created_at ? new Date(r.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Recently'}</span>
                      <Badge size="xs" tone={r.status === 'open' ? 'red' : r.status === 'confirmed' ? 'orange' : 'neutral'} className="text-[9px] px-1.5 py-0">{r.status.toUpperCase()}</Badge>
                    </div>
                  </div>

                  {/* Trigger Info Line */}
                  <div className="flex items-center gap-2 flex-wrap text-[10.5px]">
                    <span className="text-text3 uppercase font-semibold text-[9.5px] tracking-wider shrink-0">
                      {r.match_field === 'both' ? 'Email + Phone match' : r.match_field === 'email' ? 'Email match' : 'Phone match'}
                    </span>
                    {(r.match_field === 'email' || r.match_field === 'both') && (
                      r.emailStale
                        ? <span className="font-mono text-text3 line-through bg-surface2/60 px-2 py-0.5 rounded border border-border/40 flex items-center gap-1">
                          {r.candidate_email || (r.c1Email !== 'No email' ? r.c1Email : r.c2Email)}
                          <span className="no-underline not-italic text-[8px] font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-1 py-0 rounded">STALE</span>
                        </span>
                        : <span className="font-mono font-medium text-rose-400 bg-rose-500/8 px-2 py-0.5 rounded border border-rose-500/15 select-all">{r.c1Email}</span>
                    )}
                    {(r.match_field === 'phone' || r.match_field === 'both') && (
                      r.phoneStale
                        ? <span className="font-mono text-text3 line-through bg-surface2/60 px-2 py-0.5 rounded border border-border/40 flex items-center gap-1">
                          {r.candidate_phone || (r.c1Phone !== 'No phone' ? r.c1Phone : r.c2Phone)}
                          <span className="no-underline not-italic text-[8px] font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-1 py-0 rounded">STALE</span>
                        </span>
                        : <span className="font-mono font-medium text-rose-400 bg-rose-500/8 px-2 py-0.5 rounded border border-rose-500/15 select-all">{r.c1Phone}</span>
                    )}
                  </div>

                  {/* Submissions Comparison Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_24px_1fr] items-start gap-2">
                    <SubmissionCard
                      label="Submission A"
                      name={r.c1Name}
                      recruiter={r.c1Recruiter}
                      email={r.c1Email}
                      phone={r.c1Phone}
                      jobTitle={r.c1JobTitle}
                      jobId={r.c1JobId}
                      client={r.c1Client}
                      status={r.c1Status}
                      matchField={r.match_field}
                      emailMatched={r.emailsMatch}
                      phoneMatched={r.phonesMatch}
                      emailCleared={r.c1EmailCleared}
                      phoneCleared={r.c1PhoneCleared}
                      isDeleted={r.c1Deleted}
                      onNavigate={onNavigate}
                      isPrimary
                    />

                    <div className="hidden md:flex items-center justify-center self-stretch">
                      <div className={cn('w-5 h-5 rounded-full flex items-center justify-center text-[8.5px] font-extrabold border shrink-0',
                        r.isOrphaned ? 'text-text3 bg-surface2/60 border-border/60' :
                          r.isStale ? 'text-amber-500 bg-amber-500/10 border-amber-500/30' :
                            `${sev.color} ${sev.bg}`)}>VS</div>
                    </div>

                    <SubmissionCard
                      label="Submission B"
                      name={r.c2Name}
                      recruiter={r.c2Recruiter}
                      email={r.c2Email}
                      phone={r.c2Phone}
                      jobTitle={r.c2JobTitle}
                      jobId={r.c2JobId}
                      client={r.c2Client}
                      status={r.c2Status}
                      matchField={r.match_field}
                      emailMatched={r.emailsMatch}
                      phoneMatched={r.phonesMatch}
                      emailCleared={r.c2EmailCleared}
                      phoneCleared={r.c2PhoneCleared}
                      isDeleted={r.c2Deleted}
                      onNavigate={onNavigate}
                    />
                  </div>

                  {/* Action Footer */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/30 flex-wrap">
                    <Button size="xs" variant="secondary" leftIcon="search" onClick={() => setInspecting(r)}>Inspect Details</Button>
                    {tab === 'open' ? (
                      <div className="flex items-center gap-1.5 w-full sm:w-auto justify-end">
                        <Button size="xs" variant="ghost" loading={resolvingId === r.id} onClick={() => resolve(r.id, 'dismissed')}>Not Duplicate</Button>
                        {!r.isOrphaned && <Button size="xs" variant="danger" leftIcon="check" loading={resolvingId === r.id} onClick={() => resolve(r.id, 'confirmed')}>Confirm Duplicate</Button>}
                      </div>
                    ) : (
                      <span className="text-[11px] text-text3 font-medium">Resolved {r.resolved_at ? new Date(r.resolved_at).toLocaleDateString() : '—'}</span>
                    )}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      ) : (
        <Card padding="none" className="p-3 mb-8">
          <Table columns={tableColumns} data={filtered} loading={loading} rowActions={tableRowActions} onRowClick={(r) => setInspecting(r)}
            emptyState={<EmptyState icon="alertCircle" title="No collisions found" description={searchQuery || typeFilter !== 'all' || matchFilter !== 'all' ? 'No records match your active search filters.' : 'No submission collisions recorded in this view.'} />} />
        </Card>
      )}

      {/* Inspect Drawer (Cluster Audit or Pair Audit) */}
      {inspecting && (() => {
        if (inspecting.isCluster) {
          const cluster = inspecting
          return (
            <EntityDrawer
              open={!!inspecting}
              onClose={() => setInspecting(null)}
              eyebrow="Multi-Submission Cluster Audit"
              title={`${cluster.candidateName} (${cluster.submissions.length} Requisitions)`}
              subtitle={`Client: ${cluster.client}`}
              status={<Badge tone={cluster.status === 'open' ? 'red' : cluster.status === 'confirmed' ? 'orange' : 'neutral'}>{cluster.status.toUpperCase()}</Badge>}
              size="2xl"
              actions={cluster.status === 'open' ? (
                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <Button variant="ghost" size="sm" loading={resolvingId === cluster.rows[0].id} onClick={() => resolveCluster(cluster.rows, 'dismissed')}>Mark All Valid</Button>
                  <Button variant="danger" size="sm" leftIcon="check" loading={resolvingId === cluster.rows[0].id} onClick={() => resolveCluster(cluster.rows, 'confirmed')}>Confirm All Duplicates</Button>
                </div>
              ) : (
                <span className="text-xs text-text3 font-medium">Resolved Cluster</span>
              )}
            >
              <div className="flex flex-col gap-4 pb-2">
                <div className="p-3.5 rounded-xl border bg-amber-500/10 border-amber-500/20 flex items-start gap-3">
                  <div className="p-1.5 rounded-lg shrink-0 mt-0.5 text-amber-500">
                    <Icon name="alertCircle" size={16} />
                  </div>
                  <div className="text-xs leading-relaxed flex-1 min-w-0">
                    <strong className="font-semibold text-xs block mb-0.5 text-amber-500">
                      Multi-Submission Candidate Cluster ({cluster.submissions.length} Requisitions)
                    </strong>
                    This candidate was submitted to <strong>{cluster.submissions.length} different requisitions</strong> at <strong>{cluster.client}</strong>. Review all submittals below and confirm or dismiss the cluster.
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-text uppercase tracking-wider">Candidate Profile</span>
                  <span className="font-mono text-xs text-accent">{cluster.candidateEmail}</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {cluster.submissions.map((sub, idx) => {
                    const hasEmail = sub.email && sub.email !== 'No email'
                    const emailMatched = hasEmail && cluster.submissions.some(other =>
                      other !== sub && other.email && other.email !== 'No email' && String(other.email).toLowerCase() === String(sub.email).toLowerCase()
                    )

                    const cleanPhone = sub.phone && sub.phone !== 'No phone' ? String(sub.phone).replace(/\D/g, '') : ''
                    const phoneMatched = cleanPhone.length >= 7 && cluster.submissions.some(other => {
                      if (other === sub || !other.phone || other.phone === 'No phone') return false
                      const otherClean = String(other.phone).replace(/\D/g, '')
                      return otherClean === cleanPhone
                    })

                    const emailCleared = !hasEmail
                    const phoneCleared = !sub.phone || sub.phone === 'No phone'

                    return (
                      <InspectCard
                        key={sub.id || idx}
                        label={`Submission #${idx + 1}`}
                        labelColor="text-accent"
                        borderColor="border-accent/25"
                        name={sub.name}
                        recruiter={sub.recruiter}
                        email={sub.email}
                        phone={sub.phone}
                        jobTitle={sub.jobTitle}
                        jobId={sub.jobId}
                        client={sub.client}
                        date={sub.date}
                        status={sub.status}
                        isDeleted={sub.isDeleted}
                        matchField="both"
                        emailMatched={emailMatched}
                        phoneMatched={phoneMatched}
                        emailCleared={emailCleared}
                        phoneCleared={phoneCleared}
                        onOpen={onNavigate && sub.id ? () => { setInspecting(null); onNavigate('candidate_detail', { candidateId: sub.id }) } : null}
                      />
                    )
                  })}
                </div>
              </div>
            </EntityDrawer>
          )
        }

        const sev = getSeverity(inspecting)
        return (
          <EntityDrawer
            open={!!inspecting}
            onClose={() => setInspecting(null)}
            eyebrow={inspecting.type === 'hard' ? 'Hard Collision Audit' : 'Soft Collision Audit'}
            title={`${inspecting.c1Name} vs ${inspecting.c2Name}`}
            subtitle={`Detected ${new Date(inspecting.created_at).toLocaleString()}`}
            status={<Badge tone={inspecting.status === 'open' ? 'red' : inspecting.status === 'confirmed' ? 'orange' : 'neutral'}>{inspecting.status.toUpperCase()}</Badge>}
            size="2xl"
            actions={inspecting.status === 'open' ? (
              <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                <Button variant="ghost" size="sm" loading={resolvingId === inspecting.id} onClick={() => resolve(inspecting.id, 'dismissed')}>Mark Not Duplicate</Button>
                <Button variant="danger" size="sm" leftIcon="check" loading={resolvingId === inspecting.id} onClick={() => resolve(inspecting.id, 'confirmed')}>Confirm Duplicate</Button>
              </div>
            ) : (
              <span className="text-xs text-text3 font-medium">Resolved {inspecting.resolved_at ? new Date(inspecting.resolved_at).toLocaleString() : '—'}</span>
            )}
          >
            <div className="flex flex-col gap-4 pb-2">
              <div className={cn('p-3.5 rounded-xl border flex items-start gap-3', inspecting.isStale ? 'bg-amber-500/10 border-amber-500/20' : sev.bg)}>
                <div className={cn('p-1.5 rounded-lg shrink-0 mt-0.5', inspecting.isStale ? 'text-amber-500' : sev.color)}>
                  <Icon name="alertCircle" size={16} />
                </div>
                <div className="text-xs leading-relaxed flex-1 min-w-0">
                  {inspecting.isStale ? (
                    <>
                      <strong className="font-semibold text-xs block mb-0.5 text-amber-500">Contact Data Has Changed</strong>
                      The email or phone number that originally triggered this collision was removed or changed. Review current details below and dismiss if resolved.
                    </>
                  ) : (
                    <>
                      <strong className={cn('font-semibold text-xs block mb-0.5', sev.color)}>
                        {sev.label} — {inspecting.type === 'hard' ? 'Hard Collision (Same Requisition)' : 'Soft Collision (Same Client)'}
                      </strong>
                      {inspecting.type === 'hard'
                        ? <>Two recruiters submitted to exact same job (<strong className="font-mono">{inspecting.c1JobTitle} · {inspecting.c1JobId}</strong>).</>
                        : inspecting.differentJobSameClient
                          ? <>Candidate submitted to <strong>{inspecting.c1Client}</strong> under different job IDs (<strong className="font-mono">{inspecting.c1JobId}</strong> vs <strong className="font-mono">{inspecting.c2JobId}</strong>).</>
                          : <>Candidate submitted to <strong>{inspecting.c1Client}</strong> by two different recruiters.</>}
                      {' '}Matched on <strong>{inspecting.match_field.toUpperCase()}</strong>.
                    </>
                  )}
                </div>
              </div>

              <Card className="bg-surface2/40 border-border/60 p-3 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-text uppercase tracking-wider">Match Evidence</span>
                  <span className="text-[10px] text-text3 font-mono">ID: {inspecting.id.slice(0, 8)}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                  <div className="p-2 rounded bg-surface border border-border/50 flex flex-col gap-0.5">
                    <span className="text-[9.5px] uppercase font-semibold text-text3 tracking-wider">Collision Type</span>
                    <Badge size="xs" tone={inspecting.isStale ? 'yellow' : sev.tone} className="self-start font-bold mt-0.5">{inspecting.isStale ? 'Stale' : sev.label}</Badge>
                    <span className="text-[10px] text-text2 mt-0.5">{inspecting.type === 'hard' ? 'Same job' : inspecting.differentJobSameClient ? 'Same client · diff job' : 'Same client'}</span>
                  </div>
                  <div className="p-2 rounded bg-surface border border-border/50 flex flex-col gap-0.5">
                    <span className="text-[9.5px] uppercase font-semibold text-text3 tracking-wider">Trigger</span>
                    <span className="text-text font-semibold text-xs mt-0.5">{inspecting.match_field === 'both' ? 'Email + Phone' : inspecting.match_field === 'email' ? 'Email Address' : 'Phone Number'}</span>
                  </div>
                  <div className="p-2 rounded bg-surface border border-border/50 flex flex-col gap-0.5">
                    <span className="text-[9.5px] uppercase font-semibold text-text3 tracking-wider">Matched Value</span>
                    {inspecting.isStale
                      ? <span className="font-mono text-text3 text-[11px] line-through mt-0.5">
                        {inspecting.match_field === 'email' || inspecting.match_field === 'both'
                          ? (inspecting.candidate_email || inspecting.c1Email)
                          : (inspecting.candidate_phone || inspecting.c1Phone)}
                        <span className="no-underline not-italic text-amber-500 text-[8.5px] font-bold ml-1">stale</span>
                      </span>
                      : <span className="font-mono font-medium text-rose-400 text-[11px] select-all truncate mt-0.5">
                        {inspecting.match_field === 'email' || inspecting.match_field === 'both' ? inspecting.c1Email : inspecting.c1Phone}
                      </span>}
                  </div>
                </div>
              </Card>

              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-text uppercase tracking-wider">Submission Comparison</span>
                <span className="text-[10px] text-text3">Live values shown</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <InspectCard
                  label="Submission A — Primary"
                  labelColor="text-accent"
                  borderColor="border-accent/30"
                  name={inspecting.c1Name}
                  recruiter={inspecting.c1Recruiter}
                  email={inspecting.c1Email}
                  phone={inspecting.c1Phone}
                  jobTitle={inspecting.c1JobTitle}
                  jobId={inspecting.c1JobId}
                  client={inspecting.c1Client}
                  date={inspecting.c1Date}
                  status={inspecting.c1Status}
                  matchField={inspecting.match_field}
                  emailMatched={inspecting.emailsMatch}
                  phoneMatched={inspecting.phonesMatch}
                  emailCleared={inspecting.c1EmailCleared}
                  phoneCleared={inspecting.c1PhoneCleared}
                  onOpen={onNavigate && inspecting.candidate_id ? () => { setInspecting(null); onNavigate('candidate_detail', { candidateId: inspecting.candidate_id }) } : null}
                />
                <InspectCard
                  label="Submission B — Conflicting"
                  labelColor="text-text2"
                  borderColor="border-border/60"
                  name={inspecting.c2Name}
                  recruiter={inspecting.c2Recruiter}
                  email={inspecting.c2Email}
                  phone={inspecting.c2Phone}
                  jobTitle={inspecting.c2JobTitle}
                  jobId={inspecting.c2JobId}
                  client={inspecting.c2Client}
                  date={inspecting.c2Date}
                  status={inspecting.c2Status}
                  matchField={inspecting.match_field}
                  emailMatched={inspecting.emailsMatch}
                  phoneMatched={inspecting.phonesMatch}
                  emailCleared={inspecting.c2EmailCleared}
                  phoneCleared={inspecting.c2PhoneCleared}
                  onOpen={onNavigate && inspecting.matched_candidate_id ? () => { setInspecting(null); onNavigate('candidate_detail', { candidateId: inspecting.matched_candidate_id }) } : null}
                />
              </div>
            </div>
          </EntityDrawer>
        )
      })()}
    </PageContainer>
  )
}

function SubmissionCard({
  label, name, recruiter, email, phone, jobTitle, jobId, client, status,
  matchField, emailMatched, phoneMatched, emailCleared, phoneCleared,
  isDeleted, isPrimary, onNavigate
}) {
  const hasEmail = email && email !== 'No email'
  const hasPhone = phone && phone !== 'No phone'

  const showEmailMatch = emailMatched && (matchField === 'email' || matchField === 'both')
  const showPhoneMatch = phoneMatched && (matchField === 'phone' || matchField === 'both')

  return (
    <div className={cn('bg-surface2/30 p-2.5 rounded-lg border flex flex-col gap-1.5 min-w-0',
      isPrimary ? 'border-accent/25' : 'border-border/40', isDeleted && 'opacity-60')}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Avatar name={name} size="xs" className="shrink-0" />
          <div className="min-w-0">
            <div className={cn('font-bold text-xs truncate', isDeleted ? 'text-text3 line-through' : 'text-text')}>{name}</div>
            <div className={cn('text-[9.5px] font-medium truncate', isPrimary ? 'text-accent' : 'text-text3')}>{label} · {recruiter}</div>
          </div>
        </div>
        {isDeleted
          ? <span className="text-[8.5px] font-bold text-text3 bg-surface2/60 border border-border/40 px-1.5 py-0.5 rounded shrink-0 tracking-wide">DELETED</span>
          : <span className="text-[9.5px] text-text3 bg-surface2/60 border border-border/40 px-1.5 py-0.5 rounded shrink-0">{status}</span>}
      </div>

      <div className="flex flex-col gap-0.5 text-[10px] border-t border-border/20 pt-1.5">
        {/* Email */}
        <span className={cn('font-mono truncate flex items-center gap-1', showEmailMatch ? 'text-rose-400 font-semibold' : emailCleared ? 'text-text3 line-through' : 'text-text2')}>
          <span className="truncate">{hasEmail ? email : <span className="opacity-40 italic">no email</span>}</span>
          {showEmailMatch && <span className="shrink-0 text-[8px] bg-rose-500/10 text-rose-400 border border-rose-500/20 px-1 py-0 rounded font-bold">MATCH</span>}
          {emailCleared && <span className="shrink-0 no-underline not-italic text-[8px] font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-1 py-0 rounded">CLEARED</span>}
        </span>

        {/* Phone */}
        <span className={cn('font-mono truncate flex items-center gap-1', showPhoneMatch ? 'text-rose-400 font-semibold' : phoneCleared ? 'text-text3 line-through' : 'text-text2')}>
          <span className="truncate">{hasPhone ? phone : <span className="opacity-40 italic">no phone</span>}</span>
          {showPhoneMatch && <span className="shrink-0 text-[8px] bg-rose-500/10 text-rose-400 border border-rose-500/20 px-1 py-0 rounded font-bold">MATCH</span>}
          {phoneCleared && <span className="shrink-0 no-underline not-italic text-[8px] font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-1 py-0 rounded">CLEARED</span>}
        </span>
      </div>

      <div className="text-[10px] border-t border-border/20 pt-1.5">
        <div
          className={cn('font-medium text-text truncate', onNavigate && jobId && 'hover:text-accent cursor-pointer')}
          title={jobId ? `Click to view Job ${jobId}` : jobTitle}
          onClick={() => onNavigate && jobId && onNavigate('job_detail', { jobId })}
        >
          {jobTitle}
        </div>
        <div className="text-text3 flex items-center justify-between mt-0.5">
          <span className="truncate">{client}</span>
          {jobId && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                if (onNavigate) onNavigate('job_detail', { jobId })
              }}
              className="font-mono text-accent font-bold shrink-0 ml-1 text-[9.5px] hover:underline hover:text-accent-light cursor-pointer flex items-center gap-0.5 bg-accent/10 px-1.5 py-0.5 rounded border border-accent/20"
              title={`Navigate to Job ${jobId}`}
            >
              {jobId}
              <Icon name="arrowUpRight" size={9} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function InspectCard({
  label, labelColor, borderColor, name, recruiter, email, phone, jobTitle, jobId, client, status, date,
  matchField, emailMatched, phoneMatched, emailCleared, phoneCleared, isDeleted, onOpen, onNavigate
}) {
  const hasEmail = email && email !== 'No email'
  const hasPhone = phone && phone !== 'No phone'

  const showEmailMatch = !isDeleted && emailMatched && (matchField === 'email' || matchField === 'both')
  const showPhoneMatch = !isDeleted && phoneMatched && (matchField === 'phone' || matchField === 'both')

  return (
    <Card className={cn('border flex flex-col gap-2.5 p-3 sm:p-3.5', borderColor, isDeleted && 'opacity-60 bg-surface2/30')}>
      <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
        <div className="flex items-center gap-2">
          <Avatar name={name} size="sm" />
          <div className="min-w-0">
            <div className={cn('font-bold text-xs sm:text-sm truncate', isDeleted ? 'text-text3 line-through' : 'text-text')}>{name}</div>
            <div className={cn('text-[10.5px] font-semibold truncate', labelColor)}>{label}</div>
          </div>
        </div>
        {isDeleted
          ? <span className="text-[8.5px] font-bold text-text3 bg-surface2/60 border border-border/40 px-1.5 py-0.5 rounded shrink-0 tracking-wide">DELETED</span>
          : <span className="text-[10px] font-medium text-text2 bg-surface2/60 border border-border/40 px-1.5 py-0.5 rounded shrink-0">{status}</span>}
      </div>
      <div className="flex flex-col gap-1.5 text-xs">
        <div className="flex items-center justify-between p-1.5 rounded bg-surface2/40 border border-border/30">
          <span className="text-[9.5px] uppercase text-text3 font-bold">Recruiter</span>
          <span className="font-medium text-text text-[11px]">{recruiter}</span>
        </div>
        <div className={cn('p-2 rounded-lg border flex flex-col gap-0.5', showEmailMatch ? 'bg-rose-500/8 border-rose-500/20' : emailCleared ? 'bg-amber-500/5 border-amber-500/20' : 'bg-surface2/40 border-border/30')}>
          <div className="flex items-center justify-between">
            <span className="text-[9.5px] uppercase font-bold text-text3">Email</span>
            {showEmailMatch && <span className="text-[8.5px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-1 py-0 rounded">MATCHED</span>}
            {emailCleared && <span className="text-[8.5px] font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-1 py-0 rounded">CLEARED</span>}
          </div>
          <span className={cn('font-mono text-[11px] select-all truncate', showEmailMatch ? 'text-rose-400 font-semibold' : emailCleared ? 'text-text3 line-through' : 'text-text2')}>
            {hasEmail ? email : <span className="italic opacity-50">no email on record</span>}
          </span>
        </div>
        <div className={cn('p-2 rounded-lg border flex flex-col gap-0.5', showPhoneMatch ? 'bg-rose-500/8 border-rose-500/20' : phoneCleared ? 'bg-amber-500/5 border-amber-500/20' : 'bg-surface2/40 border-border/30')}>
          <div className="flex items-center justify-between">
            <span className="text-[9.5px] uppercase font-bold text-text3">Phone</span>
            {showPhoneMatch && <span className="text-[8.5px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-1 py-0 rounded">MATCHED</span>}
            {phoneCleared && <span className="text-[8.5px] font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-1 py-0 rounded">CLEARED</span>}
          </div>
          <span className={cn('font-mono text-[11px] select-all truncate', showPhoneMatch ? 'text-rose-400 font-semibold' : phoneCleared ? 'text-text3 line-through' : 'text-text2')}>
            {hasPhone ? phone : <span className="italic opacity-50">no phone on record</span>}
          </span>
        </div>
        <div className="p-2 rounded-lg bg-surface2/40 border border-border/30 flex flex-col gap-0.5">
          <div className="flex items-center justify-between">
            <span className="text-[9.5px] uppercase text-text3 font-bold">Job Requisition</span>
            {jobId && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  if (onNavigate) onNavigate('job_detail', { jobId })
                }}
                className="font-mono text-accent text-[9.5px] font-bold hover:underline hover:text-accent-light cursor-pointer flex items-center gap-0.5 bg-accent/10 px-1.5 py-0.5 rounded border border-accent/20"
                title={`Navigate to Job ${jobId}`}
              >
                {jobId}
                <Icon name="arrowUpRight" size={9} />
              </button>
            )}
          </div>
          <span
            className={cn('font-medium text-text text-[11px] truncate', onNavigate && jobId && 'hover:text-accent cursor-pointer')}
            onClick={() => onNavigate && jobId && onNavigate('job_detail', { jobId })}
            title={jobId ? `Click to view Job ${jobId}` : jobTitle}
          >
            {jobTitle}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <div className="p-1.5 rounded bg-surface2/40 border border-border/30">
            <span className="text-[9px] uppercase text-text3 font-bold block">Client</span>
            <span className="font-medium text-text text-[10.5px] truncate block">{client}</span>
          </div>
          <div className="p-1.5 rounded bg-surface2/40 border border-border/30">
            <span className="text-[9px] uppercase text-text3 font-bold block">Submitted</span>
            <span className="text-text text-[10.5px] truncate block">{date}</span>
          </div>
        </div>
      </div>
      {onOpen && (
        <Button size="xs" variant="secondary" className="mt-0.5 w-full" leftIcon="arrowUpRight" onClick={onOpen}>
          Open Candidate Profile
        </Button>
      )}
    </Card>
  )
}
