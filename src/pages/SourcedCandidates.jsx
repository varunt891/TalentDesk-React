import { useState, useEffect, useMemo } from 'react'
import { useCandidates } from '../hooks/useCandidates'
import { useAuth } from '../context/AuthContext'
import { db } from '../lib/api'
import BulkResumeUploadModal from '../components/candidates/BulkResumeUploadModal'
import CandidateFormDrawer from '../components/candidates/CandidateFormDrawer'
import CandidateDetailDrawer from '../components/candidates/CandidateDetailDrawer'
import * as XLSX from 'xlsx'
import { PageContainer } from '../components/layout/PageContainer'
import {
  Button, Badge, StatusPill, Card,
  KPICard, Table, Modal, Icon, Avatar, EmptyState, useToast, cn,
} from '../components/ui'
import { WorkspaceSearch, FilterWorkspace } from '../components/workspace'
import { ensureArray } from '../lib/candidateHealth'

export default function SourcedCandidates({ onNavigate }) {
  const { organization } = useAuth()

  const { candidates, loading, error, addCandidates, updateCandidate, deleteCandidate, refetch } = useCandidates()

  // Sourced candidates filter (internal_status === 'Sourced' or no active pipeline status)
  const sourcedCandidates = useMemo(() => {
    return candidates.filter(c => !c.internal_status || c.internal_status === 'Sourced')
  }, [candidates])

  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ job: [], location: [], source: [], recruiter: [], priority: [] })
  const [quickFilter, setQuickFilter] = useState('all')
  const [selected, setSelected] = useState([])
  const [viewMode, setViewMode] = useState('table')
  const [showBulkUpload, setShowBulkUpload] = useState(false)
  const [showAddDrawer, setShowAddDrawer] = useState(false)
  const [editingCandidate, setEditingCandidate] = useState(null)
  const [showExtensionModal, setShowExtensionModal] = useState(false)
  const [showDetail, setShowDetail] = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Promotion modal state
  const [promoteModal, setPromoteModal] = useState({ isOpen: false, candidates: [] })
  const [targetJobId, setTargetJobId] = useState('')
  const [targetStatus, setTargetStatus] = useState('Pending')
  const [promoteNotes, setPromoteNotes] = useState('')
  const [isPromoting, setIsPromoting] = useState(false)

  // Jobs list for target job selection
  const [jobsList, setJobsList] = useState([])
  useEffect(() => {
    db.from('jobs').select('id, job_id, title, client, status').then(({ data }) => {
      setJobsList(data || [])
    }).catch(err => console.error('Error loading jobs:', err))
  }, [])

  const { toast: pushToast } = useToast()
  const showToast = (msg, type = 'success') => {
    pushToast({ tone: type === 'error' ? 'error' : 'success', title: msg })
  }

  // Filter options derived from live sourced candidates data
  const jobIdToTitle = useMemo(() => {
    const map = {}
    jobsList.forEach(j => {
      map[j.job_id || j.id] = j.title
    })
    sourcedCandidates.forEach(c => {
      if (c.job_id && c.job_title && !map[c.job_id]) map[c.job_id] = c.job_title
    })
    return map
  }, [jobsList, sourcedCandidates])

  const jobOptions = useMemo(() => {
    const uniqueIds = [...new Set(sourcedCandidates.map(c => c.job_id).filter(Boolean))].sort()
    return uniqueIds.map(id => ({ value: id, label: jobIdToTitle[id] ? `${id} · ${jobIdToTitle[id]}` : id }))
  }, [sourcedCandidates, jobIdToTitle])

  const locationOptions = useMemo(() => {
    return [...new Set(sourcedCandidates.map(c => c.location).filter(Boolean))].sort()
  }, [sourcedCandidates])

  const recruiterOptions = useMemo(() => {
    return [...new Set(sourcedCandidates.map(c => c.recruiter_name).filter(Boolean))].sort()
  }, [sourcedCandidates])

  // Filter logic
  const filteredCandidates = useMemo(() => {
    return sourcedCandidates.filter(c => {
      const q = search.toLowerCase().trim()
      const cOrg = c.org_name || organization?.name || 'TalentDesk'
      const skillsStr = ensureArray(c.skills).join(' ')
      const sourceStr = c.source_url || c.linkedin || ''

      if (q && !`${c.first_name || ''} ${c.last_name || ''} ${c.name || ''} ${c.email || ''} ${c.phone || ''} ${c.job_title || ''} ${c.job_id || ''} ${c.client || ''} ${c.location || ''} ${cOrg} ${skillsStr} ${c.notes || ''} ${sourceStr}`.toLowerCase().includes(q)) {
        return false
      }

      if (filters.job.length && !filters.job.includes(c.job_id)) return false
      if (filters.location.length && !filters.location.includes(c.location)) return false
      if (filters.recruiter?.length && !filters.recruiter.includes(c.recruiter_name)) return false
      if (filters.priority?.length && !filters.priority.includes(c.priority)) return false

      // Quick filter presets
      if (quickFilter === 'unassigned' && c.job_id) return false
      if (quickFilter === 'has_email' && (!c.email || c.email.includes('example@email.com'))) return false
      if (quickFilter === 'high_priority' && c.priority !== 'High') return false
      if (quickFilter === 'today') {
        const createdDate = new Date(c.created_at).toDateString()
        const todayDate = new Date().toDateString()
        if (createdDate !== todayDate) return false
      }

      return true
    })
  }, [sourcedCandidates, search, filters, quickFilter, organization?.name])

  // KPI calculations
  const totalSourcedCount = sourcedCandidates.length
  const unassignedCount = useMemo(() => sourcedCandidates.filter(c => !c.job_id).length, [sourcedCandidates])
  const sourcedThisWeekCount = useMemo(() => {
    const now = new Date().getTime()
    const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000)
    return sourcedCandidates.filter(c => c.created_at && new Date(c.created_at) >= oneWeekAgo && new Date(c.created_at).getTime() <= now).length
  }, [sourcedCandidates])
  const readyForSubmissionCount = useMemo(() => {
    return sourcedCandidates.filter(c => Boolean((c.first_name || c.name) && (c.email || c.phone) && (c.resume_text || ensureArray(c.skills).length))).length
  }, [sourcedCandidates])

  // Selection
  const clearSelection = () => setSelected([])

  const openAddSourcedCandidate = () => {
    setShowDetail(null)
    setEditingCandidate(null)
    setShowAddDrawer(true)
  }

  // Single promotion trigger
  const openPromoteSingle = (cand) => {
    setPromoteModal({ isOpen: true, candidates: [cand] })
    setTargetJobId(cand.job_id || '')
    setTargetStatus('Pending')
    setPromoteNotes('')
  }

  // Bulk promotion trigger
  const openPromoteBulk = () => {
    const selectedCands = sourcedCandidates.filter(c => selected.includes(c.id))
    if (selectedCands.length === 0) return
    setPromoteModal({ isOpen: true, candidates: selectedCands })
    setTargetJobId('')
    setTargetStatus('Pending')
    setPromoteNotes('')
  }

  // Execute promotion
  const handleExecutePromote = async () => {
    if (isPromoting) return
    if (!promoteModal.candidates || promoteModal.candidates.length === 0) return
    setIsPromoting(true)

    try {
      const selectedJob = jobsList.find(j => (j.job_id || j.id) === targetJobId)
      const jobTitleToSet = selectedJob ? selectedJob.title : undefined
      const clientToSet = selectedJob ? selectedJob.client : undefined

      let count = 0
      const failed = []
      for (const cand of promoteModal.candidates) {
        const updates = {
          internal_status: targetStatus,
          submission_date: targetStatus === 'Submitted' ? new Date().toISOString().slice(0, 10) : cand.submission_date || null
        }
        if (targetJobId) {
          updates.job_id = targetJobId
          if (jobTitleToSet) updates.job_title = jobTitleToSet
          if (clientToSet) updates.client = clientToSet
        }
        if (promoteNotes) {
          updates.notes = cand.notes ? `${cand.notes}\n\n[Promotion Note (${new Date().toLocaleDateString()})]: ${promoteNotes}` : `[Promotion Note (${new Date().toLocaleDateString()})]: ${promoteNotes}`
        }

        try {
          const { error } = await updateCandidate(cand.id, updates)
          if (error) failed.push(cand)
          else count++
        } catch {
          failed.push(cand)
        }
      }

      if (count) showToast(`${count} candidate(s) promoted to Active Candidates!`)
      if (failed.length) showToast(`${failed.length} promotion(s) failed. Review and retry.`, 'error')
      setPromoteModal({ isOpen: failed.length > 0, candidates: failed })
      setSelected(failed.map(c => c.id))
      await refetch()
    } catch (err) {
      showToast('Error promoting candidates: ' + err.message, 'error')
    } finally {
      setIsPromoting(false)
    }
  }

  // Export functions
  const handleExportSelected = () => {
    const sel = sourcedCandidates.filter(c => selected.includes(c.id))
    exportCandidatesXlsx(sel, `sourced_candidates_selected_${new Date().toISOString().slice(0, 10)}.xlsx`)
    showToast(`Exported ${sel.length} sourced candidates!`)
  }

  const handleExportAll = () => {
    exportCandidatesXlsx(filteredCandidates, `sourced_candidates_${new Date().toISOString().slice(0, 10)}.xlsx`)
    showToast(`Exported ${filteredCandidates.length} sourced candidates!`)
  }

  const exportCandidatesXlsx = (list, filename) => {
    const headers = ['First Name', 'Last Name', 'Email', 'Phone', 'Location', 'Job ID', 'Job Title', 'Client', 'Status', 'Source', 'Skills', 'Notes']
    const rows = list.map(c => [
      c.first_name || '', c.last_name || '', c.email || '', c.phone || '', c.location || '',
      c.job_id || '', c.job_title || '', c.client || '', c.internal_status || 'Sourced',
      c.linkedin || c.source_url || 'Web Sourced', ensureArray(c.skills).join('; '), c.notes || ''
    ])
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sourced Candidates')
    XLSX.writeFile(wb, filename)
  }

  // Bulk Delete
  const handleBulkDelete = async () => {
    if (isDeleting) return
    if (!window.confirm(`Are you sure you want to delete ${selected.length} selected sourced candidates?`)) return
    setIsDeleting(true)
    const failed = []
    try {
      for (const id of selected) {
        try {
          const { error } = await deleteCandidate(id)
          if (error) failed.push(id)
        } catch { failed.push(id) }
      }
      const count = selected.length - failed.length
      if (count) showToast(`Deleted ${count} candidate(s)`)
      if (failed.length) showToast(`${failed.length} deletion(s) failed. Please retry.`, 'error')
      setSelected(failed)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <PageContainer>
      {/* Top Header & Page Switcher */}
      <div className="flex flex-col gap-4 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center font-bold">
                <Icon name="download" size={18} />
              </div>
              <h1 className="text-xl font-bold text-text">Sourced Candidates</h1>
              <Badge tone="teal" size="sm">{totalSourcedCount} Sourced</Badge>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <Button
              variant="secondary"
              size="sm"
              icon="sparkles"
              onClick={() => setShowExtensionModal(true)}
            >
              Get Extension
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon="upload"
              onClick={() => setShowBulkUpload(true)}
            >
              Bulk Upload
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon="download"
              onClick={handleExportAll}
            >
              Export XLSX
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon="plus"
              onClick={openAddSourcedCandidate}
            >
              Add Sourced Candidate
            </Button>
          </div>
        </div>

        {/* Navigation Tab Switcher */}
        <div className="flex items-center gap-2 border-b border-border pb-2 overflow-x-auto scrollbar-none">
          <button
            type="button"
            className="px-3 py-1.5 rounded-md text-xs font-semibold bg-accent text-white flex items-center gap-2 shadow-xs shrink-0"
          >
            <Icon name="download" size={13} />
            Sourced Pool ({totalSourcedCount})
          </button>

          <button
            type="button"
            onClick={() => onNavigate('candidates')}
            className="px-3 py-1.5 rounded-md text-xs font-semibold text-text2 hover:text-text hover:bg-surface2 flex items-center gap-2 transition-colors shrink-0"
          >
            <Icon name="users" size={13} />
            Active Candidates ({candidates.length - totalSourcedCount})
          </button>

          <button
            type="button"
            onClick={() => onNavigate('candidates', { showAll: true })}
            className="px-3 py-1.5 rounded-md text-xs font-semibold text-text3 hover:text-text hover:bg-surface2 transition-colors shrink-0"
          >
            All Database Records ({candidates.length})
          </button>
        </div>
      </div>

      {/* KPI Metrics Header (Compact & High-Density) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4 [&_.truncate]:whitespace-normal [&_.truncate]:overflow-visible [&_.truncate]:text-clip">
        <KPICard
          compact
          label="TOTAL SOURCED"
          value={totalSourcedCount}
          helper="Profiles in Sourced Pool"
          icon="download"
          tone="teal"
        />
        <KPICard
          compact
          label="UNASSIGNED"
          value={unassignedCount}
          helper="No target job requisition"
          icon="alertCircle"
          tone="amber"
        />
        <KPICard
          compact
          label="SOURCED THIS WEEK"
          value={sourcedThisWeekCount}
          helper="Extracted in last 7 days"
          icon="sparkles"
          tone="blue"
        />
        <KPICard
          compact
          label="READY TO PROMOTE"
          value={readyForSubmissionCount}
          helper="Name, contact and resume or skills"
          icon="checkCircle"
          tone="green"
        />
      </div>

      {/* Filter Workspace (Sleek Compact Layout) */}
      <div className="py-3 border-y border-border mb-4 flex flex-col gap-2">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
          <div className="flex-1 min-w-0">
            <WorkspaceSearch
              value={search}
              onChange={setSearch}
              placeholder="Search sourced candidates by name, email, job, skills, location..."
            />
          </div>

          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none">
            <FilterWorkspace
              filters={[
                { key: 'job', label: 'Job Requisition', type: 'multiselect', options: jobOptions },
                { key: 'location', label: 'Location', type: 'multiselect', options: locationOptions.map(l => ({ value: l, label: l })) },
                { key: 'recruiter', label: 'Recruiter', type: 'multiselect', options: recruiterOptions.map(r => ({ value: r, label: r })) },
              ]}
              values={filters}
              onChange={(key, value) => setFilters(f => ({ ...f, [key]: value }))}
              onReset={() => {
                setSearch('')
                setFilters({ job: [], location: [], source: [], recruiter: [], priority: [] })
                setQuickFilter('all')
              }}
              storageKey="sourced_candidates"
            />

            <div className="h-4 w-px bg-border hidden md:block" />

            <div className="flex items-center gap-0.5 border border-border rounded-lg p-0.5 bg-surface2 shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={cn('w-8 h-8 flex items-center justify-center rounded transition-colors', viewMode === 'table' ? 'bg-surface text-text shadow-xs font-semibold' : 'text-text3 hover:text-text')}
                title="Table View"
                aria-label="Table view"
                aria-pressed={viewMode === 'table'}
              >
                <Icon name="listBullets" size={16} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={cn('w-8 h-8 flex items-center justify-center rounded transition-colors', viewMode === 'grid' ? 'bg-surface text-text shadow-xs font-semibold' : 'text-text3 hover:text-text')}
                title="Grid / Board View"
                aria-label="Grid view"
                aria-pressed={viewMode === 'grid'}
              >
                <Icon name="dashboard" size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Quick Filter Tag Pills */}
        <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-border/60">
          <span className="text-[10px] font-bold text-text3 uppercase tracking-wider mr-1">Quick Filters:</span>
          {[
            { id: 'all', label: `All Sourced (${sourcedCandidates.length})` },
            { id: 'unassigned', label: `Unassigned (${unassignedCount})` },
            { id: 'today', label: 'Sourced Today' },
            { id: 'has_email', label: 'Has Email' },
            { id: 'high_priority', label: 'High Priority' },
          ].map(q => (
            <button
              key={q.id}
              type="button"
              onClick={() => setQuickFilter(q.id)}
              className={cn(
                'px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-all',
                quickFilter === q.id
                  ? 'bg-accent/15 text-accent border border-accent/30 font-semibold'
                  : 'bg-surface2/80 text-text2 hover:bg-surface3 border border-transparent'
              )}
            >
              {q.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk Action Floating Bar */}
      {selected.length > 0 && (
        <div className="sticky top-4 z-20 mb-4 p-3 rounded-lg bg-surface border border-accent/30 shadow-xl flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Badge tone="accent" size="md">{selected.length} Selected</Badge>
            <span className="text-xs text-text2 hidden sm:inline">Choose an action for selected sourced candidates:</span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="primary"
              size="sm"
              icon="arrowRight"
              onClick={openPromoteBulk}
            >
              Promote to Candidates ({selected.length})
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon="download"
              onClick={handleExportSelected}
            >
              Export Selected
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon="trash"
              onClick={handleBulkDelete}
            >
              Delete
            </Button>
            <button
              type="button"
              onClick={clearSelection}
              className="text-xs text-text3 hover:text-text underline px-2"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area: Table vs Grid View */}
      {error ? (
        <EmptyState icon="alertCircle" title="Could not load sourced candidates" description={error.message || 'Connection failed.'} action={<Button onClick={refetch} icon="refresh">Retry</Button>} />
      ) : loading ? (
        <Card className="p-12 text-center">
          <div className="inline-block w-8 h-8 border-3 border-border border-t-accent rounded-full animate-spin mb-3" />
          <p className="text-xs font-semibold text-text2">Loading Sourced Candidates...</p>
        </Card>
      ) : filteredCandidates.length === 0 ? (
        <Card className="p-12">
          <EmptyState
            icon="download"
            title="No Sourced Candidates Found"
            description={search || Object.values(filters).some(f => f.length > 0) ? 'No candidates match your current search and filter criteria.' : 'Import candidate profiles using the TalentDesk Chrome Extension or Bulk Resume Upload.'}
            action={
              <div className="flex items-center gap-2 mt-4">
                <Button variant="primary" size="sm" icon="upload" onClick={() => setShowBulkUpload(true)}>
                  Upload Resumes
                </Button>
                <Button variant="secondary" size="sm" icon="plus" onClick={openAddSourcedCandidate}>
                  Add Manually
                </Button>
              </div>
            }
          />
        </Card>
      ) : viewMode === 'table' ? (
        /* TABLE VIEW */
        <div className="min-w-0 overflow-hidden">
          <Table
            compact={false}
            selectable={true}
            selectedIds={selected}
            onSelectionChange={setSelected}
            data={filteredCandidates}
            columns={[
              {
                key: 'name',
                id: 'name',
                header: 'CANDIDATE',
                render: (c) => {
                  const fullName = `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.name || 'Sourced Candidate'
                  return (
                    <div className="flex items-center gap-2.5 min-w-0 max-w-[200px] py-1">
                      <Avatar name={fullName} size="sm" />
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => setShowDetail(c)}
                          className="font-bold text-text hover:text-accent text-xs truncate text-left block w-full"
                        >
                          {fullName}
                        </button>
                        <div className="text-[11px] text-text3 truncate flex items-center gap-1 mt-0.5">
                          {c.email ? (
                            <span className="truncate max-w-[130px]">{c.email}</span>
                          ) : (
                            <span className="italic text-text3/70">No email</span>
                          )}
                          {c.linkedin || c.source_url ? (
                            <a
                              href={c.linkedin || c.source_url}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-accent hover:underline flex items-center gap-0.5 shrink-0"
                              title="Open Source Profile"
                            >
                              <Icon name="externalLink" size={10} />
                            </a>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  )
                }
              },
              {
                key: 'current_role',
                id: 'current_role',
                header: 'CURRENT ROLE & COMPANY',
                render: (c) => (
                  <div className="min-w-0 max-w-[200px] py-1">
                    <div className="font-semibold text-text text-xs truncate flex items-center gap-1">
                      <Icon name="briefcase" size={12} className="text-accent shrink-0" />
                      <span className="truncate">{c.job_title || c.role || c.current_role || 'Role N/A'}</span>
                    </div>
                    <div className="text-[11px] text-text3 truncate flex items-center gap-1 mt-0.5">
                      <Icon name="building" size={10} className="text-text3 shrink-0" />
                      <span className="truncate">{c.client || c.company ? `at ${c.client || c.company}` : 'Company N/A'}</span>
                    </div>
                  </div>
                )
              },
              {
                key: 'target_req',
                id: 'target_req',
                header: 'TARGET REQUISITION',
                render: (c) => (
                  <div className="py-1">
                    {c.job_id ? (
                      <div>
                        <div className="font-mono text-accent text-xs font-semibold">{c.job_id}</div>
                        {jobIdToTitle[c.job_id] && (
                          <div className="text-[10.5px] text-text3 truncate max-w-[120px]">{jobIdToTitle[c.job_id]}</div>
                        )}
                      </div>
                    ) : (
                      <span className="text-amber-400 font-medium text-[10.5px] bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 inline-block">
                        Unassigned
                      </span>
                    )}
                  </div>
                )
              },
              {
                key: 'location',
                id: 'location',
                header: 'LOCATION',
                render: (c) => (
                  <div className="text-xs text-text2 truncate max-w-[130px] py-1">
                    {c.location || '—'}
                  </div>
                )
              },
              {
                key: 'status',
                id: 'status',
                header: 'STATUS',
                render: (c) => (
                  <div className="py-1">
                    <StatusPill status={c.internal_status || 'Sourced'} />
                  </div>
                )
              },
              {
                key: 'skills',
                id: 'skills',
                header: 'SKILLS',
                render: (c) => {
                  const skillsList = ensureArray(c.skills)
                  if (skillsList.length === 0) return <span className="text-xs text-text3 italic">No skills</span>
                  return (
                    <div className="flex items-center gap-1 max-w-[150px] overflow-hidden whitespace-nowrap py-1">
                      {skillsList.slice(0, 1).map((sk, idx) => (
                        <span key={idx} className="px-1.5 py-0.5 rounded bg-surface2 text-[10.5px] font-medium text-text2 truncate max-w-[85px]" title={sk}>
                          {sk}
                        </span>
                      ))}
                      {skillsList.length > 1 && (
                        <span className="text-[10px] font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded shrink-0">
                          +{skillsList.length - 1}
                        </span>
                      )}
                    </div>
                  )
                }
              },
              {
                key: 'actions',
                id: 'actions',
                header: '',
                render: (c) => (
                  <div className="flex items-center justify-end gap-1 py-1" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="primary"
                      size="xs"
                      leftIcon="arrowRight"
                      onClick={(e) => {
                        e.stopPropagation()
                        openPromoteSingle(c)
                      }}
                      title="Promote to Active Candidate"
                    >
                      Promote
                    </Button>

                    <Button
                      variant="ghost"
                      size="xs"
                      leftIcon="eye"
                      onClick={(e) => {
                        e.stopPropagation()
                        setShowDetail(c)
                      }}
                      title="View Details"
                    />

                    <Button
                      variant="ghost"
                      size="xs"
                      leftIcon="trash"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDeleteId(c.id)
                      }}
                      title="Delete Candidate"
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10 shrink-0"
                    />
                  </div>
                )
              }
            ]}
          />
        </div>
      ) : (
        /* GRID / CARD VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCandidates.map(c => {
            const fullName = `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.name || 'Sourced Candidate'
            const skillsList = ensureArray(c.skills)
            const isSelected = selected.includes(c.id)

            return (
              <Card
                key={c.id}
                className={cn('p-4 transition-all duration-150 flex flex-col justify-between border', isSelected ? 'border-accent bg-accent/5' : 'border-border hover:border-border-strong')}
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          if (e.target.checked) setSelected(prev => [...prev, c.id])
                          else setSelected(prev => prev.filter(id => id !== c.id))
                        }}
                        className="rounded border-border text-accent focus:ring-accent"
                      />
                      <Avatar name={fullName} size="md" />
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => setShowDetail(c)}
                          className="font-semibold text-text hover:text-accent text-sm truncate text-left block"
                        >
                          {fullName}
                        </button>
                        <div className="text-xs text-text3 truncate">
                          {c.job_title || 'Sourced Professional'} {c.client || c.company ? `at ${c.client || c.company}` : ''}
                        </div>
                      </div>
                    </div>

                    <StatusPill status={c.internal_status || 'Sourced'} />
                  </div>

                  {/* Details block */}
                  <div className="space-y-1.5 text-xs text-text2 mb-4 bg-surface2/50 p-2.5 rounded-lg border border-border/50">
                    <div className="flex items-center justify-between">
                      <span className="text-text3">Current Role:</span>
                      <span className="font-semibold text-text truncate max-w-[170px]">{c.job_title || c.role || 'N/A'}</span>
                    </div>
                    {(c.client || c.company) && (
                      <div className="flex items-center justify-between">
                        <span className="text-text3">Current Company:</span>
                        <span className="truncate max-w-[170px]">{c.client || c.company}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-text3">Target Requisition:</span>
                      <span className="font-mono text-accent font-medium">{c.job_id || 'Unassigned'}</span>
                    </div>
                    {c.location && (
                      <div className="flex items-center justify-between">
                        <span className="text-text3">Location:</span>
                        <span className="truncate max-w-[170px]">{c.location}</span>
                      </div>
                    )}
                    {c.email && (
                      <div className="flex items-center justify-between">
                        <span className="text-text3">Email:</span>
                        <span className="truncate max-w-[170px]">{c.email}</span>
                      </div>
                    )}
                  </div>

                  {/* Skills Pills */}
                  {skillsList.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap mb-4">
                      {skillsList.slice(0, 4).map((sk, idx) => (
                        <span key={idx} className="px-1.5 py-0.5 rounded bg-surface3 text-[10.5px] font-medium text-text2">
                          {sk}
                        </span>
                      ))}
                      {skillsList.length > 4 && (
                        <span className="text-[10px] font-bold text-text3">+{skillsList.length - 4}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Card Actions Footer */}
                <div className="flex items-center justify-between gap-2 pt-3 border-t border-border">
                  <Button
                    variant="ghost"
                    size="xs"
                    icon="eye"
                    onClick={() => setShowDetail(c)}
                  >
                    Details
                  </Button>

                  <Button
                    variant="primary"
                    size="xs"
                    icon="arrowRight"
                    onClick={() => openPromoteSingle(c)}
                  >
                    Promote to Candidate
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      )}

      {/* PROMOTION MODAL */}
      {promoteModal.isOpen && (
        <Modal
          open={promoteModal.isOpen}
          isOpen={promoteModal.isOpen}
          onClose={() => setPromoteModal({ isOpen: false, candidates: [] })}
          title={`Promote ${promoteModal.candidates.length} Sourced Candidate(s)`}
          size="md"
        >
          <div className="space-y-4">
            <p className="text-xs text-text2">
              Promoting moves candidate(s) from the Sourced Pool into active Pipeline & Requisition tracking.
            </p>

            {/* Candidate Summary */}
            <div className="p-3 rounded-lg bg-surface2 border border-border space-y-1 max-h-36 overflow-y-auto">
              <span className="text-[11px] font-bold text-text3 uppercase tracking-wider block mb-1">Target Candidates:</span>
              {promoteModal.candidates.map(c => (
                <div key={c.id} className="text-xs text-text font-medium flex items-center justify-between">
                  <span>{c.first_name} {c.last_name} ({c.job_title || 'General Pool'})</span>
                  <span className="text-text3 text-[11px]">{c.email || 'No email'}</span>
                </div>
              ))}
            </div>

            {/* Requisition Dropdown */}
            <div>
              <label className="block text-xs font-semibold text-text mb-1">Select Target Job Requisition:</label>
              <select
                value={targetJobId}
                onChange={(e) => setTargetJobId(e.target.value)}
                className="w-full h-9 rounded-lg border border-border bg-surface text-text text-xs px-3 focus:outline-none focus:border-accent"
              >
                <option value="">-- Keep Current Job Assignment --</option>
                {jobsList.map(j => (
                  <option key={j.id} value={j.job_id || j.id}>
                    {j.job_id || j.id} · {j.title} ({j.client || 'Client'})
                  </option>
                ))}
              </select>
            </div>

            {/* Target Status */}
            <div>
              <label className="block text-xs font-semibold text-text mb-1">Initial Active Pipeline Status:</label>
              <select
                value={targetStatus}
                onChange={(e) => setTargetStatus(e.target.value)}
                className="w-full h-9 rounded-lg border border-border bg-surface text-text text-xs px-3 focus:outline-none focus:border-accent"
              >
                <option value="Pending">Pending (Review Needed)</option>
                <option value="Submitted">Submitted (Submitted to Client)</option>
                <option value="Shortlisted">Shortlisted</option>
              </select>
            </div>

            {/* Optional Promotion Note */}
            <div>
              <label className="block text-xs font-semibold text-text mb-1">Promotion / Recruiter Note (Optional):</label>
              <textarea
                value={promoteNotes}
                onChange={(e) => setPromoteNotes(e.target.value)}
                placeholder="Add notes about why this candidate is being submitted or promoted..."
                rows={3}
                className="w-full rounded-lg border border-border bg-surface text-text text-xs p-2.5 focus:outline-none focus:border-accent"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setPromoteModal({ isOpen: false, candidates: [] })}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon="arrowRight"
                loading={isPromoting}
                onClick={handleExecutePromote}
              >
                Confirm & Promote Candidate(s)
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* CANDIDATE DETAIL DRAWER */}
      {showDetail && (
        <CandidateDetailDrawer
          candidate={showDetail}
          isOpen={Boolean(showDetail)}
          onClose={() => setShowDetail(null)}
          onEdit={cand => { setShowDetail(null); setEditingCandidate(cand); setShowAddDrawer(true) }}
          onPromote={(cand) => {
            setShowDetail(null)
            openPromoteSingle(cand)
          }}
          onDelete={(cand) => {
            setShowDetail(null)
            setDeleteId(cand.id)
          }}
        />
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deleteId && (
        <Modal
          open={Boolean(deleteId)}
          isOpen={Boolean(deleteId)}
          onClose={() => setDeleteId(null)}
          title="Delete Candidate"
          size="sm"
        >
          <div className="space-y-4">
            <p className="text-xs text-text2">
              Are you sure you want to delete this sourced candidate record? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
              <Button variant="secondary" size="sm" onClick={() => setDeleteId(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={async () => {
                  if (isDeleting) return
                  setIsDeleting(true)
                  try {
                    const { error } = await deleteCandidate(deleteId)
                    if (error) throw error
                    showToast('Candidate deleted')
                    setSelected(ids => ids.filter(id => id !== deleteId))
                    setDeleteId(null)
                  } catch (err) {
                    showToast(err.message || 'Deletion failed. Please retry.', 'error')
                  } finally { setIsDeleting(false) }
                }}
                loading={isDeleting}
              >
                Delete
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* BULK UPLOAD MODAL */}
      <BulkResumeUploadModal
        isOpen={showBulkUpload}
        preserveResumeTitle
        onClose={() => setShowBulkUpload(false)}
        addCandidates={rows => addCandidates(rows.map(row => ({ ...row, internal_status: 'Sourced', submission_date: null })))}
        showToast={showToast}
      />

      {/* GET CHROME EXTENSION MODAL */}
      <Modal
        open={showExtensionModal}
        isOpen={showExtensionModal}
        onClose={() => setShowExtensionModal(false)}
        title="TalentDesk Sourcing Extension"
        subtitle="Source candidates seamlessly from LinkedIn, Indeed, and web sites directly into your TalentDesk pool."
        size="md"
      >
        <div className="flex flex-col gap-4 text-xs pt-1">
          {/* Download Banner */}
          <div className="p-4 rounded-xl border border-teal-500/30 bg-teal-500/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="font-bold text-text text-sm flex items-center gap-2">
                <Icon name="sparkles" size={16} className="text-teal-400" />
                Chrome Extension Package
              </div>
              <div className="text-text3 text-[11px] mt-0.5">
                Install on any machine or browser to capture candidate profiles into your workspace.
              </div>
            </div>
            <Button
              size="sm"
              icon="download"
              onClick={() => {
                const link = document.createElement('a')
                link.href = '/downloads/talentdesk-extension.zip'
                link.download = 'talentdesk-extension.zip'
                link.click()
              }}
            >
              Download ZIP
            </Button>
          </div>

          {/* Installation Steps */}
          <div className="p-4 rounded-xl border border-border bg-surface2 flex flex-col gap-2.5">
            <div className="font-bold text-text text-xs uppercase tracking-wider text-text2">
              Installation Instructions for Other Systems
            </div>
            <ol className="list-decimal pl-4 space-y-2 text-text2 text-xs leading-relaxed">
              <li>
                Click <strong>Download ZIP</strong> above and extract the downloaded file on the target computer.
              </li>
              <li>
                Open Google Chrome (or Edge / Brave) and navigate to <code className="bg-surface px-1.5 py-0.5 rounded text-teal-400 font-mono text-[11px]">chrome://extensions</code>.
              </li>
              <li>
                Turn ON <strong>Developer mode</strong> using the toggle switch in the top-right corner.
              </li>
              <li>
                Click <strong>Load unpacked</strong> in the top-left and select the unzipped extension folder.
              </li>
              <li>
                Open the extension popup and log in with your TalentDesk credentials to sync candidates automatically.
              </li>
            </ol>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border">
            <span className="text-[11px] text-text3 font-mono">Version 1.1.0 · Chrome, Edge, Brave</span>
            <Button variant="secondary" size="sm" onClick={() => setShowExtensionModal(false)}>
              Done
            </Button>
          </div>
        </div>
      </Modal>

      {/* ADD CANDIDATE FORM DRAWER */}
      <CandidateFormDrawer
        key={editingCandidate?.id || 'new-sourced-candidate'}
        open={showAddDrawer}
        onClose={() => { setShowAddDrawer(false); setEditingCandidate(null) }}
        candidateData={editingCandidate}
        onSaved={() => refetch()}
        candidates={candidates}
        defaultStatus="Sourced"
      />
    </PageContainer>
  )
}
