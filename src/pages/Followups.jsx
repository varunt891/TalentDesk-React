import { useState, useEffect, useRef, useMemo } from 'react'
import { db } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { SmartDropdown } from '../components/SmartDropdown'

// Helper Styles & Utilities defined at top to prevent TDZ Hoisting Errors
const emptyForm = { candidate_name: '', date: new Date().toISOString().slice(0,10), type: 'General Check-in', status: 'pending', priority: 'Medium', notes: '', next_action: '' }
const inputStyle = { width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '9px 12px', color: 'var(--text)', fontSize: '13px', outline: 'none', fontFamily: 'inherit' }
const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }
const topbarStyle = { height: '58px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 24px', gap: '16px', flexShrink: 0 }
const btnPrimary = { background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }
const btnGhost = { background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }
const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }
const modalStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', width: '90%', maxWidth: '600px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }
const modalHeader = { padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }
const closeBtn = { background: 'none', border: 'none', color: 'var(--text3)', fontSize: '18px', cursor: 'pointer' }
const toastStyle = (type) => ({ position: 'fixed', bottom: '24px', right: '24px', background: type === 'error' ? 'var(--red)' : 'var(--green)', color: '#fff', padding: '12px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: '600', zIndex: 9999 })

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text2)', marginBottom: '6px' }}>{label}</label>
      {children}
    </div>
  )
}

