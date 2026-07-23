import React, { useState, useEffect, useRef } from 'react'

function SearchableProfileSelect({ profiles, value, onChange }) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const dropdownRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  const selectedProfile = profiles.find(p => p.id === value)
  const filteredProfiles = profiles.filter(p => {
    const q = search.toLowerCase()
    const name = (p.full_name || '').toLowerCase()
    const email = (p.email || '').toLowerCase()
    const role = (p.role || '').toLowerCase()
    return name.includes(q) || email.includes(q) || role.includes(q)
  })

  return (
    <div className="searchable-profile-select" ref={dropdownRef} style={{ position: 'relative', width: '100%' }}>
      <button
        type="button"
        className="searchable-profile-trigger"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          padding: '9px 12px',
          borderRadius: '8px',
          border: '1px solid var(--border)',
          background: 'var(--surface2)',
          color: selectedProfile ? 'var(--text)' : 'var(--text3)',
          fontSize: '13px',
          fontWeight: selectedProfile ? '600' : '400',
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: 'inherit',
          outline: 'none'
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedProfile
            ? `${selectedProfile.full_name || selectedProfile.email} (${selectedProfile.role || 'recruiter'})`
            : '-- Select Recruiter --'}
        </span>
        <span style={{ fontSize: '10px', color: 'var(--text3)', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.15s ease' }}>▼</span>
      </button>

      {isOpen && (
        <div
          className="searchable-profile-dropdown"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 1000,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            boxShadow: '0 12px 36px rgba(0, 0, 0, 0.4)',
            padding: '8px',
            maxHeight: '240px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
          }}
        >
          <div style={{ position: 'relative', width: '100%' }}>
            <input
              ref={inputRef}
              type="text"
              placeholder="Search recruiter name, email, role..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 10px 7px 28px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                background: 'var(--surface2)',
                color: 'var(--text)',
                fontSize: '12px',
                outline: 'none',
                fontFamily: 'inherit',
                boxSizing: 'border-box'
              }}
            />
            <span style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '12px', opacity: 0.5 }}>🔍</span>
          </div>

          <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {filteredProfiles.length === 0 ? (
              <div style={{ padding: '10px', fontSize: '12px', color: 'var(--text3)', textAlign: 'center' }}>
                No recruiter found
              </div>
            ) : (
              filteredProfiles.map(p => {
                const isSelected = p.id === value
                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      onChange(p.id)
                      setIsOpen(false)
                      setSearch('')
                    }}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '12.5px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: isSelected ? 'rgba(79, 124, 255, 0.16)' : 'transparent',
                      color: isSelected ? 'var(--accent)' : 'var(--text)',
                      fontWeight: isSelected ? '700' : '400',
                      transition: 'all 0.12s ease'
                    }}
                    onMouseEnter={e => {
                      if (!isSelected) e.currentTarget.style.background = 'var(--surface2)'
                    }}
                    onMouseLeave={e => {
                      if (!isSelected) e.currentTarget.style.background = 'transparent'
                    }}
                  >
                    <span>{p.full_name || p.email}</span>
                    <span style={{ fontSize: '10.5px', color: isSelected ? 'var(--accent)' : 'var(--text3)', padding: '1px 6px', borderRadius: '4px', background: 'var(--surface2)', fontFamily: 'var(--mono)' }}>
                      {p.role || 'recruiter'}
                    </span>
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

