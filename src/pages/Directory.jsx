import { useEffect, useState } from 'react'
import { db } from '../lib/api'
import { useAuth } from '../context/AuthContext'

const DEPARTMENTS = ['Front-End Team', 'Ecare Team', 'Recruiters', 'Managers', 'PMO', 'Onboarding', 'Operations']

const emptyForm = {
  full_name: '',
  email: '',
  phone: '',
  extension: '',
  role: 'recruiter',
  department: 'Front-End Team',
  team: '',
}

export default function Directory() {
  const { user, profile } = useAuth()
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeDepartment, setActiveDepartment] = useState('Front-End Team')
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [toast, setToast] = useState(null)

  const isAdmin = ['admin', 'superadmin'].includes(profile?.role)

  useEffect(() => {
    if (!user) return
    fetchMembers()
  }, [user])

  const fetchMembers = async () => {
    setLoading(true)
    const { data } = await db
      .from('profiles')
      .select('*')
      .eq('is_active', true)
      .order('full_name')
    setMembers(data || [])
    setLoading(false)
  }

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const searchFiltered = members.filter(member => {
    const q = search.toLowerCase()
    const department = normalizeDepartment(member)
    const text = `${member.full_name} ${member.email} ${member.phone} ${member.extension} ${member.team} ${department}`.toLowerCase()
    return !q || text.includes(q)
  })

  const admins = searchFiltered.filter(member => ['admin', 'superadmin'].includes(member.role))
  const staff = searchFiltered.filter(member => !['admin', 'superadmin'].includes(member.role))

  const visibleStaff = staff.filter(member => normalizeDepartment(member) === activeDepartment)
  const departmentCounts = DEPARTMENTS.map(department => ({
    department,
    count: staff.filter(member => normalizeDepartment(member) === department).length,
  }))

  const openAdd = (department = activeDepartment) => {
    setForm({ ...emptyForm, department: department || 'Front-End Team' })
    setEditingId(null)
    setShowAdd(true)
  }

  const openEdit = (member) => {
    setForm({
      full_name: member.full_name || '',
      email: member.email || '',
      phone: member.phone || '',
      extension: member.extension || '',
      role: member.role || 'recruiter',
      department: normalizeDepartment(member),
      team: member.team || '',
    })
    setEditingId(member.id)
    setShowAdd(true)
  }

  const saveMember = async () => {
    if (!form.full_name.trim() || !form.email.trim()) {
      showToast('Name and email are required', 'error')
      return
    }

    const payload = {
      org_id: profile?.org_id,
      full_name: form.full_name.trim(),
      email: form.email.trim().toLowerCase(),
      phone: form.phone.trim() || null,
      extension: form.extension.trim() || null,
      role: form.role,
      department: form.department,
      team: form.team.trim() || null,
      is_active: true,
    }

    const { error } = editingId
      ? await db.from('profiles').update(payload).eq('id', editingId)
      : await db.from('profiles').insert(payload)

    if (error) {
      showToast(error.message, 'error')
      return
    }

    setForm(emptyForm)
    setEditingId(null)
    setShowAdd(false)
    showToast(editingId ? 'Directory member updated' : 'Directory member added')
    fetchMembers()
  }

  const closeModal = () => {
    setShowAdd(false)
    setEditingId(null)
    setForm(emptyForm)
  }

  return (
    <div className="directory-page">
      <header className="directory-topbar">
        <div>
          <h1>Team Directory</h1>
        </div>
        <div className="directory-actions">
          <div className="directory-search">
            <span>Search</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email, extension..." />
          </div>
          <div className="directory-member-count">{staff.length} members</div>
          {isAdmin && <button onClick={() => openAdd()} type="button">Add member</button>}
        </div>
      </header>

      <div className="directory-tabs">
        {departmentCounts.map(item => (
          <button
            key={item.department}
            className={activeDepartment === item.department ? 'active' : ''}
            onClick={() => setActiveDepartment(item.department)}
            type="button"
          >
            <span>{item.department}</span>
            <strong>{item.count}</strong>
          </button>
        ))}
        <button
          className={activeDepartment === 'Admins' ? 'admin-tab active' : 'admin-tab'}
          onClick={() => setActiveDepartment('Admins')}
          type="button"
        >
          <span>Admins</span>
          <strong>{admins.length}</strong>
        </button>
      </div>

      <main className="directory-content">
        {loading ? (
          <EmptyState title="Loading directory" body="Pulling company contacts." />
        ) : (
          <>
            {activeDepartment !== 'Admins' ? (
              <section className="directory-section">
                <div className="directory-section-head">
                  <div>
                    <h2>{activeDepartment}</h2>
                    <span>{visibleStaff.length} contacts</span>
                  </div>
                  {isAdmin && <button onClick={() => openAdd(activeDepartment)} type="button">Add to {activeDepartment}</button>}
                </div>
                {visibleStaff.length === 0 ? (
                  <EmptyState title="No contacts in this department" body="Add a member to this department from the button above." />
                ) : (
                  <div className="directory-grid">
                    {visibleStaff.map((member, index) => <MemberCard key={member.id} member={member} index={index} canEdit={isAdmin} onEdit={openEdit} showToast={showToast} />)}
                  </div>
                )}
              </section>
            ) : (
              <section className="directory-section admins">
                <div className="directory-section-head">
                  <div>
                    <h2>Admins and Superadmins</h2>
                    <span>{admins.length} users</span>
                  </div>
                </div>
                {admins.length === 0 ? <EmptyState title="No admins visible" body="Admin users are separated from staff contacts." compact /> : (
                  <div className="directory-grid">
                    {admins.map((member, index) => <MemberCard key={member.id} member={member} index={index} admin canEdit={isAdmin} onEdit={openEdit} showToast={showToast} />)}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>

      {showAdd && (
        <div className="directory-modal-backdrop" onClick={e => e.target === e.currentTarget && closeModal()}>
          <div className="directory-modal">
            <div className="directory-modal-head">
              <h2>{editingId ? 'Edit directory member' : 'Add directory member'}</h2>
              <button onClick={closeModal} type="button">x</button>
            </div>
            <div className="directory-form-grid">
              <Field label="Full name"><input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} /></Field>
              <Field label="Email"><input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} type="email" /></Field>
              <Field label="Phone number"><input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></Field>
              <Field label="Extension"><input value={form.extension} onChange={e => setForm(f => ({ ...f, extension: e.target.value }))} /></Field>
              <Field label="Department">
                <select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
                  {DEPARTMENTS.map(department => <option key={department}>{department}</option>)}
                </select>
              </Field>
              <Field label="Role">
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                  {['recruiter', 'manager', 'admin'].map(role => <option key={role}>{role}</option>)}
                </select>
              </Field>
              <Field label="Team"><input value={form.team} onChange={e => setForm(f => ({ ...f, team: e.target.value }))} /></Field>
            </div>
            <div className="directory-modal-actions">
              <button onClick={closeModal} type="button">Cancel</button>
              <button onClick={saveMember} type="button">{editingId ? 'Update member' : 'Save member'}</button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`admin-toast ${toast.type || 'success'}`}>{toast.msg}</div>}
    </div>
  )
}

const avatarGradients = [
  'linear-gradient(135deg, #4f7cff, #7c5cff)',
  'linear-gradient(135deg, #7c5cff, #a47fff)',
  'linear-gradient(135deg, #ff5c87, #ff8c8c)',
  'linear-gradient(135deg, #2ecc8f, #15d1bb)',
  'linear-gradient(135deg, #ff8c42, #ffb342)',
  'linear-gradient(135deg, #f5c842, #ffd666)'
]

const CopyIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#f59e0b' }}>
    <rect width="8" height="4" x="8" y="2" rx="1" ry="1"/>
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
  </svg>
)

const EditIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9"/>
    <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
  </svg>
)

const MailIcon = () => (
  <svg className="directory-line-icon-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
    <circle cx="12" cy="12" r="10" fill="#4f7cff" />
    <path d="M12 7C9.24 7 7 9.24 7 12C7 14.76 9.24 17 12 17C13.4 17 14.67 16.42 15.6 15.5L14.4 14.3C13.75 14.85 12.92 15.2 12 15.2C10.23 15.2 8.8 13.77 8.8 12C8.8 10.23 10.23 8.8 12 8.8C13.77 8.8 15.2 10.23 15.2 12V12.7C15.2 13.09 14.89 13.4 14.5 13.4C14.11 13.4 13.8 13.09 13.8 12.7V12C13.8 11 13 10.2 12 10.2C11 10.2 10.2 11 10.2 12C10.2 13 11 13.8 12 13.8C12.45 13.8 12.85 13.63 13.15 13.35C13.45 13.9 14 14.3 14.7 14.3C15.86 14.3 16.8 13.36 16.8 12.2V12C16.8 9.24 14.56 7 12 7Z" fill="white" />
  </svg>
)

const PhoneIcon = () => (
  <svg className="directory-line-icon-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
    <circle cx="12" cy="12" r="10" fill="#4f7cff" />
    <path d="M15.4 12.92v1.5a1 1 0 0 1-1.09 1 9.89 9.89 0 0 1-4.32-1.53 9.75 9.75 0 0 1-3-3A9.89 9.89 0 0 1 5.46 6.1a1 1 0 0 1 1-1h1.5a1 1 0 0 1 1 .86c.16.7.4 1.37.7 2a1 1 0 0 1-.22 1.06l-.64.64a8 8 0 0 0 3 3l.64-.64a1 1 0 0 1 1.06-.22c.63.3 1.3.54 2 .7a1 1 0 0 1 .86 1z" fill="white" />
  </svg>
)

const TeamIcon = () => (
  <svg className="directory-line-icon-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
    <circle cx="12" cy="12" r="10" fill="#4f7cff" />
    <path d="M14 15.5v-1a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v1M11 9a2 2 0 1 1-2-2 2 2 0 0 1 2 2zM17 15.5v-1a2 2 0 0 0-1.5-1.93M14 7.07a2 2 0 0 1 0 3.87" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

function normalizeDepartment(member) {
  if (member.department === 'Recruiters') return 'Front-End Team'
  if (member.department === 'E-care') return 'Ecare Team'
  if (member.department) return member.department
  if (member.role === 'manager') return 'Managers'
  return 'Front-End Team'
}

function MemberCard({ member, index, admin, canEdit, onEdit, showToast }) {
  const initials = (member.full_name || member.email || '?').split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase()
  const copyMember = async (event) => {
    event.stopPropagation()
    if (member.email) {
      await navigator.clipboard?.writeText(member.email)
      showToast?.('Email copied to clipboard!')
    }
  }
  return (
    <article className={`directory-card ${admin ? 'admin' : ''}`}>
      <div className="directory-avatar" style={{ background: avatarGradients[index % avatarGradients.length] }}>{initials}</div>
      <div className="directory-card-copy">
        <strong>{member.full_name || 'Unnamed contact'}</strong>
        <div className="directory-card-meta">
          {member.extension ? (
            <>
              <span className="directory-meta-ext">x{member.extension}</span>
              {member.phone && <span className="directory-meta-sep"> · </span>}
              <span className="directory-meta-phone">{member.phone}</span>
            </>
          ) : (
            <>
              <span className="directory-meta-dept">{admin ? member.role : normalizeDepartment(member)}</span>
              {member.phone && <span className="directory-meta-sep"> · </span>}
              <span className="directory-meta-phone">{member.phone}</span>
            </>
          )}
        </div>
      </div>
      <div className="directory-card-actions">
        <button className="directory-copy" onClick={copyMember} type="button" title="Copy contact">
          <CopyIcon />
        </button>
        {canEdit && (
          <button className="directory-edit" onClick={(event) => { event.stopPropagation(); onEdit(member) }} type="button" title="Edit contact">
            <EditIcon />
          </button>
        )}
      </div>
      <div className="directory-card-lines">
        {member.email && (
          <div className="directory-line-item">
            <span className="directory-line-icon"><MailIcon /></span>
            <a href={`mailto:${member.email}`} className="directory-email-link">{member.email}</a>
          </div>
        )}
        {member.team && (
          <div className="directory-line-item">
            <span className="directory-line-icon"><TeamIcon /></span>
            <span className="directory-line-text">{member.team}</span>
          </div>
        )}
        {member.phone && !member.extension && (
          <div className="directory-line-item">
            <span className="directory-line-icon"><PhoneIcon /></span>
            <span className="directory-line-text">{member.phone}</span>
          </div>
        )}
      </div>
    </article>
  )
}

function Field({ label, children }) {
  return (
    <label>
      {label}
      {children}
    </label>
  )
}

function EmptyState({ title, body, compact }) {
  return (
    <div className={`directory-empty ${compact ? 'compact' : ''}`}>
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  )
}
