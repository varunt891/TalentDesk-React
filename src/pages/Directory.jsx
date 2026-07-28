import { useEffect, useState, useMemo, useRef } from 'react'
import { db } from '../lib/api'
import { useAuth } from '../context/AuthContext'

const emptyForm = {
  full_name: '',
  email: '',
  phone: '',
  extension: '',
  role: 'recruiter',
  department: '',
  team: '',
}

export default function Directory() {
  const { user, profile } = useAuth()
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeDepartment, setActiveDepartment] = useState('All')
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [toast, setToast] = useState(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const tabsRef = useRef(null)

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
      .param('full_org', 'true')
      .order('full_name')
    setMembers(data || [])
    setLoading(false)
  }

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // Derive available departments dynamically from actual workspace members
  const dynamicDepartments = useMemo(() => {
    const set = new Set()
    members.forEach(member => {
      const dept = (member.department || '').trim()
      if (dept) set.add(dept)
    })
    return Array.from(set).sort()
  }, [members])

  const searchFiltered = members.filter(member => {
    const q = search.toLowerCase()
    const department = getMemberDepartment(member)
    const text = `${member.full_name || ''} ${member.email || ''} ${member.phone || ''} ${member.extension || ''} ${member.team || ''} ${department}`.toLowerCase()
    return !q || text.includes(q)
  })

  const visibleStaff = searchFiltered.filter(member => {
    if (activeDepartment === 'All') return true
    return getMemberDepartment(member) === activeDepartment
  })

  const departmentCounts = useMemo(() => {
    const list = [{ department: 'All', count: members.length }]
    dynamicDepartments.forEach(dept => {
      const count = members.filter(m => getMemberDepartment(m) === dept).length
      list.push({ department: dept, count })
    })
    return list
  }, [dynamicDepartments, members])

  const checkScroll = () => {
    if (!tabsRef.current) return
    const { scrollLeft, scrollWidth, clientWidth } = tabsRef.current
    setCanScrollLeft(scrollLeft > 6)
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 6)
  }

  useEffect(() => {
    checkScroll()
    window.addEventListener('resize', checkScroll)
    return () => window.removeEventListener('resize', checkScroll)
  }, [departmentCounts])

  const scrollTabs = (direction) => {
    if (!tabsRef.current) return
    const amount = direction === 'left' ? -260 : 260
    tabsRef.current.scrollBy({ left: amount, behavior: 'smooth' })
  }

  const openAdd = (dept = activeDepartment) => {
    const defaultDept = dept === 'All' ? (dynamicDepartments[0] || 'General') : dept
    setForm({ ...emptyForm, department: defaultDept })
    setEditingId(null)
    setShowAdd(true)
  }

  const openEdit = (member) => {
    let resolvedRole = member.role || 'recruiter'
    if (resolvedRole === 'manager') {
      resolvedRole = (member.manager_id || (member.team && member.team.includes('AM'))) ? 'account_manager' : 'recruitment_manager'
    }
    setForm({
      full_name: member.full_name || '',
      email: member.email || '',
      phone: member.phone || '',
      extension: member.extension || '',
      role: resolvedRole,
      department: getMemberDepartment(member),
      team: member.team || '',
    })
    setEditingId(member.id)
    setShowAdd(true)
  }

  const deleteMember = async (member) => {
    if (!isAdmin) return
    const confirmDelete = window.confirm(`Are you sure you want to delete "${member.full_name || member.email}" from the directory?`)
    if (!confirmDelete) return

    try {
      const { error } = await db.from('profiles').delete().eq('id', member.id)
      if (error) {
        showToast(error.message, 'error')
        return
      }
      showToast(`${member.full_name || 'Member'} deleted from directory`)
      fetchMembers()
    } catch (err) {
      showToast(err.message || 'Failed to delete member', 'error')
    }
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
      department: form.department.trim() || 'General',
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
          <div className="directory-member-count">{searchFiltered.length} members</div>
          {isAdmin && <button onClick={() => openAdd()} type="button">+ Add member</button>}
        </div>
      </header>

      <div className="directory-filter-wrapper">
        <div className="directory-filter-header">
          <div className="directory-filter-title">
            <span className="directory-filter-icon"><FilterIcon /></span>
            <span className="directory-filter-text">Filter by Team</span>
          </div>
          <span className="directory-filter-count-badge">{departmentCounts.length - 1} Teams</span>
        </div>
        
        <div className="directory-tabs-container">
          {canScrollLeft && (
            <button 
              className="directory-scroll-btn left" 
              onClick={() => scrollTabs('left')} 
              type="button" 
              title="Scroll left"
            >
              <ChevronLeftIcon />
            </button>
          )}

          <div 
            className="directory-tabs" 
            ref={tabsRef} 
            onScroll={checkScroll}
          >
            {departmentCounts.map(item => {
              const isActive = activeDepartment === item.department
              return (
                <button
                  key={item.department}
                  className={`directory-tab-chip ${isActive ? 'active' : ''}`}
                  onClick={() => setActiveDepartment(item.department)}
                  type="button"
                >
                  <span className="tab-chip-icon">{getDepartmentIcon(item.department)}</span>
                  <span className="tab-chip-name">{item.department}</span>
                  <strong className="tab-chip-count">{item.count}</strong>
                </button>
              )
            })}
          </div>

          {canScrollRight && (
            <button 
              className="directory-scroll-btn right" 
              onClick={() => scrollTabs('right')} 
              type="button" 
              title="Scroll right"
            >
              <ChevronRightIcon />
            </button>
          )}
        </div>
      </div>

      <main className="directory-content">
        {loading ? (
          <EmptyState title="Loading directory" body="Pulling company contacts." />
        ) : (
          <section className="directory-section">
            <div className="directory-section-head">
              <div>
                <h2>{activeDepartment === 'All' ? 'All Departments' : `${activeDepartment} Department`}</h2>
                <span>{visibleStaff.length} contacts</span>
              </div>
              {isAdmin && <button onClick={() => openAdd(activeDepartment)} type="button">Add member</button>}
            </div>
            {visibleStaff.length === 0 ? (
              <EmptyState title="No contacts in this view" body="Add a member to this department from the button above." />
            ) : (
              <div className="directory-grid">
                {visibleStaff.map((member, index) => (
                  <MemberCard
                    key={member.id}
                    member={member}
                    index={index}
                    canEdit={isAdmin}
                    onEdit={openEdit}
                    onDelete={deleteMember}
                    showToast={showToast}
                  />
                ))}
              </div>
            )}
          </section>
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
              <Field label="Full name"><input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="John Smith" /></Field>
              <Field label="Email"><input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} type="email" placeholder="john@company.com" /></Field>
              <Field label="Phone number"><input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1 555 000 0000" /></Field>
              <Field label="Extension"><input value={form.extension} onChange={e => setForm(f => ({ ...f, extension: e.target.value }))} placeholder="1001" /></Field>
              <Field label="Department">
                <input
                  value={form.department}
                  onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                  list="directory-department-list"
                  placeholder="Type or select department..."
                />
                <datalist id="directory-department-list">
                  {dynamicDepartments.map(dept => (
                    <option key={dept} value={dept} />
                  ))}
                </datalist>
              </Field>
              <Field label="Role">
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                  {['recruiter', 'account_manager', 'recruitment_manager', 'operations_manager', 'manager', 'admin', 'employee'].map(role => (
                    <option key={role} value={role}>{role.replace('_', ' ')}</option>
                  ))}
                </select>
              </Field>
              <Field label="Team"><input value={form.team} onChange={e => setForm(f => ({ ...f, team: e.target.value }))} placeholder="e.g. Frontend Team" /></Field>
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

const DeleteIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#ef4444' }}>
    <path d="M3 6h18" />
    <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
    <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
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

function getMemberDepartment(member) {
  if (member.department?.trim()) return member.department.trim()
  if (['admin', 'superadmin'].includes(member.role)) return 'Management'
  return 'General'
}

function formatRole(member) {
  if (!member) return 'Recruiter'
  const role = member.role
  if (role === 'recruitment_manager') return 'Recruitment Manager'
  if (role === 'account_manager') return 'Account Manager'
  if (role === 'operations_manager') return 'Operations Manager'
  if (role === 'superadmin') return 'Superadmin'
  if (role === 'admin') return 'Admin'
  if (role === 'recruiter') return 'Recruiter'
  
  if (role === 'manager') {
    if (member.manager_id || (member.team && member.team.includes('AM'))) {
      return 'Account Manager'
    }
    return 'Recruitment Manager'
  }
  return role ? role.replace('_', ' ') : 'Recruiter'
}

function MemberCard({ member, index, canEdit, onEdit, onDelete, showToast }) {
  const initials = (member.full_name || member.email || '?').split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase()
  const copyMember = async (event) => {
    event.stopPropagation()
    if (member.email) {
      await navigator.clipboard?.writeText(member.email)
      showToast?.('Email copied to clipboard!')
    }
  }

  return (
    <article className="directory-card">
      <div className="directory-avatar" style={{ background: avatarGradients[index % avatarGradients.length] }}>{initials}</div>
      <div className="directory-card-name" title={member.full_name || 'Unnamed contact'}>
        <strong>{member.full_name || 'Unnamed contact'}</strong>
      </div>
      <div className="directory-card-actions">
        <button className="directory-copy" onClick={copyMember} type="button" title="Copy contact">
          <CopyIcon />
        </button>
        {canEdit && (
          <>
            <button className="directory-edit" onClick={(event) => { event.stopPropagation(); onEdit(member) }} type="button" title="Edit contact">
              <EditIcon />
            </button>
            <button className="directory-delete-btn" onClick={(event) => { event.stopPropagation(); onDelete(member) }} type="button" title="Delete member">
              <DeleteIcon />
            </button>
          </>
        )}
      </div>
      <div className="directory-card-meta">
        <span className="directory-role-badge">{formatRole(member)}</span>
        {member.extension && <span className="directory-meta-ext">Ext {member.extension}</span>}
        {member.phone && <span className="directory-meta-phone">{member.phone}</span>}
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

const FilterIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
  </svg>
)

const ChevronLeftIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="m15 18-6-6 6-6"/>
  </svg>
)

const ChevronRightIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="m9 18 6-6-6-6"/>
  </svg>
)

function getDepartmentIcon(dept) {
  const d = (dept || '').toLowerCase()
  if (d === 'all') {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1.5"/>
        <rect x="14" y="3" width="7" height="7" rx="1.5"/>
        <rect x="14" y="14" width="7" height="7" rx="1.5"/>
        <rect x="3" y="14" width="7" height="7" rx="1.5"/>
      </svg>
    )
  }
  if (d.includes('health') || d.includes('care') || d.includes('e-care')) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
      </svg>
    )
  }
  if (d.includes('it') || d.includes('tech') || d.includes('desk') || d.includes('dev')) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <rect width="20" height="14" x="2" y="3" rx="2"/>
        <line x1="8" x2="16" y1="21" y2="21"/>
        <line x1="12" x2="12" y1="17" y2="21"/>
      </svg>
    )
  }
  if (d.includes('op') || d.includes('pmo') || d.includes('admin') || d.includes('manage')) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
        <circle cx="12" cy="12" r="3"/>
      </svg>
    )
  }
  if (d.includes('onboard') || d.includes('recruit') || d.includes('hr')) {
    return (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M19 8v6"/>
        <path d="M22 11h-6"/>
      </svg>
    )
  }
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )
}