export default function TaskModal({
  isOpen,
  onClose,
  onSave,
  task = null,
  profiles = [],
  jobs = [],
  currentUser = null
}) {
  const [formData, setFormData] = useState({
    title: '',
    category: 'Daily Calls',
    assigned_to: '',
    priority: 'Medium',
    due_date: new Date().toISOString().slice(0, 10),
    target_value: '',
    req_id: '',
    description: ''
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (task) {
      setFormData({
        title: task.title || '',
        category: task.category || 'Custom',
        assigned_to: task.assigned_to || '',
        priority: task.priority || 'Medium',
        due_date: task.due_date || new Date().toISOString().slice(0, 10),
        target_value: task.target_value !== undefined && task.target_value !== null ? String(task.target_value) : '',
        req_id: task.req_id || '',
        description: task.description || ''
      })
    } else {
      const defaultRecruiter = currentUser?.id || profiles.find(p => p.role === 'recruiter')?.id || profiles[0]?.id || ''
      setFormData({
        title: '',
        category: 'Daily Calls',
        assigned_to: defaultRecruiter,
        priority: 'Medium',
        due_date: new Date().toISOString().slice(0, 10),
        target_value: '10',
        req_id: '',
        description: ''
      })
    }
    setError(null)
  }, [task, profiles, isOpen])

  if (!isOpen) return null

  const categories = [
    { id: 'Daily Calls', label: '📞 Daily Calls Target' },
    { id: 'Submissions', label: '🚀 Submissions Target' },
    { id: 'Sourcing', label: '🔍 Candidate Sourcing' },
    { id: 'Outreach', label: '✉️ Email / InMail Outreach' },
    { id: 'Interviews', label: '📅 Interview Scheduling' },
    { id: 'Offers', label: '💼 Offer Closures' },
    { id: 'Follow-up', label: '📌 Candidate Follow-up' },
    { id: 'Client Meeting', label: '🤝 Client Meeting' },
    { id: 'Custom', label: '⚡ Custom Task' }
  ]

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.title.trim()) {
      setError('Task Title is required.')
      return
    }
    if (!formData.assigned_to) {
      setError('Please select a recruiter to assign this task to.')
      return
    }

    const assignedProfile = profiles.find(p => p.id === formData.assigned_to)
    const assignedToName = assignedProfile ? (assignedProfile.full_name || assignedProfile.email) : 'Recruiter'
    const assignedByName = currentUser ? (currentUser.full_name || currentUser.email) : 'Manager'

    const payload = {
      ...formData,
      title: formData.title.trim(),
      target_value: formData.target_value ? parseInt(formData.target_value, 10) : null,
      assigned_to_name: assignedToName,
      assigned_by: currentUser?.id || null,
      assigned_by_name: assignedByName,
      status: task ? task.status : 'Pending',
      current_progress: task ? task.current_progress : 0
    }

    try {
      setSubmitting(true)
      await onSave(payload, task?.id)
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to save task.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="task-modal-overlay" onClick={onClose}>
      <div className="task-modal-card" onClick={e => e.stopPropagation()}>
        <div className="task-modal-header">
          <div>
            <h3>{task ? '✏️ Edit Task & Target' : '🎯 Assign New Task & Daily Target'}</h3>
            <p>Set recruiter deliverables, performance benchmarks, and due dates.</p>
          </div>
          <button type="button" className="task-modal-close" onClick={onClose}>✕</button>
        </div>

        {error && <div className="task-modal-error">⚠️ {error}</div>}

        <form onSubmit={handleSubmit} className="task-modal-form">
          <div className="task-form-grid">
            <div className="task-form-field full-width">
              <label>Task Title / Target Name *</label>
              <input
                type="text"
                placeholder="e.g. Complete 15 Phone Screens for Senior DevOps Req"
                value={formData.title}
                onChange={e => setFormData({ ...formData, title: e.target.value })}
                required
              />
            </div>

            <div className="task-form-field">
              <label>Task Category *</label>
              <select
                value={formData.category}
                onChange={e => setFormData({ ...formData, category: e.target.value })}
              >
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </div>

            <div className="task-form-field">
              <label>Assign To (Recruiter) *</label>
              <SearchableProfileSelect
                profiles={profiles}
                value={formData.assigned_to}
                onChange={val => setFormData({ ...formData, assigned_to: val })}
              />
            </div>

            <div className="task-form-field">
              <label>Priority Level</label>
              <select
                value={formData.priority}
                onChange={e => setFormData({ ...formData, priority: e.target.value })}
              >
                <option value="Low">🟢 Low Priority</option>
                <option value="Medium">🟡 Medium Priority</option>
                <option value="High">🔴 High Priority</option>
              </select>
            </div>

            <div className="task-form-field">
              <label>Due Date</label>
              <input
                type="date"
                value={formData.due_date}
                onChange={e => setFormData({ ...formData, due_date: e.target.value })}
              />
            </div>

            <div className="task-form-field">
              <label>Target Value (Optional Count)</label>
              <input
                type="number"
                min="1"
                placeholder="e.g. 10 (calls/subs)"
                value={formData.target_value}
                onChange={e => setFormData({ ...formData, target_value: e.target.value })}
              />
            </div>

            <div className="task-form-field">
              <label>Related Job Requisition (Optional)</label>
              <select
                value={formData.req_id}
                onChange={e => setFormData({ ...formData, req_id: e.target.value })}
              >
                <option value="">-- None / General Task --</option>
                {jobs.map(j => (
                  <option key={j.id} value={j.id}>
                    {j.title} ({j.client || 'Req'})
                  </option>
                ))}
              </select>
            </div>

            <div className="task-form-field full-width">
              <label>Description & Manager Instructions</label>
              <textarea
                rows="4"
                placeholder="Provide detailed context, candidate requirements, or expectations..."
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
          </div>

          <div className="task-modal-footer">
            <button type="button" className="task-modal-cancel" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="task-modal-save" disabled={submitting}>
              {submitting ? 'Saving Task...' : (task ? 'Save Changes' : '🎯 Assign Task & Target')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
