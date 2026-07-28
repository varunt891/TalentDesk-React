import { useState, useEffect, useCallback } from 'react'
import { db } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useCandidates } from '../hooks/useCandidates'

function ensureArray(val) {
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

const GENERIC_SOFT_SKILLS = ['communication', 'leadership', 'teamwork', 'problem solving', 'agile', 'scrum', 'jira', 'management', 'collaboration']

function getMatchingCandidates(job, candidatesList = []) {
  if (!job || !candidatesList || !candidatesList.length) return []

  const jobSkills = ensureArray(job.skills).map(s => String(s).toLowerCase().trim())
  const domainJobSkills = jobSkills.filter(s => !GENERIC_SOFT_SKILLS.includes(s))
  const jobTitle = String(job.title || '').toLowerCase()
  const jobDesc = String(job.description || '').toLowerCase()
  const jobId = String(job.job_id || '').toLowerCase()

  return candidatesList.map(c => {
    const origCandSkills = ensureArray(c.skills)
    const matchedSkills = origCandSkills.filter(s => {
      const lower = String(s).toLowerCase().trim()
      return jobSkills.includes(lower) || (jobTitle && jobTitle.includes(lower)) || (jobDesc && jobDesc.includes(lower))
    })

    const matchedDomainSkills = origCandSkills.filter(s => {
      const lower = String(s).toLowerCase().trim()
      return !GENERIC_SOFT_SKILLS.includes(lower) && (jobSkills.includes(lower) || (jobTitle && jobTitle.includes(lower)) || (jobDesc && jobDesc.includes(lower)))
    })

    const matchByJobId = c.job_id && String(c.job_id).toLowerCase() === jobId && jobId !== ''

    let matchPercentage = 0
    if (domainJobSkills.length > 0) {
      const overlapCount = matchedDomainSkills.filter(s => domainJobSkills.includes(String(s).toLowerCase().trim())).length
      matchPercentage = Math.round((overlapCount / domainJobSkills.length) * 100)
    } else if (matchedDomainSkills.length > 0) {
      matchPercentage = Math.min(100, matchedDomainSkills.length * 33)
    }

    if (matchByJobId) {
      matchPercentage = Math.max(matchPercentage, 90)
      if (matchedDomainSkills.length >= 2) matchPercentage = 100
    }

    const isMatched = matchByJobId || (matchedDomainSkills.length >= 1 && matchPercentage >= 40)

    return {
      candidate: c,
      matchedSkills: matchedDomainSkills.length > 0 ? matchedDomainSkills : matchedSkills,
      matchPercentage,
      isMatched,
      matchByJobId
    }
  })
    .filter(item => item.isMatched)
    .sort((a, b) => b.matchPercentage - a.matchPercentage)
}

const emptyForm = {
  job_id: '', title: '', client: '', location: '', type: 'Contract',
  status: 'Open', rate: '', open_date: new Date().toISOString().slice(0, 10),
  priority: 'Medium', fe: '', skills: [], description: ''
}

export default function Jobs() {
  const { user } = useAuth()
  const { candidates } = useCandidates()
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [showDetail, setShowDetail] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [skillInput, setSkillInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [viewingCandidate, setViewingCandidate] = useState(null)
  const [showMatchedOnly, setShowMatchedOnly] = useState(false)

  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true)
      console.log('[Jobs] Fetching jobs for user:', user?.id)
      const { data, error } = await db.from('jobs').select('*').order('created_at', { ascending: false })
      console.log('[Jobs] Fetch response:', { data, error })
      if (error) {
        console.error('[Jobs] Fetch error:', error)
      }
      setJobs(data || [])
      console.log('[Jobs] Jobs set:', data?.length || 0, 'items')
      setLoading(false)
    } catch (err) {
      console.error('[Jobs] Exception:', err)
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    console.log('[Jobs] useEffect triggered, user:', user?.id)
    if (user) fetchJobs()
  }, [user, fetchJobs])

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const filtered = jobs.filter(j => {
    const q = search.toLowerCase()
    const matchSearch = !q || `${j.title} ${j.client} ${j.job_id} ${j.location}`.toLowerCase().includes(q)
    const matchStatus = !statusFilter || j.status === statusFilter
    return matchSearch && matchStatus
  })

  const openAdd = () => { setForm(emptyForm); setEditingId(null); setSkillInput(''); setShowModal(true) }
  const openEdit = (j) => {
    setForm({ job_id: j.job_id || '', title: j.title || '', client: j.client || '', location: j.location || '', type: j.type || 'Contract', status: j.status || 'Open', rate: j.rate || '', open_date: j.open_date || new Date().toISOString().slice(0, 10), priority: j.priority || 'Medium', fe: j.fe || '', skills: j.skills || [], description: j.description || '' })
    setEditingId(j.id); setSkillInput(''); setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.title) return showToast('Job title required', 'error')
    setSaving(true)
    const payload = { ...form, open_date: form.open_date || null, user_id: user.id }
    if (editingId) {
      const { error } = await db.from('jobs').update(payload).eq('id', editingId)
      if (error) showToast(error.message, 'error')
      else { showToast('Job updated!'); fetchJobs(); setShowModal(false) }
    } else {
      const { error } = await db.from('jobs').insert([payload])
      if (error) showToast(error.message, 'error')
      else { showToast('Job added!'); fetchJobs(); setShowModal(false) }
    }
    setSaving(false)
  }

  const handleDelete = async () => {
    await db.from('jobs').delete().eq('id', deleteId)
    showToast('Job deleted!', 'error')
    fetchJobs(); setDeleteId(null)
  }

  const addSkill = (e) => {
    if (e.key === 'Enter' && skillInput.trim()) {
      e.preventDefault()
      if (!form.skills.includes(skillInput.trim())) setForm(f => ({ ...f, skills: [...f.skills, skillInput.trim()] }))
      setSkillInput('')
    }
  }

  const inp = (field) => ({ value: form[field], onChange: e => setForm(f => ({ ...f, [field]: e.target.value })), style: inputStyle })

  const STATUS_COLORS = { 'Open': '#2ecc8f', 'Filled': '#4f7cff', 'On Hold': '#f5c842', 'Closed': '#ff4d6a' }
  const jobStats = [
    { label: 'Open roles', value: jobs.filter(j => j.status === 'Open').length, color: STATUS_COLORS['Open'] },
    { label: 'On hold', value: jobs.filter(j => j.status === 'On Hold').length, color: STATUS_COLORS['On Hold'] },
    { label: 'Filled', value: jobs.filter(j => j.status === 'Filled').length, color: STATUS_COLORS['Filled'] },
    { label: 'Closed', value: jobs.filter(j => j.status === 'Closed').length, color: STATUS_COLORS['Closed'] },
  ]