function SearchableCandidateSelector({ candidates, value, onChange, onSelectCandidate }) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const dropdownRef = useRef(null)
  const searchInputRef = useRef(null)

  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus()
    }
  }, [isOpen])

  // Deduplicate candidate profiles by unique full name or email
  const uniqueCandidates = useMemo(() => {
    const map = new Map()
    let unnamedCounter = 0
    for (const c of (candidates || [])) {
      if (!c) continue
      const fullName = `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.name || c.candidate_name || ''
      const email = (c.email || '').trim().toLowerCase()
      const key = fullName ? fullName.toLowerCase() : (email || `unnamed_${unnamedCounter++}`)
      
      if (!map.has(key)) {
        map.set(key, c)
      }
    }
    return Array.from(map.values())
  }, [candidates])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return uniqueCandidates
    return uniqueCandidates.filter(c => {
      const name = `${c.first_name || ''} ${c.last_name || ''}`.toLowerCase() + ` ${c.name || ''} ${c.candidate_name || ''}`
      const email = (c.email || '').toLowerCase()
      const job = (c.job_title || c.position || c.job || '').toLowerCase()
      const phone = (c.phone || c.mobile || '').toLowerCase()
      return name.includes(q) || email.includes(q) || job.includes(q) || phone.includes(q)
    })
  }, [uniqueCandidates, search])

  return (
    <div ref={dropdownRef} style={{ position: 'relative', width: '100%' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          overflow: 'hidden',
          transition: 'all 0.15s ease'
        }}
      >
        <input
          type="text"
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Type or pick candidate..."
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            padding: '9px 12px',
            color: 'var(--text)',
            fontSize: '13px',
            outline: 'none',
            fontFamily: 'inherit',
            minWidth: 0
          }}
          required
        />
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          title="Select candidate from workspace list"
          style={{
            background: isOpen ? 'var(--accent)' : 'transparent',
            color: isOpen ? '#ffffff' : 'var(--accent)',
            border: 'none',
            borderLeft: '1px solid var(--border)',
            padding: '0 12px',
            height: '38px',
            fontSize: '12px',
            fontWeight: '600',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            transition: 'all 0.15s ease',
            flexShrink: 0
          }}
        >
          <span>👤 Pick</span>
          <span style={{ fontSize: '9px', opacity: 0.85 }}>▼</span>
        </button>
      </div>

      <SmartDropdown isOpen={isOpen} onClose={() => setIsOpen(false)} width={320}>
        <div
          style={{
            width: '100%',
            padding: '10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            maxHeight: '300px'
          }}
        >
          <input
            ref={searchInputRef}
            type="text"
            placeholder="🔍 Search candidate name, email, job title..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              width: '100%',
              background: 'var(--surface2)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '8px 10px',
              color: 'var(--text)',
              fontSize: '12px',
              outline: 'none',
              fontFamily: 'inherit',
              boxSizing: 'border-box'
            }}
          />

          <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '14px', textAlign: 'center', color: 'var(--text3)', fontSize: '12px' }}>
                {search ? `No candidate matching "${search}"` : 'No candidates available'}
              </div>
            ) : (
              filtered.map((c, idx) => {
                const fullName = `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.name || c.candidate_name || c.email || `Candidate #${c.id || idx + 1}`
                const candidateJob = c.job_title || c.position || c.job || ''
                const candidatePhone = c.phone || c.mobile || ''

                return (
                  <div
                    key={c.id || idx}
                    onClick={() => {
                      onSelectCandidate(c)
                      setIsOpen(false)
                      setSearch('')
                    }}
                    style={{
                      padding: '9px 12px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      background: 'var(--surface2)',
                      border: '1px solid var(--border)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      transition: 'all 0.12s ease'
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = 'var(--accent)'
                      e.currentTarget.style.background = 'rgba(79, 124, 255, 0.1)'
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'var(--border)'
                      e.currentTarget.style.background = 'var(--surface2)'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap' }}>
                      <strong style={{ color: 'var(--text)', fontSize: '13px' }}>{fullName}</strong>
                      {candidateJob && (
                        <span style={{ background: 'rgba(79, 124, 255, 0.15)', color: 'var(--accent)', border: '1px solid rgba(79, 124, 255, 0.3)', padding: '2px 8px', borderRadius: '12px', fontSize: '10.5px', fontWeight: '700', whiteSpace: 'nowrap' }}>
                          💼 {candidateJob}
                        </span>
                      )}
                    </div>
                    {(c.email || candidatePhone) && (
                      <div style={{ fontSize: '11px', color: 'var(--text3)', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        {c.email && <span>✉️ {c.email}</span>}
                        {candidatePhone && <span>📱 {candidatePhone}</span>}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </SmartDropdown>
    </div>
  )
}

export default function Followups() {
  const { user } = useAuth()
  const [followups, setFollowups] = useState([])
  const [candidates, setCandidates] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [filter, setFilter] = useState('')

  useEffect(() => { 
    if (user) {
      fetchFollowups()
      fetchCandidates()
    }
  }, [user])

  const fetchFollowups = async () => {
    setLoading(true)
    const { data } = await db.from('followups').select('*').order('date', { ascending: true })
    setFollowups(data || [])
    setLoading(false)
  }

  const fetchCandidates = async () => {
    try {
      const { data, error } = await db.from('candidates').select('*')
      if (!error && data) {
        setCandidates(data)
      }
    } catch (err) {
      console.error('Error fetching candidates for selector:', err)
    }
  }

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }
  const todayStr = new Date().toISOString().slice(0, 10)

  const filtered = followups.filter(f => !filter || f.status === filter)

  const openAdd = () => { setForm(emptyForm); setEditingId(null); setShowModal(true) }
  const openEdit = (f) => {
    setForm({ candidate_name: f.candidate_name||'', date: f.date||'', type: f.type||'General Check-in', status: f.status||'pending', priority: f.priority||'Medium', notes: f.notes||'', next_action: f.next_action||'' })
    setEditingId(f.id); setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.candidate_name) return showToast('Candidate name required', 'error')
    setSaving(true)
    const payload = { ...form, date: form.date || null, user_id: user?.id }
    if (editingId) {
      const { error } = await db.from('followups').update(payload).eq('id', editingId)
      if (error) showToast(error.message, 'error')
      else { showToast('Updated!'); fetchFollowups(); setShowModal(false) }
    } else {
      const { error } = await db.from('followups').insert([payload])
      if (error) showToast(error.message, 'error')
      else { showToast('Follow-up added!'); fetchFollowups(); setShowModal(false) }
    }
    setSaving(false)
  }

  const markDone = async (id) => {
    await db.from('followups').update({ status: 'done' }).eq('id', id)
    fetchFollowups(); showToast('Marked done!')
  }

  const deleteFollowup = async (id) => {
    await db.from('followups').delete().eq('id', id)
    fetchFollowups(); showToast('Deleted!', 'error')
  }

  const inp = (field) => ({ value: form[field], onChange: e => setForm(f => ({ ...f, [field]: e.target.value })), style: inputStyle })
  const PRIORITY_COLORS = { High: 'var(--red)', Medium: 'var(--yellow)', Low: 'var(--text3)' }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={topbarStyle}>
        <div style={{ fontSize: '17px', fontWeight: '700', color: 'var(--text)', flex: 1 }}>Follow-ups <span style={{ color: 'var(--text3)', fontWeight: '400', fontSize: '13px' }}>{followups.filter(f => f.status !== 'done').length} pending</span></div>
        <button onClick={openAdd} style={btnPrimary}>+ Add Follow-up</button>
      </div>

      <div style={{ padding: '12px 24px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', gap: '8px' }}>
        {['','pending','contacted','done'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ ...btnGhost, padding: '5px 14px', fontSize: '12px', background: filter === f ? 'rgba(79,124,255,0.12)' : 'var(--surface2)', color: filter === f ? 'var(--accent)' : 'var(--text2)', borderColor: filter === f ? 'var(--accent)' : 'var(--border)', textTransform: 'capitalize' }}>{f || 'All'}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        {loading ? <div style={{ color: 'var(--text3)', textAlign: 'center', padding: '60px' }}>Loading...</div> :
         filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔔</div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text2)', marginBottom: '8px' }}>No follow-ups</div>
            <button onClick={openAdd} style={btnPrimary}>+ Add Follow-up</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filtered.map(f => {
              const isOverdue = f.date && f.date < todayStr && f.status !== 'done'
              return (
                <div key={f.id} style={{ background: 'var(--surface)', border: `1px solid ${isOverdue ? 'rgba(255,77,106,0.3)' : 'var(--border)'}`, borderRadius: '10px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px', opacity: f.status === 'done' ? 0.6 : 1 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {f.candidate_name}
                      {isOverdue && <span style={{ background: 'rgba(255,77,106,0.15)', color: 'var(--red)', border: '1px solid rgba(255,77,106,0.3)', borderRadius: '20px', padding: '2px 8px', fontSize: '10px', fontWeight: '700' }}>OVERDUE</span>}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text3)', display: 'flex', gap: '12px', marginBottom: '4px' }}>
                      <span>📅 {f.date}</span>
                      <span>📋 {f.type}</span>
                      <span style={{ color: PRIORITY_COLORS[f.priority], fontWeight: '700' }}>{f.priority}</span>
                    </div>
                    {f.notes && <div style={{ fontSize: '12px', color: 'var(--text2)', fontStyle: 'italic' }}>{f.notes}</div>}
                    {f.next_action && <div style={{ fontSize: '12px', color: 'var(--accent)', marginTop: '4px' }}>→ {f.next_action}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                    <span style={{ background: f.status === 'done' ? 'rgba(46,204,143,0.1)' : 'rgba(79,124,255,0.1)', color: f.status === 'done' ? 'var(--green)' : 'var(--accent)', border: `1px solid ${f.status === 'done' ? 'rgba(46,204,143,0.3)' : 'rgba(79,124,255,0.3)'}`, borderRadius: '20px', padding: '3px 10px', fontSize: '11px', fontWeight: '700', textTransform: 'capitalize' }}>{f.status}</span>
                    {f.status !== 'done' && <button onClick={() => markDone(f.id)} style={{ background: 'rgba(46,204,143,0.1)', border: '1px solid rgba(46,204,143,0.3)', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', color: 'var(--green)', cursor: 'pointer', fontFamily: 'inherit' }}>✅</button>}
                    <button onClick={() => openEdit(f)} style={{ ...btnGhost, padding: '6px 12px', fontSize: '12px' }}>✏️</button>
                    <button onClick={() => deleteFollowup(f.id)} style={{ background: 'rgba(255,77,106,0.1)', border: '1px solid rgba(255,77,106,0.3)', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', color: 'var(--red)', cursor: 'pointer', fontFamily: 'inherit' }}>🗑</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showModal && (
        <div style={overlayStyle} onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div style={modalStyle}>
            <div style={modalHeader}>
              <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text)' }}>{editingId ? 'Edit Follow-up' : 'Add Follow-up'}</div>
              <button onClick={() => setShowModal(false)} style={closeBtn}>✕</button>
            </div>
            <div style={{ padding: '20px 24px', overflowY: 'auto' }}>
              <div style={grid2}>
                <Field label="Candidate Name *">
                  <SearchableCandidateSelector
                    candidates={candidates}
                    value={form.candidate_name}
                    onChange={val => setForm(f => ({ ...f, candidate_name: val }))}
                    onSelectCandidate={c => {
                      const fullName = `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.name || c.candidate_name || ''
                      setForm(f => ({
                        ...f,
                        candidate_name: fullName
                      }))
                    }}
                  />
                </Field>
                <Field label="Date"><input {...inp('date')} type="date" /></Field>
                <Field label="Type">
                  <select {...inp('type')} style={inputStyle}>
                    {['General Check-in','Interview Follow-up','Offer Follow-up','Document Collection','Other'].map(o => <option key={o}>{o}</option>)}
                  </select>
                </Field>
                <Field label="Status">
                  <select {...inp('status')} style={inputStyle}>
                    {['pending','contacted','waiting','done'].map(o => <option key={o}>{o}</option>)}
                  </select>
                </Field>
                <Field label="Priority">
                  <select {...inp('priority')} style={inputStyle}>
                    {['High','Medium','Low'].map(o => <option key={o}>{o}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Notes"><textarea {...inp('notes')} style={{ ...inputStyle, minHeight: '70px', resize: 'vertical' }} /></Field>
              <Field label="Next Action"><input {...inp('next_action')} placeholder="What's the next step?" /></Field>
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setShowModal(false)} style={btnGhost}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div style={toastStyle(toast.type)}>{toast.msg}</div>}
    </div>
  )
}
