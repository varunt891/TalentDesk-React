import { useState, useEffect, useRef, useMemo } from 'react'
import { db } from '../lib/api'
import { useAuth } from '../context/AuthContext'

// Helper Styles & Utilities defined at top to prevent TDZ Hoisting Errors
const emptyForm = { candidate_name: '', phone: '', job: '', date: new Date().toISOString().slice(0,10), time: '10:00', timezone: 'EST', interest: 'Warm', notes: '', status: 'pending' }
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
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            minWidth: '320px',
            width: 'max(100%, 340px)',
            maxWidth: '90vw',
            zIndex: 1300,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            boxShadow: '0 16px 40px rgba(0,0,0,0.35)',
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
      )}
    </div>
  )
}

export default function Callbacks() {
  const { user } = useAuth()
  const [callbacks, setCallbacks] = useState([])
  const [candidates, setCandidates] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [filter, setFilter] = useState('all')
  const [showNotification, setShowNotification] = useState(null)

  useEffect(() => { 
    if (user) {
      fetchCallbacks()
      fetchCandidates()
    }
  }, [user])

  const fetchCallbacks = async () => {
    setLoading(true)
    const { data } = await db.from('callbacks').select('*').order('date', { ascending: true })
    setCallbacks(data || [])
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

  const filtered = callbacks.filter(c => filter === 'all' ? true : c.status === filter)

  const openAdd = () => { setForm(emptyForm); setEditingId(null); setShowModal(true) }
  const openEdit = (c) => {
    setForm({ candidate_name: c.candidate_name||'', phone: c.phone||'', job: c.job||'', date: c.date||'', time: c.time||'10:00', timezone: c.timezone||'EST', interest: c.interest||'Warm', notes: c.notes||'', status: c.status||'pending' })
    setEditingId(c.id); setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.candidate_name) return showToast('Name required', 'error')
    if (!form.date) return showToast('Date required', 'error')
    if (!form.time) return showToast('Time required', 'error')
    
    // Validate date format
    const selectedDate = new Date(form.date + 'T00:00:00')
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    if (selectedDate < today && !editingId) {
      return showToast('Callback date cannot be in the past', 'error')
    }
    
    setSaving(true)
    const payload = { ...form, date: form.date || null, user_id: user?.id }
    if (editingId) {
      const { error } = await db.from('callbacks').update(payload).eq('id', editingId)
      if (error) showToast(error.message, 'error')
      else { 
        fetchCallbacks()
        setShowNotification({ ...form, type: 'updated' })
        setShowModal(false)
        setTimeout(() => setShowNotification(null), 5000)
      }
    } else {
      const { error } = await db.from('callbacks').insert([payload])
      if (error) showToast(error.message, 'error')
      else { 
        fetchCallbacks()
        setShowNotification({ ...form, type: 'added' })
        setShowModal(false)
        setTimeout(() => setShowNotification(null), 5000)
      }
    }
    setSaving(false)
  }

  const markDone = async (id) => {
    await db.from('callbacks').update({ status: 'done' }).eq('id', id)
    fetchCallbacks(); showToast('Marked as done!')
  }

  const deleteCallback = async (id) => {
    await db.from('callbacks').delete().eq('id', id)
    fetchCallbacks(); showToast('Deleted!', 'error')
  }

  const inp = (field) => ({ value: form[field], onChange: e => setForm(f => ({ ...f, [field]: e.target.value })), style: inputStyle })

  const INTEREST_COLORS = { Hot: 'var(--red)', Warm: 'var(--yellow)', Cold: 'var(--accent)' }
  const todayStr = new Date().toISOString().slice(0, 10)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={topbarStyle}>
        <div style={{ fontSize: '17px', fontWeight: '700', color: 'var(--text)', flex: 1 }}>Callbacks <span style={{ color: 'var(--text3)', fontWeight: '400', fontSize: '13px' }}>{callbacks.filter(c => c.status === 'pending').length} pending</span></div>
        <button onClick={openAdd} style={btnPrimary}>📞 Schedule Callback</button>
      </div>

      <div style={{ padding: '12px 24px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', gap: '8px' }}>
        {['all','pending','done'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ ...btnGhost, padding: '5px 14px', fontSize: '12px', background: filter === f ? 'rgba(79,124,255,0.12)' : 'var(--surface2)', color: filter === f ? 'var(--accent)' : 'var(--text2)', borderColor: filter === f ? 'var(--accent)' : 'var(--border)', textTransform: 'capitalize' }}>{f}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        {loading ? <div style={{ color: 'var(--text3)', textAlign: 'center', padding: '60px' }}>Loading...</div> :
         filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📞</div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text2)', marginBottom: '8px' }}>No callbacks</div>
            <button onClick={openAdd} style={btnPrimary}>Schedule one</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {filtered.map(c => {
              const isToday = c.date === todayStr
              const isPast = c.date < todayStr && c.status === 'pending'
              return (
                <div key={c.id} style={{ background: 'var(--surface)', border: `1px solid ${isPast ? 'rgba(255,77,106,0.3)' : 'var(--border)'}`, borderRadius: '10px', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: '16px', opacity: c.status === 'done' ? 0.6 : 1 }}>
                  <div style={{ textAlign: 'center', minWidth: '80px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px', flexShrink: 0 }}>
                    <div style={{ fontSize: '10px', color: 'var(--text3)', fontFamily: "'Space Mono',monospace" }}>{c.date}</div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text)', fontFamily: "'Space Mono',monospace", lineHeight: 1.2 }}>{c.time}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text3)' }}>{c.timezone}</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text)', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {c.candidate_name}
                      {isToday && c.status === 'pending' && <span style={{ background: 'rgba(245,200,66,0.15)', color: 'var(--yellow)', border: '1px solid rgba(245,200,66,0.3)', borderRadius: '20px', padding: '2px 8px', fontSize: '10px', fontWeight: '700' }}>TODAY</span>}
                      {isPast && <span style={{ background: 'rgba(255,77,106,0.15)', color: 'var(--red)', border: '1px solid rgba(255,77,106,0.3)', borderRadius: '20px', padding: '2px 8px', fontSize: '10px', fontWeight: '700' }}>OVERDUE</span>}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text3)', display: 'flex', gap: '12px' }}>
                      <span>📱 {c.phone}</span>
                      <span>💼 {c.job}</span>
                      <span style={{ color: INTEREST_COLORS[c.interest], fontWeight: '700' }}>🔥 {c.interest}</span>
                    </div>
                    {c.notes && <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '6px', fontStyle: 'italic' }}>{c.notes}</div>}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    {c.status === 'pending' && <button onClick={() => markDone(c.id)} style={{ background: 'rgba(46,204,143,0.1)', border: '1px solid rgba(46,204,143,0.3)', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', color: 'var(--green)', cursor: 'pointer', fontFamily: 'inherit' }}>✅ Done</button>}
                    <button onClick={() => openEdit(c)} style={{ ...btnGhost, padding: '6px 12px', fontSize: '12px' }}>✏️</button>
                    <button onClick={() => deleteCallback(c.id)} style={{ background: 'rgba(255,77,106,0.1)', border: '1px solid rgba(255,77,106,0.3)', borderRadius: '8px', padding: '6px 12px', fontSize: '12px', color: 'var(--red)', cursor: 'pointer', fontFamily: 'inherit' }}>🗑</button>
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
              <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text)' }}>{editingId ? 'Edit Callback' : 'Schedule Callback'}</div>
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
                      const candidatePhone = c.phone || c.mobile || ''
                      const candidateJob = c.job_title || c.position || c.job || ''
                      setForm(f => ({
                        ...f,
                        candidate_name: fullName,
                        phone: candidatePhone || f.phone,
                        job: candidateJob || f.job
                      }))
                    }}
                  />
                </Field>
                <Field label="Phone"><input {...inp('phone')} placeholder="+1 555 000 0000" /></Field>
                <Field label="Job Title"><input {...inp('job')} placeholder="Java Developer" /></Field>
                <Field label="Interest">
                  <select {...inp('interest')} style={inputStyle}>
                    {['Hot','Warm','Cold'].map(o => <option key={o}>{o}</option>)}
                  </select>
                </Field>
                <Field label="Date"><input {...inp('date')} type="date" /></Field>
                <Field label="Time"><input {...inp('time')} type="time" /></Field>
                <Field label="Timezone">
                  <select {...inp('timezone')} style={inputStyle}>
                    {['EST','CST','MST','PST','IST'].map(o => <option key={o}>{o}</option>)}
                  </select>
                </Field>
                <Field label="Status">
                  <select {...inp('status')} style={inputStyle}>
                    {['pending','done','missed'].map(o => <option key={o}>{o}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Notes">
                <textarea {...inp('notes')} style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }} placeholder="Any notes..." />
              </Field>
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setShowModal(false)} style={btnGhost}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving...' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}

      {showNotification && (
        <div style={overlayStyle} onClick={() => setShowNotification(null)}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '32px', maxWidth: '500px', width: '90%', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px', animation: 'pulse 1s infinite' }}>📞</div>
            <div style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text)', marginBottom: '8px' }}>
              {showNotification.type === 'added' ? 'Callback Scheduled! ✓' : 'Callback Updated! ✓'}
            </div>
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', marginBottom: '16px', textAlign: 'left' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Candidate</div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text)' }}>{showNotification.candidate_name}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Job</div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text)' }}>{showNotification.job || '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Date</div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--text)', fontFamily: "'Space Mono',monospace" }}>{showNotification.date}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Time</div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--green)', fontFamily: "'Space Mono',monospace" }}>{showNotification.time} {showNotification.timezone}</div>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Interest Level</div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: showNotification.interest === 'Hot' ? 'var(--red)' : showNotification.interest === 'Warm' ? 'var(--yellow)' : 'var(--accent)' }}>
                    {showNotification.interest === 'Hot' ? '🔥' : showNotification.interest === 'Warm' ? '🌡️' : '❄️'} {showNotification.interest}
                  </div>
                </div>
              </div>
            </div>
            <button onClick={() => setShowNotification(null)} style={{ ...btnPrimary, width: '100%' }}>Got it!</button>
          </div>
        </div>
      )}

      {toast && <div style={toastStyle(toast.type)}>{toast.msg}</div>}
    </div>
  )
}