function getInitials(name = '') {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

  return (
    <div className="jobs-page">
      {/* Header Banner */}
      <header className="jobs-header-banner">
        <div className="jobs-header-info">
          <div className="jobs-badge-pill">
            <span>🎯 ROLE PIPELINE & REQUISITION CONTROL CENTER</span>
          </div>
          <h1>Jobs & Client Requisitions</h1>
          <p>
            Track open positions, client requisitions, candidate matches, rates, and requisition status across teams ({jobs.length} total active roles).
          </p>
        </div>

        <div className="jobs-header-actions">
          <div className="jobs-search-box">
            <svg className="jobs-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search jobs, client, owner or ID..."
              className="jobs-search-input"
            />
            {search && (
              <button onClick={() => setSearch('')} className="jobs-search-clear" title="Clear search">×</button>
            )}
          </div>
          <button onClick={openAdd} className="jobs-btn-primary">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>+ New Job</span>
          </button>
        </div>
      </header>

      {/* Summary Statistics Cards */}
      <div className="jobs-metrics-grid">
        {[
          { label: 'Open Roles', count: jobs.filter(j => j.status === 'Open').length, helper: 'Active positions', footnote: 'Updated real-time', color: '#2ecc8f' },
          { label: 'Filled Roles', count: jobs.filter(j => j.status === 'Filled').length, helper: 'Fulfilled positions', footnote: 'Successful placements', color: '#4f7cff' },
          { label: 'On Hold', count: jobs.filter(j => j.status === 'On Hold').length, helper: 'Temporarily paused', footnote: 'Pending client review', color: '#f5c842' },
          { label: 'Closed', count: jobs.filter(j => j.status === 'Closed').length, helper: 'Archived positions', footnote: 'Completed cycles', color: '#ff4d6a' }
        ].map(stat => (
          <div key={stat.label} className="jobs-metric-card" style={{ '--metric-accent': stat.color }}>
            <div className="jobs-metric-header">
              <span className="jobs-metric-label">{stat.label}</span>
              <span className="jobs-metric-dot" style={{ background: stat.color }} />
            </div>
            <div className="jobs-metric-value">{stat.count}</div>
            <div className="jobs-metric-footer">
              <span className="jobs-metric-helper">{stat.helper}</span>
              <span className="jobs-metric-footnote">• {stat.footnote}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Segmented Filter Controls */}
      <div className="jobs-controls-bar">
        <div className="jobs-segmented-control">
          <button
            type="button"
            onClick={() => setStatusFilter('')}
            className={`jobs-segment-btn ${!statusFilter ? 'active' : ''}`}
          >
            All Roles ({jobs.length})
          </button>
          {['Open', 'Filled', 'On Hold', 'Closed'].map(s => {
            const count = jobs.filter(j => j.status === s).length
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
                className={`jobs-segment-btn ${statusFilter === s ? 'active' : ''}`}
              >
                <span className="jobs-status-dot-sm" style={{ background: STATUS_COLORS[s] }} />
                {s} ({count})
              </button>
            )
          })}
        </div>
        <div className="jobs-controls-right">
          <span className="jobs-count-badge">
            Showing <strong>{filtered.length}</strong> of {jobs.length} roles
          </span>
        </div>
      </div>

      {/* Main Content Table & Cards */}
      <div className="jobs-content">
        {loading ? (
          <div style={emptyState}>Loading jobs...</div>
        ) : filtered.length === 0 ? (
          <div className="jobs-empty" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '48px', textAlign: 'center' }}>
            <strong style={{ fontSize: '18px', color: 'var(--text)' }}>No jobs found</strong>
            <span style={{ fontSize: '13px', color: 'var(--text3)', display: 'block', marginTop: '6px', marginBottom: '18px' }}>
              {search || statusFilter ? 'Try changing your search or status filter.' : 'Create your first job requisition to start tracking client demand.'}
            </span>
            {!search && !statusFilter && (
              <button onClick={openAdd} className="jobs-btn-primary">New Job</button>
            )}
          </div>
        ) : (
          <div className="jobs-table-container">
            {/* Desktop Table Header */}
            <div className="jobs-table-header">
              <span>Role & Client</span>
              <span>Status</span>
              <span>Location</span>
              <span>Type</span>
              <span>Rate</span>
              <span>Owner</span>
              <span style={{ textAlign: 'right' }}>Actions</span>
            </div>

            {/* Rows Mapping */}
            {filtered.map(j => {
              const matches = getMatchingCandidates(j, candidates)
              return (
                <article
                  key={j.id}
                  className="jobs-table-row"
                  onClick={() => setShowDetail(j)}
                >
                  <div className="jobs-role-cell">
                    <strong className="jobs-role-title">{j.title || 'Untitled role'}</strong>
                    <div className="jobs-role-meta">
                      <span className="jobs-id-pill">{j.job_id || 'No ID'}</span>
                      <span className="jobs-client-name">• {j.client || 'Client n/a'}</span>
                      {matches.length > 0 && (
                        <span
                          onClick={(e) => {
                            e.stopPropagation()
                            setShowDetail(j)
                            setShowMatchedOnly(true)
                          }}
                          title="Click to view matched candidates only"
                          className="jobs-match-chip"
                        >
                          🎯 {matches.length} Candidate Match{matches.length > 1 ? 'es' : ''}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Modern Status Dot Indicator (No Heavy Outlines!) */}
                  <div>
                    <span className="jobs-status-dot-pill">
                      <span className="dot" style={{ background: STATUS_COLORS[j.status] || 'var(--text3)' }} />
                      {j.status || 'Open'}
                    </span>
                  </div>

                  <div className="jobs-text-cell">{j.location || 'Location n/a'}</div>
                  <div className="jobs-text-cell"><span className="jobs-type-badge">{j.type || 'Contract'}</span></div>
                  <div className="jobs-rate-cell">{j.rate || 'Rate n/a'}</div>

                  {/* Owner Initials Avatar */}
                  <div className="jobs-owner-cell">
                    <div className="jobs-owner-avatar">{getInitials(j.fe)}</div>
                    <span className="jobs-owner-name">{j.fe || 'Unassigned'}</span>
                  </div>

                  {/* Action Icons */}
                  <div className="jobs-action-btns" style={{ justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); openEdit(j) }}
                      className="jobs-action-btn"
                      title="Edit Job"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setDeleteId(j.id) }}
                      className="jobs-action-btn danger"
                      title="Delete Job"
                    >
                      Delete
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>

      {showModal && (
        <div style={overlayStyle} onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div style={modalStyle}>
            <div style={modalHeader}>
              <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text)' }}>{editingId ? 'Edit Job' : 'Add Job'}</div>
              <button onClick={() => setShowModal(false)} style={closeBtn}>x</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: '20px 24px' }}>
              <div className="jobs-form-grid">
                <Field label="Job ID"><input {...inp('job_id')} placeholder="JOB-001" /></Field>
                <Field label="Job Title *"><input {...inp('title')} placeholder="Senior Developer" /></Field>
                <Field label="Client"><input {...inp('client')} placeholder="Acme Corp" /></Field>
                <Field label="Location"><input {...inp('location')} placeholder="New York, NY / Remote" /></Field>
                <Field label="Type">
                  <select {...inp('type')} style={inputStyle}>
                    {['Contract', 'Full-time', 'Contract-to-Hire', 'Part-time'].map(o => <option key={o}>{o}</option>)}
                  </select>
                </Field>
                <Field label="Status">
                  <select {...inp('status')} style={inputStyle}>
                    {['Open', 'Filled', 'On Hold', 'Closed'].map(o => <option key={o}>{o}</option>)}
                  </select>
                </Field>
                <Field label="Rate"><input {...inp('rate')} placeholder="$80-100/hr" /></Field>
                <Field label="Open Date"><input {...inp('open_date')} type="date" /></Field>
                <Field label="Priority">
                  <select {...inp('priority')} style={inputStyle}>
                    {['High', 'Medium', 'Low'].map(o => <option key={o}>{o}</option>)}
                  </select>
                </Field>
                <Field label="Front End"><input {...inp('fe')} placeholder="Sarah K." /></Field>
              </div>
              <Field label="Skills (Enter to add)">
                <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px', display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '42px' }}>
                  {form.skills.map(s => (
                    <span key={s} style={{ background: 'rgba(79,124,255,0.15)', color: 'var(--accent)', border: '1px solid rgba(79,124,255,0.3)', borderRadius: '6px', padding: '2px 8px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {s} <span onClick={() => setForm(f => ({ ...f, skills: f.skills.filter(x => x !== s) }))} style={{ cursor: 'pointer' }}>x</span>
                    </span>
                  ))}
                  <input value={skillInput} onChange={e => setSkillInput(e.target.value)} onKeyDown={addSkill} placeholder="React, Python..." style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: '13px', fontFamily: 'inherit', minWidth: '120px', flex: 1 }} />
                </div>
              </Field>
              <Field label="Description">
                <textarea {...inp('description')} style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} />
              </Field>
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setShowModal(false)} style={btnGhost}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving...' : editingId ? 'Update Job' : 'Save Job'}</button>
            </div>
          </div>
        </div>
      )}

      {showDetail && (
        <div style={overlayStyle} onClick={e => e.target === e.currentTarget && setShowDetail(null)}>
          <div style={{ ...modalStyle, maxWidth: '750px', maxHeight: '90vh' }}>
            <div style={modalHeader}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text)' }}>{showDetail.title}</div>
                <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>
                  Job ID: <span style={{ color: 'var(--accent)', fontFamily: 'Space Mono, monospace', fontWeight: '700' }}>{showDetail.job_id}</span> · {showDetail.client || 'Client n/a'}
                </div>
              </div>
              <button onClick={() => { setShowDetail(null); setShowMatchedOnly(false) }} style={closeBtn}>x</button>
            </div>

            {/* Modal Navigation Tabs */}
            {(() => {
              const matches = getMatchingCandidates(showDetail, candidates)
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', borderBottom: '1px solid var(--border)', padding: '0 24px', background: 'var(--surface2)', gap: '16px' }}>
                    <button
                      type="button"
                      onClick={() => setShowMatchedOnly(false)}
                      style={{
                        padding: '12px 4px',
                        border: 'none',
                        borderBottom: !showMatchedOnly ? '2px solid var(--accent)' : '2px solid transparent',
                        color: !showMatchedOnly ? 'var(--accent)' : 'var(--text3)',
                        fontWeight: '700',
                        fontSize: '13px',
                        background: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      📋 Job Overview & Details
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowMatchedOnly(true)}
                      style={{
                        padding: '12px 4px',
                        border: 'none',
                        borderBottom: showMatchedOnly ? '2px solid var(--accent)' : '2px solid transparent',
                        color: showMatchedOnly ? 'var(--accent)' : 'var(--text3)',
                        fontWeight: '700',
                        fontSize: '13px',
                        background: 'none',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      🎯 Matched Candidates
                      <span style={{ background: showMatchedOnly ? 'var(--accent)' : 'var(--surface3)', color: showMatchedOnly ? '#fff' : 'var(--text)', padding: '2px 8px', borderRadius: '12px', fontSize: '11px' }}>
                        {matches.length}
                      </span>
                    </button>
                  </div>

                  <div style={{ overflowY: 'auto', flex: 1, padding: '24px' }}>
                    {showMatchedOnly ? (
                      /* ONLY Matched Candidates View */
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                          <h4 style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text)', margin: 0 }}>
                            Matched Candidates for {showDetail.title}
                          </h4>
                          <span style={{ fontSize: '12px', color: 'var(--text3)' }}>
                            Showing candidates matching required skills or requisition ID
                          </span>
                        </div>

                        {matches.length === 0 ? (
                          <div style={{ fontSize: '13px', color: 'var(--text3)', fontStyle: 'italic', background: 'var(--surface2)', padding: '24px', borderRadius: '12px', textAlign: 'center', border: '1px solid var(--border)' }}>
                            No candidate profiles currently match this job's required skills. You can add candidate resume text in the Candidates section to auto-extract skills!
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {matches.map(({ candidate, matchedSkills, matchPercentage, matchByJobId }) => (
                              <div
                                key={candidate.id}
                                style={{
                                  background: 'var(--surface2)',
                                  border: '1px solid var(--border)',
                                  borderRadius: '12px',
                                  padding: '16px',
                                  display: 'flex',
                                  flexDirection: 'column',
                                  gap: '10px',
                                  transition: 'border-color 0.2s ease, box-shadow 0.2s ease'
                                }}
                              >
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px' }}>
                                  <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                      <strong style={{ fontSize: '15px', color: 'var(--text)', fontWeight: '700' }}>
                                        {candidate.first_name} {candidate.last_name}
                                      </strong>
                                      {matchByJobId && (
                                        <span style={{ fontSize: '10px', background: 'rgba(79,124,255,0.15)', color: 'var(--accent)', padding: '2px 7px', borderRadius: '4px', border: '1px solid rgba(79,124,255,0.3)', fontWeight: '600' }}>
                                          Job ID Match
                                        </span>
                                      )}
                                      {/* Match Percentage Badge */}
                                      <span style={{
                                        background: matchPercentage >= 75 ? 'rgba(46,204,143,0.18)' : matchPercentage >= 50 ? 'rgba(245,200,66,0.18)' : 'rgba(79,124,255,0.18)',
                                        color: matchPercentage >= 75 ? 'var(--green)' : matchPercentage >= 50 ? 'var(--yellow)' : 'var(--accent)',
                                        border: `1px solid ${matchPercentage >= 75 ? 'rgba(46,204,143,0.35)' : matchPercentage >= 50 ? 'rgba(245,200,66,0.35)' : 'rgba(79,124,255,0.35)'}`,
                                        padding: '2px 9px',
                                        borderRadius: '20px',
                                        fontSize: '11.5px',
                                        fontWeight: '800',
                                        fontFamily: 'Space Mono, monospace'
                                      }}>
                                        ⚡ {matchPercentage}% Match
                                      </span>
                                    </div>
                                    <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '4px' }}>
                                      {candidate.email || candidate.phone || 'No contact'} · {candidate.location || 'Location n/a'} · {candidate.experience ? `${candidate.experience} yrs exp` : 'Exp n/a'}
                                    </div>
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ background: 'rgba(46,204,143,0.12)', color: 'var(--green)', border: '1px solid rgba(46,204,143,0.25)', padding: '3px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '700' }}>
                                      {candidate.internal_status || 'Pending'}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); setViewingCandidate(candidate) }}
                                      style={{
                                        background: 'var(--accent)',
                                        color: '#fff',
                                        border: 'none',
                                        borderRadius: '8px',
                                        padding: '6px 14px',
                                        fontSize: '12px',
                                        fontWeight: '700',
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap'
                                      }}
                                    >
                                      View Candidate
                                    </button>
                                  </div>
                                </div>

                                {matchedSkills.length > 0 && (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '10.5px', color: 'var(--text3)', textTransform: 'uppercase', fontWeight: '700' }}>Matched Skills:</span>
                                    {matchedSkills.map(s => (
                                      <span key={s} style={{ background: 'rgba(46,204,143,0.15)', color: 'var(--green)', border: '1px solid rgba(46,204,143,0.3)', borderRadius: '12px', padding: '1px 8px', fontSize: '11px', fontWeight: '600' }}>
                                        {s}
                                      </span>
                                    ))}
                                  </div>
                                )}

                                {/* Clean Inline Candidate Snippet (No floating overlay!) */}
                                {(candidate.resume_text || candidate.notes || ensureArray(candidate.skills).length > 0) && (
                                  <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 12px', marginTop: '2px' }}>
                                    <div style={{ fontSize: '10px', fontWeight: '700', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Candidate Snippet</div>
                                    <div style={{ fontSize: '12px', color: 'var(--text2)', lineHeight: '1.5', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                      {candidate.resume_text || candidate.notes || `Top Skills: ${ensureArray(candidate.skills).join(', ')}`}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Standard Job Overview & Details */
                      <div>
                        {/* Details Grid */}
                        <div className="jobs-details-grid" style={{ marginBottom: '20px' }}>
                          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px' }}>
                            <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Client</div>
                            <div style={{ fontSize: '14px', color: 'var(--text)', fontWeight: '600' }}>{showDetail.client || '-'}</div>
                          </div>
                          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px' }}>
                            <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Location</div>
                            <div style={{ fontSize: '14px', color: 'var(--text)', fontWeight: '600' }}>{showDetail.location || '-'}</div>
                          </div>
                          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px' }}>
                            <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Type</div>
                            <div style={{ fontSize: '14px', color: 'var(--text)', fontWeight: '600' }}>{showDetail.type || '-'}</div>
                          </div>
                          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px' }}>
                            <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Rate</div>
                            <div style={{ fontSize: '14px', color: 'var(--green)', fontWeight: '600', fontFamily: "'Space Mono',monospace" }}>{showDetail.rate || '-'}</div>
                          </div>
                          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px' }}>
                            <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Priority</div>
                            <div style={{ fontSize: '14px', color: 'var(--text)', fontWeight: '600' }}>{showDetail.priority || '-'}</div>
                          </div>
                          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px' }}>
                            <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>FE Name</div>
                            <div style={{ fontSize: '14px', color: 'var(--text)', fontWeight: '600' }}>{showDetail.fe || '-'}</div>
                          </div>
                        </div>

                        {/* Skills */}
                        {(showDetail.skills || []).length > 0 && (
                          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
                            <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>Skills Required</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                              {showDetail.skills.map(s => <span key={s} style={{ background: 'rgba(79,124,255,0.12)', color: 'var(--accent)', border: '1px solid rgba(79,124,255,0.25)', borderRadius: '20px', padding: '3px 10px', fontSize: '12px', fontWeight: '600' }}>{s}</span>)}
                            </div>
                          </div>
                        )}

                        {/* Description */}
                        {showDetail.description && (
                          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
                            <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>Description</div>
                            <p style={{ fontSize: '13px', color: 'var(--text2)', lineHeight: '1.7', whiteSpace: 'pre-wrap' }}>{showDetail.description}</p>
                          </div>
                        )}

                        {/* Matched Candidates Summary Card */}
                        <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px', marginBottom: '20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                            <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span>🎯 Matched Candidates</span>
                              <span style={{ background: 'var(--surface3)', color: 'var(--text)', padding: '2px 8px', borderRadius: '12px', fontSize: '11px' }}>{matches.length}</span>
                            </div>
                            {matches.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setShowMatchedOnly(true)}
                                style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '12px', fontWeight: '700', cursor: 'pointer' }}
                              >
                                View All ({matches.length}) →
                              </button>
                            )}
                          </div>
                          {matches.length === 0 ? (
                            <div style={{ fontSize: '12.5px', color: 'var(--text3)', fontStyle: 'italic', background: 'var(--surface)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                              No candidate profiles currently match this job's required skills.
                            </div>
                          ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                              {matches.slice(0, 3).map(({ candidate, matchedSkills, matchPercentage, matchByJobId }) => (
                                <div key={candidate.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                  <div>
                                    <strong style={{ fontSize: '13.5px', color: 'var(--text)' }}>{candidate.first_name} {candidate.last_name}</strong>
                                    <span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--accent)', fontWeight: '700', fontFamily: 'Space Mono, monospace' }}>⚡ {matchPercentage}% Match</span>
                                  </div>
                                  <button onClick={() => setViewingCandidate(candidate)} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', fontWeight: '700', cursor: 'pointer' }}>View</button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Dates */}
                        <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px' }}>
                          <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Open Date</div>
                          <div style={{ fontSize: '14px', color: 'var(--text)', fontFamily: "'Space Mono',monospace" }}>{showDetail.open_date || '-'}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )
            })()}

            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => { const job = showDetail; setShowDetail(null); setShowMatchedOnly(false); openEdit(job) }} style={{ ...btnGhost, flex: 1 }}>Edit Job</button>
              <button onClick={() => { setShowDetail(null); setShowMatchedOnly(false); setDeleteId(showDetail.id) }} style={{ ...btnPrimary, background: 'var(--red)' }}>Delete Job</button>
            </div>
          </div>
        </div>
      )}

      {/* Viewing Candidate Detail Overlay */}
      {viewingCandidate && (
        <div style={overlayStyle} onClick={e => e.target === e.currentTarget && setViewingCandidate(null)}>
          <div style={{ ...modalStyle, maxWidth: '780px' }}>
            <div style={modalHeader}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text)' }}>{viewingCandidate.first_name} {viewingCandidate.last_name}</div>
                <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>{viewingCandidate.job_title || 'Candidate Profile'} · <span style={{ color: 'var(--accent)', fontFamily: 'Space Mono, monospace' }}>{viewingCandidate.job_id || 'ID n/a'}</span></div>
              </div>
              <button onClick={() => setViewingCandidate(null)} style={closeBtn}>x</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: '24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '16px' }}>
                <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ fontSize: '10.5px', color: 'var(--text3)', textTransform: 'uppercase' }}>Email</div>
                  <div style={{ fontSize: '13px', color: 'var(--text)', fontWeight: '600' }}>{viewingCandidate.email || '-'}</div>
                </div>
                <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ fontSize: '10.5px', color: 'var(--text3)', textTransform: 'uppercase' }}>Phone</div>
                  <div style={{ fontSize: '13px', color: 'var(--text)', fontWeight: '600' }}>{viewingCandidate.phone || '-'}</div>
                </div>
                <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ fontSize: '10.5px', color: 'var(--text3)', textTransform: 'uppercase' }}>Location</div>
                  <div style={{ fontSize: '13px', color: 'var(--text)', fontWeight: '600' }}>{viewingCandidate.location || '-'}</div>
                </div>
                <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ fontSize: '10.5px', color: 'var(--text3)', textTransform: 'uppercase' }}>Work Auth / Experience</div>
                  <div style={{ fontSize: '13px', color: 'var(--text)', fontWeight: '600' }}>{viewingCandidate.work_auth || '-'} ({viewingCandidate.experience ? `${viewingCandidate.experience} yrs` : 'Exp n/a'})</div>
                </div>
              </div>

              {/* Skills */}
              <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
                <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>Skills</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {ensureArray(viewingCandidate.skills).map(s => (
                    <span key={s} style={{ background: 'rgba(79,124,255,0.12)', color: 'var(--accent)', border: '1px solid rgba(79,124,255,0.25)', borderRadius: '20px', padding: '3px 10px', fontSize: '12px', fontWeight: '600' }}>{s}</span>
                  ))}
                  {!ensureArray(viewingCandidate.skills).length && <span style={{ color: 'var(--text3)', fontSize: '13px' }}>No skills listed</span>}
                </div>
              </div>

              {viewingCandidate.resume_text && (
                <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>Resume Text</div>
                  <pre style={{ fontSize: '12.5px', color: 'var(--text2)', lineHeight: '1.6', whiteSpace: 'pre-wrap', fontFamily: 'inherit', maxHeight: '200px', overflowY: 'auto' }}>{viewingCandidate.resume_text}</pre>
                </div>
              )}
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setViewingCandidate(null)} style={btnPrimary}>Close</button>
            </div>
          </div>
        </div>
      )}

      {deleteId && (
        <div style={overlayStyle} onClick={e => e.target === e.currentTarget && setDeleteId(null)}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '32px', maxWidth: '400px', width: '90%', textAlign: 'center' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}></div>
            <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text)', marginBottom: '8px' }}>Delete Job?</div>
            <div style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '24px' }}>This cannot be undone.</div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button onClick={() => setDeleteId(null)} style={btnGhost}>Cancel</button>
              <button onClick={handleDelete} style={{ ...btnPrimary, background: 'var(--red)' }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={toastStyle(toast.type)}>{toast.msg}</div>}
    </div>
  )
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text2)', marginBottom: '6px' }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle = { width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 12px', color: 'var(--text)', fontSize: '13px', outline: 'none', fontFamily: 'inherit' }
const btnPrimary = { background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }
const btnGhost = { background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }
const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }
const modalStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', width: '90%', maxWidth: '680px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }
const modalHeader = { padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }
const closeBtn = { background: 'none', border: 'none', color: 'var(--text3)', fontSize: '18px', cursor: 'pointer' }
const emptyState = { textAlign: 'center', padding: '60px', color: 'var(--text3)' }
const toastStyle = (type) => ({ position: 'fixed', bottom: '24px', right: '24px', background: type === 'error' ? 'var(--red)' : 'var(--green)', color: '#fff', padding: '12px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: '600', zIndex: 9999 })

