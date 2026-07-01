import { useState, useEffect } from 'react'
import { db } from '../lib/api'
import { useAuth } from '../context/AuthContext'

const emptyForm = {
  job_id: '', title: '', client: '', location: '', type: 'Contract',
  status: 'Open', rate: '', open_date: new Date().toISOString().slice(0,10),
  priority: 'Medium', fe: '', skills: [], description: ''
}

export default function Jobs() {
  const { user } = useAuth()
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

  useEffect(() => { 
    console.log('[Jobs] useEffect triggered, user:', user?.id)
    if (user) fetchJobs() 
  }, [user])

  const fetchJobs = async () => {
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
  }

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
    setForm({ job_id: j.job_id||'', title: j.title||'', client: j.client||'', location: j.location||'', type: j.type||'Contract', status: j.status||'Open', rate: j.rate||'', open_date: j.open_date||new Date().toISOString().slice(0,10), priority: j.priority||'Medium', fe: j.fe||'', skills: j.skills||[], description: j.description||'' })
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
    { label: 'Open roles', value: jobs.filter(j => j.status === 'Open').length },
    { label: 'On hold', value: jobs.filter(j => j.status === 'On Hold').length },
    { label: 'Filled', value: jobs.filter(j => j.status === 'Filled').length },
    { label: 'Closed', value: jobs.filter(j => j.status === 'Closed').length },
  ]

  return (
    <div className="jobs-page">
      <div className="jobs-topbar">
        <div className="jobs-title-block">
          <p>Role Pipeline</p>
          <h1>Jobs</h1>
          <span>{jobs.length} total roles across clients and internal requisitions</span>
        </div>
        <div className="jobs-toolbar">
          <div className="jobs-search">
            <span>Search</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Title, client, ID, location..." />
          </div>
          <button onClick={openAdd} className="jobs-primary-btn">New Job</button>
        </div>
      </div>

      <div className="jobs-summary">
        {jobStats.map(stat => (
          <div key={stat.label} className="jobs-summary-card">
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
          </div>
        ))}
      </div>

      <div className="jobs-filterbar">
        <div className="jobs-status-tabs">
          {['Open','Filled','On Hold','Closed'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(statusFilter === s ? '' : s)}
              className={statusFilter === s ? 'active' : ''}
              style={statusFilter === s ? { '--job-status-color': STATUS_COLORS[s] } : undefined}
            >
              {s}
            </button>
          ))}
        </div>
        <span>{filtered.length} shown</span>
      </div>

      <div className="jobs-content">
        {loading ? <div style={emptyState}>Loading jobs...</div> :
         filtered.length === 0 ? (
          <div className="jobs-empty">
            <strong>No jobs found</strong>
            <span>{search || statusFilter ? 'Try changing the search or status filter.' : 'Create your first job to start tracking client demand.'}</span>
            {!search && !statusFilter && <button onClick={openAdd} className="jobs-primary-btn">New Job</button>}
          </div>
        ) : (
          <div className="jobs-list">
            <div className="jobs-list-header">
              <span>Role</span>
              <span>Status</span>
              <span>Location</span>
              <span>Type</span>
              <span>Rate</span>
              <span>Owner</span>
              <span>Actions</span>
            </div>
            {filtered.map(j => (
              <article
                key={j.id}
                className="jobs-row"
                onClick={() => setShowDetail(j)}
              >
                <div className="jobs-role">
                  <strong>{j.title || 'Untitled role'}</strong>
                  <span>{j.job_id || 'No Job ID'} - {j.client || 'Client n/a'}</span>
                </div>
                <span className="jobs-status-pill" style={{ '--job-status-color': STATUS_COLORS[j.status] || 'var(--text3)' }}>{j.status || 'Open'}</span>
                <div className="jobs-row-details">
                  <span className="jobs-cell"><span className="jobs-mobile-label">Location: </span>{j.location || 'Location n/a'}</span>
                  <span className="jobs-cell"><span className="jobs-mobile-label">Type: </span>{j.type || 'Type n/a'}</span>
                  <span className="jobs-cell jobs-rate"><span className="jobs-mobile-label">Rate: </span>{j.rate || 'Rate n/a'}</span>
                  <span className="jobs-cell"><span className="jobs-mobile-label">Owner: </span>{j.fe || 'No owner'}</span>
                </div>
                <div className="jobs-row-actions">
                  <button onClick={(e) => { e.stopPropagation(); openEdit(j) }}>Edit</button>
                  <button className="danger" onClick={(e) => { e.stopPropagation(); setDeleteId(j.id) }}>Delete</button>
                </div>
              </article>
            ))}
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
                    {['Contract','Full-time','Contract-to-Hire','Part-time'].map(o => <option key={o}>{o}</option>)}
                  </select>
                </Field>
                <Field label="Status">
                  <select {...inp('status')} style={inputStyle}>
                    {['Open','Filled','On Hold','Closed'].map(o => <option key={o}>{o}</option>)}
                  </select>
                </Field>
                <Field label="Rate"><input {...inp('rate')} placeholder="$80-100/hr" /></Field>
                <Field label="Open Date"><input {...inp('open_date')} type="date" /></Field>
                <Field label="Priority">
                  <select {...inp('priority')} style={inputStyle}>
                    {['High','Medium','Low'].map(o => <option key={o}>{o}</option>)}
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
          <div style={{ ...modalStyle, maxWidth: '700px', maxHeight: '90vh' }}>
            <div style={modalHeader}>
              <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text)' }}>{showDetail.title}</div>
              <button onClick={() => setShowDetail(null)} style={closeBtn}>x</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: '24px' }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <div>
                  <div style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '6px' }}>Job ID</div>
                  <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text)', fontFamily: "'Space Mono',monospace" }}>{showDetail.job_id}</div>
                </div>
                <span style={{ background: `${STATUS_COLORS[showDetail.status]}20`, color: STATUS_COLORS[showDetail.status], border: `1px solid ${STATUS_COLORS[showDetail.status]}40`, padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: '700' }}>{showDetail.status}</span>
              </div>

              {/* Details Grid */}
              <div className="jobs-details-grid">
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

              {/* Dates */}
              <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '14px' }}>
                <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Open Date</div>
                <div style={{ fontSize: '14px', color: 'var(--text)', fontFamily: "'Space Mono',monospace" }}>{showDetail.open_date || '-'}</div>
              </div>
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => openEdit(showDetail)} style={{ ...btnGhost, flex: 1 }}>Edit</button>
              <button onClick={() => { setShowDetail(null); setDeleteId(showDetail.id) }} style={{ ...btnPrimary, background: 'var(--red)' }}>Delete</button>
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
const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }
const btnPrimary = { background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }
const btnGhost = { background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }
const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }
const modalStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', width: '90%', maxWidth: '680px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }
const modalHeader = { padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }
const closeBtn = { background: 'none', border: 'none', color: 'var(--text3)', fontSize: '18px', cursor: 'pointer' }
const emptyState = { textAlign: 'center', padding: '60px', color: 'var(--text3)' }
const toastStyle = (type) => ({ position: 'fixed', bottom: '24px', right: '24px', background: type === 'error' ? 'var(--red)' : 'var(--green)', color: '#fff', padding: '12px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: '600', zIndex: 9999 })

