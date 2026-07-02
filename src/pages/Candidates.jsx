import { useState, useRef, useEffect } from 'react'
import { useCandidates } from '../hooks/useCandidates'
import * as XLSX from 'xlsx'

const STATUSES = ['Pending', 'Submitted', 'Shortlisted', 'Interview Scheduled', 'Interview Done', 'Offer Extended', 'Hired', 'Rejected', 'On Hold', 'Withdrew']
const FEEDBACK = ['Awaiting', 'Positive', 'Negative', 'No Response']
const WORK_AUTHS = ['US Citizen', 'Green Card', 'H1B', 'OPT/CPT', 'TN Visa', 'Other']

const STATUS_COLORS = {
  'Hired': { bg: 'rgba(46,204,143,0.15)', color: '#1af0a0', border: 'rgba(46,204,143,0.3)' },
  'Interview Scheduled': { bg: 'rgba(79,124,255,0.15)', color: '#6b9fff', border: 'rgba(79,124,255,0.3)' },
  'Interview Done': { bg: 'rgba(124,92,255,0.15)', color: '#a47fff', border: 'rgba(124,92,255,0.3)' },
  'Offer Extended': { bg: 'rgba(46,204,143,0.15)', color: 'var(--green)', border: 'rgba(46,204,143,0.3)' },
  'Submitted': { bg: 'rgba(79,124,255,0.1)', color: '#6b9fff', border: 'rgba(79,124,255,0.2)' },
  'Shortlisted': { bg: 'rgba(255,140,66,0.15)', color: 'var(--orange)', border: 'rgba(255,140,66,0.3)' },
  'Rejected': { bg: 'rgba(255,77,106,0.15)', color: 'var(--red)', border: 'rgba(255,77,106,0.3)' },
  'On Hold': { bg: 'rgba(255,140,66,0.1)', color: 'var(--orange)', border: 'rgba(255,140,66,0.2)' },
  'Withdrew': { bg: 'rgba(139,145,168,0.12)', color: 'var(--text3)', border: 'rgba(139,145,168,0.2)' },
  'Pending': { bg: 'rgba(139,145,168,0.12)', color: 'var(--text2)', border: 'rgba(139,145,168,0.2)' },
}

const emptyForm = {
  first_name: '', last_name: '', email: '', phone: '', location: '',
  work_auth: 'US Citizen', experience: '', linkedin: '',
  submission_date: new Date().toISOString().slice(0, 10),
  job_id: '', job_title: '', client: '', rate: '', relocation: 'No',
  internal_status: 'Pending', external_status: 'Pending',
  feedback_status: 'Awaiting', priority: 'Medium',
  interview_date: '', interview_type: '',
  fe_name: '', fe_extension: '', account_manager: '', recruiter_name: '',
  skills: [], notes: '', followup_date: ''
}

// Multi-select dropdown component
function MultiSelect({ label, options, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()))
  const toggle = (val) => onChange(selected.includes(val) ? selected.filter(x => x !== val) : [...selected, val])

  return (
    <div ref={ref} className="candidate-filter">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={selected.length > 0 ? 'candidate-filter-button active' : 'candidate-filter-button'}
      >
        <span className="candidate-filter-label">
          {selected.length === 0 ? label : selected.length === 1 ? selected[0].slice(0, 16) : label}
        </span>
        {selected.length > 0 && (
          <span className="candidate-filter-count">
            {selected.length}
          </span>
        )}
        <span className="candidate-filter-chevron" aria-hidden="true" />
      </button>

      {open && (
        <div className="candidate-filter-menu">
          <div className="candidate-filter-search">
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
            />
          </div>
          <div className="candidate-filter-options">
            {filtered.map(o => (
              <div
                key={o}
                onClick={() => toggle(o)}
                className={selected.includes(o) ? 'candidate-filter-option selected' : 'candidate-filter-option'}
              >
                <input type="checkbox" checked={selected.includes(o)} onChange={() => { }} />
                <span>{o}</span>
              </div>
            ))}
          </div>
          <div className="candidate-filter-footer">
            <button type="button" onClick={() => { onChange([]); setOpen(false) }}>Clear</button>
            <button type="button" className="primary" onClick={() => setOpen(false)}>Apply</button>
          </div>
        </div>
      )}
    </div>
  )
}

