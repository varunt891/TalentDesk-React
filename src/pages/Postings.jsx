import { useState, useEffect } from 'react'
import { db } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import * as XLSX from 'xlsx'

const PORTALS = ['Indeed','Dice','LinkedIn','ZipRecruiter','Monster','CareerBuilder','Glassdoor','SimplyHired','Ladders','Recruit.net','JobsInTheUS','USAJobs','Handshake','AngelList','Stack Overflow']

const emptyForm = {
  portals: [], date: new Date().toISOString().slice(0,10),
  job_id: '', job_title: '', location: '', manager: '', recruiter: '', link: '', notes: ''
}

export default function Postings() {
  const { user, profile } = useAuth()
  const [postings, setPostings] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [search, setSearch] = useState('')
  const [portalFilter, setPortalFilter] = useState('')

  useEffect(() => { if (user) fetchPostings() }, [user])

  const fetchPostings = async () => {
    setLoading(true)
    const { data } = await db.from('postings').select('*').order('date', { ascending: false })
    setPostings(data || [])
    setLoading(false)
  }

  const showToast = (msg, type = 'success') => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000) }

  const filtered = postings.filter(p => {
    const q = search.toLowerCase()
    const matchSearch = !q || `${p.portal} ${p.job_title} ${p.job_id} ${p.location}`.toLowerCase().includes(q)
    const matchPortal = !portalFilter || p.portal === portalFilter
    return matchSearch && matchPortal
  })

  // Group by date
  const grouped = filtered.reduce((acc, p) => {
    const date = p.date || 'Unknown'
    if (!acc[date]) acc[date] = []
    acc[date].push(p)
    return acc
  }, {})
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  const handleSave = async () => {
    if (!form.job_title || form.portals.length === 0) return showToast('Job title and at least one portal required', 'error')
    setSaving(true)
    const rows = form.portals.map(portal => ({
      portal, date: form.date || null, job_id: form.job_id,
      job_title: form.job_title, location: form.location,
      manager: form.manager, recruiter: form.recruiter,
      link: form.link, notes: form.notes,
      user_id: user.id, org_id: profile?.org_id
    }))
    const { error } = await db.from('postings').insert(rows)
    if (error) showToast(error.message, 'error')
    else { showToast(`Posted to ${form.portals.length} portals!`); fetchPostings(); setShowModal(false); setForm(emptyForm) }
    setSaving(false)
  }

  const deletePosting = async (id) => {
    await db.from('postings').delete().eq('id', id)
    fetchPostings(); showToast('Deleted!', 'error')
  }

  const togglePortal = (portal) => {
    setForm(f => ({
      ...f,
      portals: f.portals.includes(portal) ? f.portals.filter(p => p !== portal) : [...f.portals, portal]
    }))
  }

  const inp = (field) => ({ value: form[field], onChange: e => setForm(f => ({ ...f, [field]: e.target.value })), style: inputStyle })

  const exportCSV = () => {
    const headers = ['Date','Portal','Job ID','Job Title','Location','Manager','Recruiter','Link','Notes']
    const rows = filtered.map(p => [p.date,p.portal,p.job_id,p.job_title,p.location,p.manager,p.recruiter,p.link,p.notes])
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Postings')
    XLSX.writeFile(wb, `postings_${new Date().toISOString().slice(0,10)}.xlsx`)
    showToast('Excel exported!')
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={topbarStyle}>
        <div style={{ fontSize: '17px', fontWeight: '700', color: 'var(--text)', flex: 1 }}>
          Job Postings <span style={{ color: 'var(--text3)', fontWeight: '400', fontSize: '13px' }}>{postings.length} total</span>
        </div>
        <div style={searchBox}>
          <span>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search postings..." style={searchInp} />
        </div>
        <button onClick={exportCSV} style={btnGhost}>⬇ Export Excel</button>
        <button onClick={() => { setForm(emptyForm); setShowModal(true) }} style={btnPrimary}>+ Log Posting</button>
      </div>

      <div style={{ padding: '12px 24px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={portalFilter} onChange={e => setPortalFilter(e.target.value)} style={selectStyle}>
          <option value="">All Portals</option>
          {PORTALS.map(p => <option key={p}>{p}</option>)}
        </select>
        {portalFilter && <button onClick={() => setPortalFilter('')} style={{ ...btnGhost, padding: '5px 10px', fontSize: '12px' }}>✕ Clear</button>}
        <span style={{ marginLeft: 'auto', fontSize: '12px', color: 'var(--text3)', fontFamily: "'Space Mono',monospace" }}>{filtered.length} shown</span>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        {loading ? <div style={{ color: 'var(--text3)', textAlign: 'center', padding: '60px' }}>Loading...</div> :
         filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📡</div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text2)', marginBottom: '8px' }}>No postings yet</div>
            <button onClick={() => setShowModal(true)} style={btnPrimary}>+ Log Posting</button>
          </div>
        ) : sortedDates.map(date => (
          <div key={date} style={{ marginBottom: '24px' }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--text3)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span>📅 {date}</span>
              <span style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '20px', padding: '2px 8px', fontSize: '11px', color: 'var(--text3)', fontFamily: "'Space Mono',monospace" }}>{grouped[date].length} postings</span>
            </div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Portal','Job ID','Job Title','Location','Manager','Recruiter',''].map(h => (
                      <th key={h} style={thStyle}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grouped[date].map(p => (
                    <tr key={p.id} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={tdStyle}>
                        <span style={{ background: 'rgba(79,124,255,0.1)', color: 'var(--accent)', border: '1px solid rgba(79,124,255,0.2)', borderRadius: '6px', padding: '3px 10px', fontSize: '12px', fontWeight: '600' }}>{p.portal}</span>
                      </td>
                      <td style={{ ...tdStyle, fontFamily: "'Space Mono',monospace", fontSize: '11px', color: 'var(--accent)' }}>{p.job_id}</td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: '600', color: 'var(--text)', fontSize: '13px' }}>{p.job_title}</div>
                        {p.link && <a href={p.link} target="_blank" rel="noreferrer" style={{ fontSize: '10px', color: 'var(--accent)', textDecoration: 'none' }}>🔗 View posting</a>}
                      </td>
                      <td style={tdStyle}>{p.location}</td>
                      <td style={tdStyle}>{p.manager}</td>
                      <td style={tdStyle}>{p.recruiter}</td>
                      <td style={tdStyle}>
                        <button onClick={() => deletePosting(p.id)} style={{ background: 'rgba(255,77,106,0.1)', border: '1px solid rgba(255,77,106,0.3)', borderRadius: '6px', padding: '4px 10px', fontSize: '12px', color: 'var(--red)', cursor: 'pointer', fontFamily: 'inherit' }}>🗑</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {showModal && (
        <div style={overlayStyle} onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div style={modalStyle}>
            <div style={modalHeader}>
              <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text)' }}>Log Job Posting</div>
              <button onClick={() => setShowModal(false)} style={closeBtn}>✕</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: '20px 24px' }}>
              <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' }}>📡 Select Portals</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: '8px', marginBottom: '20px' }}>
                {PORTALS.map(portal => (
                  <label key={portal} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: form.portals.includes(portal) ? 'rgba(79,124,255,0.12)' : 'var(--surface2)', border: `1px solid ${form.portals.includes(portal) ? 'var(--accent)' : 'var(--border)'}`, borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: form.portals.includes(portal) ? 'var(--accent)' : 'var(--text2)', transition: 'all 0.15s' }}>
                    <input type="checkbox" checked={form.portals.includes(portal)} onChange={() => togglePortal(portal)} style={{ accentColor: 'var(--accent)' }} />
                    {portal}
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                <button onClick={() => setForm(f => ({ ...f, portals: PORTALS }))} style={{ ...btnGhost, padding: '5px 12px', fontSize: '12px' }}>☑ Select All</button>
                <button onClick={() => setForm(f => ({ ...f, portals: [] }))} style={{ ...btnGhost, padding: '5px 12px', fontSize: '12px' }}>✕ Clear</button>
                <span style={{ fontSize: '12px', color: 'var(--text3)', alignSelf: 'center' }}>{form.portals.length} selected</span>
              </div>

              <div style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>📋 Job Info</div>
              <div style={grid2}>
                <Field label="Date *"><input {...inp('date')} type="date" /></Field>
                <Field label="Job ID"><input {...inp('job_id')} placeholder="JOB-001" /></Field>
                <Field label="Job Title *"><input {...inp('job_title')} placeholder="Java Developer" /></Field>
                <Field label="Location"><input {...inp('location')} placeholder="Austin, TX / Remote" /></Field>
                <Field label="Manager"><input {...inp('manager')} placeholder="Mike R." /></Field>
                <Field label="Recruiter"><input {...inp('recruiter')} placeholder="Your name" /></Field>
              </div>
              <Field label="Job Link">
                <input {...inp('link')} type="url" placeholder="https://indeed.com/job/..." />
              </Field>
              <Field label="Notes">
                <textarea {...inp('notes')} style={{ ...inputStyle, minHeight: '60px', resize: 'vertical' }} />
              </Field>
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: 'var(--text3)' }}>{form.portals.length} portals × 1 job = {form.portals.length} postings</span>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setShowModal(false)} style={btnGhost}>Cancel</button>
                <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}>{saving ? 'Saving...' : '💾 Save Postings'}</button>
              </div>
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
const topbarStyle = { height: '58px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 24px', gap: '12px', flexShrink: 0 }
const searchBox = { display: 'flex', alignItems: 'center', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0 12px', gap: '8px', height: '36px', width: '220px' }
const searchInp = { background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: '13px', width: '100%', fontFamily: 'inherit' }
const btnPrimary = { background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }
const btnGhost = { background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '8px 16px', fontSize: '13px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }
const selectStyle = { background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '8px', padding: '7px 12px', fontSize: '12.5px', fontFamily: 'inherit', cursor: 'pointer', outline: 'none' }
const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }
const modalStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', width: '90%', maxWidth: '760px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }
const modalHeader = { padding: '20px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }
const closeBtn = { background: 'none', border: 'none', color: 'var(--text3)', fontSize: '18px', cursor: 'pointer' }
const thStyle = { textAlign: 'left', fontSize: '10.5px', fontWeight: '700', letterSpacing: '0.8px', textTransform: 'uppercase', color: 'var(--text3)', padding: '10px 14px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }
const tdStyle = { padding: '11px 14px', fontSize: '13px', color: 'var(--text2)', borderBottom: '1px solid rgba(44,49,72,0.5)', whiteSpace: 'nowrap', verticalAlign: 'middle' }
const toastStyle = (type) => ({ position: 'fixed', bottom: '24px', right: '24px', background: type === 'error' ? 'var(--red)' : 'var(--green)', color: '#fff', padding: '12px 20px', borderRadius: '10px', fontSize: '13px', fontWeight: '600', zIndex: 9999 })