// Status badge
function StatusBadge({ status }) {
  if (!status) return null
  const s = STATUS_COLORS[status] || STATUS_COLORS['Pending']
  return (
    <span style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}`, padding: '3px 9px', borderRadius: '20px', fontSize: '11px', fontWeight: '600', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
      <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'currentColor', opacity: 0.7, flexShrink: 0 }} />
      {status}
    </span>
  )
}

// Score engine
function computeScore(c) {
  const fields = ['first_name', 'last_name', 'email', 'phone', 'location', 'work_auth', 'experience', 'linkedin', 'submission_date', 'job_id', 'job_title', 'client', 'rate', 'fe_name', 'fe_extension', 'recruiter_name']
  const filled = fields.filter(f => c[f] && String(c[f]).trim() !== '').length
  const completeness = Math.round((filled / fields.length) * 25)
  const skillCount = (c.skills || []).length
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

export default function Candidates() {
  const { candidates, loading, addCandidate, updateCandidate, deleteCandidate } = useCandidates()
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState({ status: [], fe: [], job: [], location: [], feedback: [] })
  const [showModal, setShowModal] = useState(false)
  const [showDetail, setShowDetail] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [skillInput, setSkillInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [sortField, setSortField] = useState('submission_date')
  const [sortDir, setSortDir] = useState(-1)
  const [showBulkStatus, setShowBulkStatus] = useState(false)
  const bulkRef = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (bulkRef.current && !bulkRef.current.contains(e.target)) setShowBulkStatus(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  // Build filter options from live data
  const feOptions = [...new Set(candidates.map(c => c.fe_name).filter(Boolean))].sort()
  const jobOptions = [...new Set(candidates.map(c => c.job_id).filter(Boolean))].sort()
  const locationOptions = [...new Set(candidates.map(c => c.location).filter(Boolean))].sort()

  const filtered = candidates.filter(c => {
    const q = search.toLowerCase()
    if (q && !`${c.first_name} ${c.last_name} ${c.email} ${c.job_title} ${c.job_id} ${c.client} ${c.location} ${(c.skills || []).join(' ')}`.toLowerCase().includes(q)) return false
    if (filters.status.length && !filters.status.includes(c.internal_status)) return false
    if (filters.fe.length && !filters.fe.includes(c.fe_name)) return false
    if (filters.job.length && !filters.job.includes(c.job_id)) return false
    if (filters.location.length && !filters.location.includes(c.location)) return false
    if (filters.feedback.length && !filters.feedback.includes(c.feedback_status)) return false
    return true
  }).sort((a, b) => {
    const av = a[sortField] || '', bv = b[sortField] || ''
    return av < bv ? -sortDir : av > bv ? sortDir : 0
  })

  const hasFilters = search || Object.values(filters).some(f => f.length > 0)

  const clearFilters = () => {
    setSearch('')
    setFilters({ status: [], fe: [], job: [], location: [], feedback: [] })
  }

  const toggleSort = (field) => {
    if (sortField === field) setSortDir(d => d * -1)
    else { setSortField(field); setSortDir(-1) }
  }

  // Selection
  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  const toggleSelectAll = (checked) => {
    setSelected(checked ? new Set(filtered.map(c => c.id)) : new Set())
  }
  const allSelected = filtered.length > 0 && filtered.every(c => selected.has(c.id))
  const someSelected = filtered.some(c => selected.has(c.id))
  const clearSelection = () => setSelected(new Set())

  // Bulk actions
  const bulkSetStatus = async (status) => {
    setShowBulkStatus(false)
    for (const id of selected) await updateCandidate(id, { internal_status: status })
    showToast(`${selected.size} candidates updated to "${status}"`)
    clearSelection()
  }

  const bulkExport = () => {
    const sel = candidates.filter(c => selected.has(c.id))
    const headers = ['First Name', 'Last Name', 'Email', 'Phone', 'Location', 'Work Auth', 'Experience', 'Submission Date', 'Job ID', 'Job Title', 'Client', 'Rate', 'Internal Status', 'External Status', 'Feedback', 'Priority', 'Interview Date', 'FE Name', 'Extension', 'Skills', 'Notes']
    const rows = sel.map(c => [c.first_name, c.last_name, c.email, c.phone, c.location, c.work_auth, c.experience, c.submission_date, c.job_id, c.job_title, c.client, c.rate, c.internal_status, c.external_status, c.feedback_status, c.priority, c.interview_date, c.fe_name, c.fe_extension, (c.skills || []).join(';'), c.notes])
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Candidates')
    XLSX.writeFile(wb, `candidates_${new Date().toISOString().slice(0, 10)}.xlsx`)
    showToast(`Exported ${sel.length} candidates!`)
  }

  const exportAll = () => {
    const headers = ['First Name', 'Last Name', 'Email', 'Phone', 'Location', 'Work Auth', 'Experience', 'Submission Date', 'Job ID', 'Job Title', 'Client', 'Rate', 'Internal Status', 'External Status', 'Feedback', 'Priority', 'Interview Date', 'FE Name', 'Extension', 'Skills', 'Notes']
    const rows = filtered.map(c => [c.first_name, c.last_name, c.email, c.phone, c.location, c.work_auth, c.experience, c.submission_date, c.job_id, c.job_title, c.client, c.rate, c.internal_status, c.external_status, c.feedback_status, c.priority, c.interview_date, c.fe_name, c.fe_extension, (c.skills || []).join(';'), c.notes])
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Candidates')
    XLSX.writeFile(wb, `candidates_export_${new Date().toISOString().slice(0, 10)}.xlsx`)
    showToast('Excel exported!')
  }

  const bulkDelete = async () => {
    for (const id of selected) await deleteCandidate(id)
    showToast(`${selected.size} candidates deleted`, 'error')
    clearSelection()
    setDeleteId(null)
  }

  // Form
  const openAdd = () => { setForm(emptyForm); setEditingId(null); setSkillInput(''); setShowModal(true) }
  const openEdit = (c) => {
    setForm({
      first_name: c.first_name || '', last_name: c.last_name || '', email: c.email || '',
      phone: c.phone || '', location: c.location || '', work_auth: c.work_auth || 'US Citizen',
      experience: c.experience || '', linkedin: c.linkedin || '',
      submission_date: c.submission_date || new Date().toISOString().slice(0, 10),
      job_id: c.job_id || '', job_title: c.job_title || '', client: c.client || '',
      rate: c.rate || '', relocation: c.relocation || 'No',
      internal_status: c.internal_status || 'Pending', external_status: c.external_status || 'Pending',
      feedback_status: c.feedback_status || 'Awaiting', priority: c.priority || 'Medium',
      interview_date: c.interview_date || '', interview_type: c.interview_type || '',
      fe_name: c.fe_name || '', fe_extension: c.fe_extension || '',
      account_manager: c.account_manager || '', recruiter_name: c.recruiter_name || '',
      skills: c.skills || [], notes: c.notes || '', followup_date: c.followup_date || ''
    })
    setEditingId(c.id); setSkillInput(''); setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.first_name || !form.last_name) return showToast('First and last name required', 'error')
    if (!form.job_id) return showToast('Job ID required', 'error')
    setSaving(true)
    if (editingId) {
      const { error } = await updateCandidate(editingId, form)
      if (error) showToast(error.message, 'error')
      else { showToast('Candidate updated!'); setShowModal(false) }
    } else {
      const { error } = await addCandidate(form)
      if (error) showToast(error.message, 'error')
      else { showToast('Candidate added!'); setShowModal(false) }
    }
    setSaving(false)
  }

  const addSkill = (e) => {
    if (e.key === 'Enter' && skillInput.trim()) {
      e.preventDefault()
      if (!form.skills.includes(skillInput.trim())) setForm(f => ({ ...f, skills: [...f.skills, skillInput.trim()] }))
      setSkillInput('')
    }
  }

  const inp = (field) => ({ value: form[field], onChange: e => setForm(f => ({ ...f, [field]: e.target.value })), style: inputStyle })

  const candidateStats = [
    { label: 'Total Candidates', value: candidates.length, helper: `${filtered.length} shown`, tone: 'blue' },
    { label: 'Client Pipeline', value: candidates.filter(c => ['Submitted', 'Shortlisted', 'Interview Scheduled', 'Interview Done', 'Offer Extended'].includes(c.external_status)).length, helper: 'external active', tone: 'green' },
    { label: 'Interviews', value: candidates.filter(c => ['Interview Scheduled', 'Interview Done'].includes(c.external_status)).length, helper: 'client stage', tone: 'purple' },
    { label: 'Positive Feedback', value: candidates.filter(c => c.feedback_status === 'Positive').length, helper: 'good signal', tone: 'yellow' },
    { label: 'High Priority', value: candidates.filter(c => c.priority === 'High').length, helper: 'needs attention', tone: 'red' },
    { label: 'Rejected', value: candidates.filter(c => c.external_status === 'Rejected').length, helper: 'client declined', tone: 'orange' },
  ]

  return (
    <div className="candidates-page">

      {/* Topbar */}
      <div className="candidates-topbar">
        <div className="candidates-title-block">
          <p>Talent Pipeline</p>
          <h1>Candidates</h1>
          <span>Track submissions, client movement, feedback, ownership, and follow-ups.</span>
        </div>
        <div className="candidates-toolbar">
          <div className="candidates-search">
            <span>Search</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Name, job, client, skill..." />
          </div>
          <button className="candidate-btn ghost" onClick={exportAll}>Export XLSX</button>
          <button className="candidate-btn primary" onClick={openAdd}>Add Candidate</button>
        </div>
      </div>
      <div className="candidates-mobile-toolbar-spacer" aria-hidden="true" />

      <div className="candidates-stat-grid">
        {candidateStats.map(stat => (
          <div className={`candidate-stat ${stat.tone}`} key={stat.label}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
            <small>{stat.helper}</small>
          </div>
        ))}
      </div>

      {/* Filters bar */}
      <div className="candidates-filters">
        <MultiSelect label="All Statuses" options={STATUSES} selected={filters.status} onChange={v => setFilters(f => ({ ...f, status: v }))} />
        <MultiSelect label="All Front Ends" options={feOptions} selected={filters.fe} onChange={v => setFilters(f => ({ ...f, fe: v }))} />
        <MultiSelect label="All Jobs" options={jobOptions} selected={filters.job} onChange={v => setFilters(f => ({ ...f, job: v }))} />
        <MultiSelect label="All Locations" options={locationOptions} selected={filters.location} onChange={v => setFilters(f => ({ ...f, location: v }))} />
        <MultiSelect label="All Feedback" options={FEEDBACK} selected={filters.feedback} onChange={v => setFilters(f => ({ ...f, feedback: v }))} />
        {hasFilters && <button onClick={clearFilters} style={{ ...btnGhost, padding: '5px 10px', fontSize: '12px' }}>Clear All</button>}
        <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text3)', fontFamily: 'Space Mono, monospace' }}>
          {filtered.length !== candidates.length ? `${filtered.length} / ${candidates.length} shown` : `${candidates.length} records`}
        </span>
      </div>

      {/* Table */}
      <div className="candidates-content">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '60px', color: 'var(--text3)' }}>Loading candidates...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px' }}>
            <div style={{ fontSize: '40px', marginBottom: '12px', opacity: 0.5 }}>Search</div>
            <div style={{ fontSize: '14px', color: 'var(--text2)', marginBottom: '16px' }}>{hasFilters ? 'No candidates match your filters.' : 'No candidates yet.'}</div>
            {!hasFilters && <button onClick={openAdd} style={btnPrimary}>+ Add Candidate</button>}
          </div>
        ) : (
          <div className="candidates-table-card">
            <div className="candidates-table-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text)' }}>All Candidates</span>
                {selected.size > 0 && (
                  <span style={{ fontSize: '12px', color: 'var(--text3)' }}>
                    - <span style={{ color: 'var(--accent)', cursor: 'pointer', fontWeight: '600' }} onClick={() => setSelected(new Set(filtered.map(c => c.id)))}>Select all {filtered.length}</span>
                    &nbsp;/&nbsp;<span style={{ color: 'var(--text2)', cursor: 'pointer' }} onClick={clearSelection}>Deselect all</span>
                  </span>
                )}
              </div>
              <span style={{ fontSize: '12px', color: 'var(--text3)', fontFamily: 'Space Mono, monospace' }}>{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="candidates-table-scroll">
              <table className="candidates-table">
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: '40px', padding: '10px 8px 10px 16px' }}>
                      <input type="checkbox" checked={allSelected} ref={el => { if (el) el.indeterminate = someSelected && !allSelected }} onChange={e => toggleSelectAll(e.target.checked)} style={{ accentColor: 'var(--accent)', width: '15px', height: '15px', cursor: 'pointer' }} />
                    </th>
                    {[['last_name', 'Candidate'], ['submission_date', 'Date'], ['job_id', 'Job ID'], null, ['location', 'Location'], ['internal_status', 'Int. Status'], ['external_status', 'Ext. Status'], ['fe_name', 'Front End'], null].map((col, i) => {
                      if (col === null) {
                        const labels = ['Job Title', '']
                        const idx = [3, 8].indexOf(i)
                        return <th key={i} style={thStyle}>{labels[idx] || ''}</th>
                      }
                      return (
                        <th key={col[0]} style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(col[0])}>
                          <span className="candidate-th-label">
                            {col[1]}
                            <span
                              className={`candidate-sort ${sortField === col[0] ? (sortDir === -1 ? 'desc' : 'asc') : ''}`}
                              aria-hidden="true"
                            />
                          </span>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => {
                    const isSelected = selected.has(c.id)
                    return (
                      <tr
                        key={c.id}
                        style={{ background: isSelected ? 'rgba(79,124,255,0.06)' : 'transparent', cursor: 'default' }}
                        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
                        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                      >
                        <td style={{ ...tdStyle, padding: '11px 8px 11px 16px', borderLeft: isSelected ? '3px solid var(--accent)' : '3px solid transparent' }}>
                          <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(c.id)} style={{ accentColor: 'var(--accent)', width: '15px', height: '15px', cursor: 'pointer' }} />
                        </td>
                        <td style={tdStyle}>
                          <div className="candidate-identity" onClick={() => setShowDetail(c)}>
                            <span className="candidate-avatar">{`${c.first_name?.[0] || ''}${c.last_name?.[0] || ''}` || '?'}</span>
                            <span>
                              <strong>{c.first_name} {c.last_name}</strong>
                              <small>{c.email || c.phone || c.work_auth || 'Contact n/a'}</small>
                            </span>
                          </div>
                        </td>
                        <td style={{ ...tdStyle, fontFamily: 'var(--mono)', fontSize: '11px' }}>{c.submission_date || '-'}</td>
                        <td style={{ ...tdStyle, fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--text2)' }}>{c.job_id || '-'}</td>
                        <td style={{ ...tdStyle, fontSize: '12px' }}>{c.job_title || '-'}</td>
                        <td style={{ ...tdStyle, fontSize: '12px' }}>{c.location || '-'}</td>
                        <td style={tdStyle}><StatusBadge status={c.internal_status} /></td>
                        <td style={tdStyle}><StatusBadge status={c.external_status} /></td>
                        <td style={tdStyle}>
                          {c.fe_name ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: 'var(--surface3)', borderRadius: '6px', padding: '3px 8px', fontSize: '11px', fontWeight: '600', color: 'var(--text)', maxWidth: '120px' }}>
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--green)', flexShrink: 0 }} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.fe_name}</span>
                              </div>
                              {c.fe_extension && (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: 'var(--text3)', fontFamily: 'var(--mono)', paddingLeft: '2px' }}>
                                  <span style={{ fontSize: '9px', opacity: 0.6 }}>ext</span>
                                  <span style={{ color: 'var(--accent)', fontWeight: '700' }}>{c.fe_extension}</span>
                                </div>
                              )}
                            </div>
                          ) : (
                            <span style={{ color: 'var(--text3)', fontSize: '12px' }}>—</span>
                          )}
                        </td>
                        <td style={tdStyle}>
                          <div className="candidate-row-actions">
                            <button onClick={() => setShowDetail(c)} title="View details">View</button>
                            <button onClick={() => openEdit(c)} title="Edit">Edit</button>
                            <button className="danger" onClick={() => setDeleteId(c.id)} title="Delete">Delete</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div style={{ position: 'fixed', bottom: '28px', left: '50%', transform: 'translateX(-50%)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(79,124,255,0.2)', zIndex: 500, whiteSpace: 'nowrap' }}>
          <span style={{ background: 'var(--accent)', color: '#fff', fontFamily: 'Space Mono, monospace', fontSize: '12px', fontWeight: '700', padding: '4px 10px', borderRadius: '20px', marginRight: '4px' }}>{selected.size}</span>
          <span style={{ fontSize: '13px', color: 'var(--text2)', marginRight: '8px' }}>selected</span>
          <div style={{ width: '1px', height: '24px', background: 'var(--border)', margin: '0 4px' }} />

          {/* Change Status */}
          <div ref={bulkRef} style={{ position: 'relative' }}>
            <button onClick={() => setShowBulkStatus(!showBulkStatus)} style={bulkBtn}>
              Change Status <span className="candidate-filter-chevron" aria-hidden="true" />
            </button>
            {showBulkStatus && (
              <div style={{ position: 'absolute', bottom: 'calc(100% + 8px)', left: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', zIndex: 600, minWidth: '200px', padding: '6px', overflow: 'hidden' }}>
                <div style={{ padding: '6px 10px 4px', fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: '700' }}>Set Internal Status</div>
                {STATUSES.map(s => (
                  <div key={s} onClick={() => bulkSetStatus(s)} style={{ padding: '8px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12.5px', color: 'var(--text2)', transition: 'all 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >{s}</div>
                ))}
              </div>
            )}
          </div>

          <button onClick={bulkExport} style={bulkBtn}>Export</button>
          <div style={{ width: '1px', height: '24px', background: 'var(--border)', margin: '0 4px' }} />
          <button onClick={() => setDeleteId('bulk')} style={{ ...bulkBtn, color: 'var(--red)', borderColor: 'rgba(255,77,106,0.3)' }}>Delete</button>
          <button onClick={clearSelection} style={{ width: '28px', height: '28px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', marginLeft: '4px' }}>x</button>
        </div>
      )}

      {/* Detail modal */}
      {showDetail && (
        <div style={overlayStyle} onClick={e => e.target === e.currentTarget && setShowDetail(null)}>
          <div style={{ ...modalStyle, maxWidth: '900px' }}>
            <div style={modalHeader}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text)' }}>{showDetail.first_name} {showDetail.last_name}</div>
                <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>{showDetail.job_title} · <span style={{ color: 'var(--accent)', fontFamily: 'Space Mono, monospace' }}>{showDetail.job_id}</span></div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => { setShowDetail(null); openEdit(showDetail) }} style={{ ...btnGhost, fontSize: '12px', padding: '6px 12px' }}>Edit</button>
                <button onClick={() => setShowDetail(null)} style={closeBtn}>x</button>
              </div>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: '24px' }}>
              {/* Score Card */}
              {(() => {
                const sc = computeScore(showDetail)
                const circumference = 2 * Math.PI * 40
                const offset = circumference - (sc.total / 100) * circumference
                return (
                  <div style={{ background: 'linear-gradient(135deg, rgba(79,124,255,0.08), rgba(124,92,255,0.08))', border: '1px solid rgba(79,124,255,0.25)', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                      <div style={{ fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--accent)' }}>Candidate Score Card</div>
                      <span style={{ background: `${sc.gradeColor}22`, color: sc.gradeColor, border: `1px solid ${sc.gradeColor}44`, borderRadius: '20px', padding: '3px 12px', fontSize: '11px', fontWeight: '700', fontFamily: 'Space Mono, monospace' }}>{sc.gradeLabel}</span>
                    </div>
                    <div className="candidate-score-card-body">
                      <div style={{ position: 'relative', flexShrink: 0 }}>
                        <svg width="100" height="100" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
                          <circle cx="50" cy="50" r="40" fill="none" stroke="var(--surface3)" strokeWidth="8" />
                          <circle cx="50" cy="50" r="40" fill="none" stroke={sc.gradeColor} strokeWidth="8" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} style={{ transition: 'stroke-dashoffset 1s ease' }} />
                        </svg>
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                          <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '26px', fontWeight: '700', color: sc.gradeColor, lineHeight: 1 }}>{sc.total}</div>
                          <div style={{ fontSize: '9px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '1px' }}>/ 100</div>
                        </div>
                      </div>
                      <div className="candidate-score-grid">
                        {[['Profile', sc.completeness, 25], ['Skills', sc.skillScore, 25], ['Pipeline', sc.statusScore, 30], ['Recency', sc.recencyScore, 20]].map(([label, score, max]) => (
                          <div key={label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px' }}>
                            <div style={{ fontSize: '10px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>{label}</div>
                            <div style={{ height: '5px', background: 'var(--surface3)', borderRadius: '3px', overflow: 'hidden', marginBottom: '5px' }}>
                              <div style={{ height: '100%', width: `${Math.round(score / max * 100)}%`, background: sc.gradeColor, borderRadius: '3px' }} />
                            </div>
                            <div style={{ fontFamily: 'Space Mono, monospace', fontSize: '12px', fontWeight: '700', color: sc.gradeColor }}>{score}<span style={{ color: 'var(--text3)', fontSize: '10px' }}>/{max}</span></div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '14px' }}>
                      {sc.insights.slice(0, 8).map((insight, i) => (
                        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', padding: '4px 10px', borderRadius: '20px', background: insight.type === 'good' ? 'rgba(46,204,143,0.06)' : insight.type === 'bad' ? 'rgba(255,77,106,0.06)' : 'rgba(245,200,66,0.06)', border: `1px solid ${insight.type === 'good' ? 'rgba(46,204,143,0.3)' : insight.type === 'bad' ? 'rgba(255,77,106,0.3)' : 'rgba(245,200,66,0.3)'}`, color: insight.type === 'good' ? 'var(--green)' : insight.type === 'bad' ? 'var(--red)' : 'var(--yellow)' }}>
                          {insight.text}
                        </span>
                      ))}
                    </div>
                  </div>
                )
              })()}

              {/* Details Grid */}
              <div className="candidate-details-grid">
                <DetailSection title="Personal Info" rows={[['Full Name', `${showDetail.first_name} ${showDetail.last_name}`], ['Email', showDetail.email], ['Phone', showDetail.phone], ['Location', showDetail.location], ['Work Auth', showDetail.work_auth], ['Experience', showDetail.experience ? showDetail.experience + ' yrs' : '-'], ['LinkedIn', showDetail.linkedin], ['Relocation', showDetail.relocation]]} />
                <DetailSection title="Submission" rows={[['Date', showDetail.submission_date], ['Job ID', showDetail.job_id], ['Job Title', showDetail.job_title], ['Client', showDetail.client], ['Rate', showDetail.rate]]} />
                <DetailSection title="Status" rows={[['Internal', showDetail.internal_status], ['External', showDetail.external_status], ['Feedback', showDetail.feedback_status], ['Priority', showDetail.priority], ['Interview Date', showDetail.interview_date], ['Interview Type', showDetail.interview_type], ['Follow-up', showDetail.followup_date]]} />
                <DetailSection title="Front End" rows={[['FE Name', showDetail.fe_name], ['Extension', showDetail.fe_extension], ['Acct Manager', showDetail.account_manager], ['Recruiter', showDetail.recruiter_name]]} />
              </div>
              {/* Skills */}
              <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px', marginTop: '16px' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>Skills</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {(showDetail.skills || []).map(s => <span key={s} style={{ background: 'rgba(79,124,255,0.12)', color: 'var(--accent)', border: '1px solid rgba(79,124,255,0.25)', borderRadius: '20px', padding: '3px 10px', fontSize: '12px', fontWeight: '600' }}>{s}</span>)}
                  {!(showDetail.skills || []).length && <span style={{ color: 'var(--text3)', fontSize: '13px' }}>No skills listed</span>}
                </div>
              </div>
              {showDetail.notes && (
                <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px', marginTop: '16px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>Notes</div>
                  <p style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: '1.7' }}>{showDetail.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add/edit modal */}
      {showModal && (
        <div style={overlayStyle} onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div style={modalStyle}>
            <div style={modalHeader}>
              <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text)' }}>{editingId ? 'Edit Candidate' : 'Add Candidate'}</div>
              <button onClick={() => setShowModal(false)} style={closeBtn}>x</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: '20px 24px' }}>
              <Section title="Personal Info" />
              <div className="candidate-form-grid">
                <Field label="First Name *"><input {...inp('first_name')} placeholder="John" /></Field>
                <Field label="Last Name *"><input {...inp('last_name')} placeholder="Smith" /></Field>
                <Field label="Email"><input {...inp('email')} type="email" placeholder="john@email.com" /></Field>
                <Field label="Phone"><input {...inp('phone')} placeholder="+1 555 000 0000" /></Field>
                <Field label="Location *"><input {...inp('location')} placeholder="City, State" /></Field>
                <Field label="Work Auth"><select {...inp('work_auth')} style={inputStyle}>{WORK_AUTHS.map(o => <option key={o}>{o}</option>)}</select></Field>
                <Field label="Experience (yrs)"><input {...inp('experience')} type="number" placeholder="5" /></Field>
                <Field label="LinkedIn"><input {...inp('linkedin')} placeholder="linkedin.com/in/..." /></Field>
              </div>
              <Section title="Submission Details" />
              <div className="candidate-form-grid">
                <Field label="Submission Date *"><input {...inp('submission_date')} type="date" /></Field>
                <Field label="Job ID *"><input {...inp('job_id')} placeholder="JOB-001" /></Field>
                <Field label="Job Title *"><input {...inp('job_title')} placeholder="Software Engineer" /></Field>
                <Field label="Client"><input {...inp('client')} placeholder="Acme Corp" /></Field>
                <Field label="Bill Rate"><input {...inp('rate')} placeholder="$85/hr" /></Field>
                <Field label="Relocation"><select {...inp('relocation')} style={inputStyle}>{['Yes', 'No', 'Negotiable'].map(o => <option key={o}>{o}</option>)}</select></Field>
              </div>
              <Section title="Status Tracking" />
              <div className="candidate-form-grid">
                <Field label="Internal Status"><select {...inp('internal_status')} style={inputStyle}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></Field>
                <Field label="External Status"><select {...inp('external_status')} style={inputStyle}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></Field>
                <Field label="Feedback Status"><select {...inp('feedback_status')} style={inputStyle}>{FEEDBACK.map(o => <option key={o}>{o}</option>)}</select></Field>
                <Field label="Priority"><select {...inp('priority')} style={inputStyle}>{['High', 'Medium', 'Low'].map(o => <option key={o}>{o}</option>)}</select></Field>
                <Field label="Interview Date"><input {...inp('interview_date')} type="date" /></Field>
                <Field label="Interview Type"><select {...inp('interview_type')} style={inputStyle}>{['', 'Phone Screen', 'Video Call', 'On-site', 'Panel', 'Technical'].map(o => <option key={o}>{o}</option>)}</select></Field>
              </div>
              <Section title="Front End / Ownership" />
              <div className="candidate-form-grid">
                <Field label="FE Name *"><input {...inp('fe_name')} placeholder="Sarah K." /></Field>
                <Field label="Extension"><input {...inp('fe_extension')} placeholder="x204" /></Field>
                <Field label="Account Manager"><input {...inp('account_manager')} placeholder="Mike R." /></Field>
                <Field label="Recruiter"><input {...inp('recruiter_name')} placeholder="Your name" /></Field>
              </div>
              <Section title="Skills & Notes" />
              <Field label="Skills (press Enter to add)">
                <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '42px', cursor: 'text' }} onClick={() => document.getElementById('skill-inp')?.focus()}>
                  {form.skills.map(s => (
                    <span key={s} style={{ background: 'rgba(79,124,255,0.15)', color: 'var(--accent)', border: '1px solid rgba(79,124,255,0.3)', borderRadius: '20px', padding: '2px 9px', fontSize: '11px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      {s} <span onClick={() => setForm(f => ({ ...f, skills: f.skills.filter(x => x !== s) }))} style={{ cursor: 'pointer', opacity: 0.7, fontSize: '10px' }}>x</span>
                    </span>
                  ))}
                  <input id="skill-inp" value={skillInput} onChange={e => setSkillInput(e.target.value)} onKeyDown={addSkill} placeholder={form.skills.length ? '' : 'Type a skill and press Enter...'} style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: '13px', fontFamily: 'DM Sans, sans-serif', minWidth: '160px', flex: 1 }} />
                </div>
              </Field>
              <Field label="Notes"><textarea {...inp('notes')} placeholder="Internal notes..." style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} /></Field>
              <Field label="Follow-up Date"><input {...inp('followup_date')} type="date" /></Field>
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '10px', flexShrink: 0 }}>
              <button onClick={() => setShowModal(false)} style={btnGhost}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving...' : editingId ? 'Update Candidate' : 'Save Candidate'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div style={overlayStyle} onClick={e => e.target === e.currentTarget && setDeleteId(null)}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '32px', maxWidth: '420px', width: '90%', textAlign: 'center' }}>
            <div style={{ fontSize: '18px', marginBottom: '12px', color: 'var(--red)', fontWeight: 800 }}>Delete</div>
            <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text)', marginBottom: '8px' }}>
              {deleteId === 'bulk' ? `Delete ${selected.size} candidates?` : 'Delete Candidate?'}
            </div>
            <div style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '24px', lineHeight: '1.6' }}>This cannot be undone.</div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button onClick={() => setDeleteId(null)} style={btnGhost}>Cancel</button>
              <button onClick={deleteId === 'bulk' ? bulkDelete : async () => { await deleteCandidate(deleteId); showToast('Deleted!', 'error'); setDeleteId(null) }} style={{ ...btnPrimary, background: 'var(--red)' }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && <div style={{ position: 'fixed', bottom: '24px', right: '24px', background: toast.type === 'error' ? 'var(--red)' : 'var(--green)', color: '#fff', padding: '12px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: '600', zIndex: 9999, boxShadow: '0 4px 20px rgba(0,0,0,0.4)', fontFamily: 'DM Sans, sans-serif' }}>{toast.msg}</div>}
    </div>
  )
}

// Helpers
function DetailSection({ title, rows }) {
  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
      <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>{title}</div>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '7px 0', borderBottom: '1px solid rgba(44,49,72,0.5)', gap: '12px' }}>
          <span style={{ fontSize: '11.5px', color: 'var(--text3)', minWidth: '110px' }}>{k}</span>
          <span style={{ fontSize: '13px', color: 'var(--text)', textAlign: 'right', fontWeight: '500', wordBreak: 'break-word' }}>{v || '-'}</span>
        </div>
      ))}
    </div>
  )
}

function Section({ title }) {
  return <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '1px', padding: '16px 0 10px', borderTop: '1px solid var(--border)', marginTop: '8px', gridColumn: '1 / -1' }}>{title}</div>
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', letterSpacing: '0.5px', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: '6px' }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle = { width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 13px', color: 'var(--text)', fontSize: '13.5px', outline: 'none', fontFamily: 'DM Sans, sans-serif', transition: 'border-color 0.15s' }
const thStyle = { textAlign: 'left', fontSize: '10.5px', fontWeight: '700', letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--text3)', padding: '10px 14px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
const tdStyle = { padding: '11px 14px', fontSize: '13px', color: 'var(--text2)', borderBottom: '1px solid rgba(44,49,72,0.5)', whiteSpace: 'nowrap', verticalAlign: 'middle' }
const btnPrimary = { background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif', display: 'inline-flex', alignItems: 'center', gap: '6px' }
const btnGhost = { background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }
const bulkBtn = { display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 13px', borderRadius: '8px', fontSize: '12.5px', fontWeight: '600', fontFamily: 'DM Sans, sans-serif', cursor: 'pointer', border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text2)', transition: 'all 0.15s', whiteSpace: 'nowrap' }
const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }
const modalStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', width: '90%', maxWidth: '780px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }
const modalHeader = { padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }
const closeBtn = { background: 'none', border: 'none', color: 'var(--text3)', fontSize: '18px', cursor: 'pointer', padding: '4px' }
