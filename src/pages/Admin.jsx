import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiRequest, db } from '../lib/api'
import { useAuth } from '../context/AuthContext'

const TABS = ['Users', 'Teams', 'Org Settings', 'Analytics']
const ROLES = ['recruiter', 'manager', 'admin']

export default function Admin() {
  const { profile } = useAuth()
  const [activeTab, setActiveTab] = useState('Users')
  const [users, setUsers] = useState([])
  const [candidates, setCandidates] = useState([])
  const [jobs, setJobs] = useState([])
  const [org, setOrg] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [invite, setInvite] = useState({ email: '', role: 'recruiter', team: '', manager_id: '' })
  const [orgForm, setOrgForm] = useState({ name: '', slug: '', subdomain: '', email_domain: '', primary_color: '#4f7cff', logo_url: '', timezone: 'America/New_York' })

  const isAdmin = profile?.role === 'admin' || profile?.role === 'superadmin'
  const orgId = profile?.org_id

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  const fetchAdminData = useCallback(async () => {
    if (!orgId) {
      console.log('No orgId available')
      return
    }

    setLoading(true)
    try {
      const [profilesRes, candidatesRes, jobsRes, orgRes] = await Promise.all([
        db.from('profiles').select('*').eq('org_id', orgId).order('full_name'),
        db.from('candidates').select('*').eq('org_id', orgId),
        db.from('jobs').select('*'),
        db.from('organizations').select('*').eq('id', orgId).single(),
      ])

      if (profilesRes.error) {
        console.error('Profiles fetch error:', profilesRes.error)
        throw new Error(`Profiles: ${profilesRes.error.message}`)
      }
      if (candidatesRes.error) {
        console.error('Candidates fetch error:', candidatesRes.error)
        throw new Error(`Candidates: ${candidatesRes.error.message}`)
      }
      if (jobsRes.error) {
        console.error('Jobs fetch error:', jobsRes.error)
        throw new Error(`Jobs: ${jobsRes.error.message}`)
      }
      if (orgRes.error) {
        console.error('Organization fetch error:', orgRes.error)
        throw new Error(`Organization: ${orgRes.error.message}`)
      }

      setUsers(profilesRes.data || [])
      setCandidates(candidatesRes.data || [])
      setJobs((jobsRes.data || []).filter(job => !job.org_id || job.org_id === orgId))

      if (orgRes.data) {
        setOrg(orgRes.data)
        setOrgForm({
          name: orgRes.data.name || '',
          slug: orgRes.data.slug || '',
          subdomain: orgRes.data.subdomain || '',
          email_domain: orgRes.data.email_domain || '',
          primary_color: orgRes.data.primary_color || '#4f7cff',
          logo_url: orgRes.data.logo_url || '',
          timezone: orgRes.data.timezone || 'America/New_York',
        })
      }

      setLoading(false)
    } catch (err) {
      console.error('Admin data fetch failed:', err)
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    if (!orgId || !isAdmin) return
    const timer = setTimeout(() => {
      fetchAdminData()
    }, 0)
    return () => clearTimeout(timer)
  }, [fetchAdminData, isAdmin, orgId])

  const teams = useMemo(() => {
    return [...new Set(users.map(u => u.team).filter(Boolean))].sort()
  }, [users])

  const managers = useMemo(() => {
    return users.filter(u => ['manager', 'admin', 'superadmin'].includes(u.role))
  }, [users])

  const analytics = useMemo(() => {
    const byRecruiter = users.map(user => {
      const owned = candidates.filter(c => c.user_id === user.id || c.recruiter_id === user.id || c.recruiter_name === user.full_name)
      return {
        id: user.id,
        name: user.full_name || user.email || 'Unknown',
        role: user.role || 'recruiter',
        submissions: owned.length,
        hires: owned.filter(c => c.internal_status === 'Hired').length,
        interviews: owned.filter(c => ['Interview Scheduled', 'Interview Done'].includes(c.internal_status)).length,
      }
    }).sort((a, b) => b.hires - a.hires || b.submissions - a.submissions)

    const statuses = ['Submitted', 'Shortlisted', 'Interview Scheduled', 'Interview Done', 'Offer Extended', 'Hired']
    const funnel = statuses.map(status => ({
      status,
      count: candidates.filter(c => c.internal_status === status).length,
    }))

    return {
      totalUsers: users.length,
      activeUsers: users.filter(u => u.is_active !== false).length,
      recruiters: users.filter(u => u.role === 'recruiter').length,
      managers: users.filter(u => u.role === 'manager').length,
      candidates: candidates.length,
      openJobs: jobs.filter(j => j.status === 'Open').length,
      hires: candidates.filter(c => c.internal_status === 'Hired').length,
      byRecruiter,
      funnel,
    }
  }, [candidates, jobs, users])

  const updateUser = async (id, updates) => {
    setSaving(true)
    const { error } = await db.from('profiles').update(updates).eq('id', id)
    setSaving(false)

    if (error) {
      showToast(error.message, 'error')
      return
    }

    setUsers(prev => prev.map(user => user.id === id ? { ...user, ...updates } : user))
    showToast('User updated')
  }

  const saveOrgSettings = async () => {
    setSaving(true)
    const payload = {
      ...orgForm,
      slug: orgForm.slug || null,
      subdomain: orgForm.subdomain || null,
      email_domain: orgForm.email_domain || null,
      logo_url: orgForm.logo_url || null,
    }
    const { error } = await db.from('organizations').update(payload).eq('id', orgId)
    setSaving(false)

    if (error) {
      showToast(error.message, 'error')
      return
    }

    setOrg(prev => ({ ...prev, ...orgForm }))
    showToast('Organization settings saved')
  }

  const sendInvite = async () => {
    if (!invite.email.trim()) {
      showToast('Email is required', 'error')
      return
    }

    setSaving(true)
    try {
      await apiRequest('/admin/invite-user', {
        method: 'POST',
        body: {
          email: invite.email.trim(),
          role: invite.role,
          team: invite.team || null,
          manager_id: invite.manager_id || null,
        },
      })

      setInvite({ email: '', role: 'recruiter', team: '', manager_id: '' })
      showToast('Invite created')
      await fetchAdminData()
    } catch (err) {
      console.error('Invite error:', err)
      showToast(err.message || 'Invite failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!isAdmin) {
    return (
      <div className="admin-page">
        <EmptyState title="Admin access required" body="Only admins and superadmins can open this panel." />
      </div>
    )
  }

  return (
    <div className="admin-page">
      <div className="admin-header">
        <div>
          <p className="admin-kicker">Admin workspace</p>
          <h1>{org?.name || 'Organization'} Control Center</h1>
          <p>Manage users, teams, organization settings, and recruiting analytics.</p>
        </div>
        <button className="admin-refresh" onClick={fetchAdminData} disabled={loading || saving}>
          Refresh
        </button>
      </div>

      <div className="admin-tabs">
        {TABS.map(tab => (
          <button
            key={tab}
            className={activeTab === tab ? 'active' : ''}
            onClick={() => setActiveTab(tab)}
            type="button"
          >
            {tab}
          </button>
        ))}
      </div>

      {loading ? (
        <EmptyState title="Loading admin data" body="Pulling users, organization details, and analytics." />
      ) : (
        <>
          {activeTab === 'Users' && (
            <UsersTab
              invite={invite}
              managers={managers}
              onInviteChange={setInvite}
              onSendInvite={sendInvite}
              onUpdateUser={updateUser}
              saving={saving}
              teams={teams}
              users={users}
            />
          )}
          {activeTab === 'Teams' && <TeamsTab teams={teams} users={users} onUpdateUser={updateUser} saving={saving} />}
          {activeTab === 'Org Settings' && (
            <OrgSettingsTab form={orgForm} onChange={setOrgForm} onSave={saveOrgSettings} saving={saving} />
          )}
          {activeTab === 'Analytics' && <AnalyticsTab analytics={analytics} />}
        </>
      )}

      {toast && <div className={`admin-toast ${toast.type || 'success'}`}>{toast.msg}</div>}
    </div>
  )
}

function UsersTab({ invite, managers, onInviteChange, onSendInvite, onUpdateUser, saving, teams, users }) {
  return (
    <div className="admin-grid">
      <section className="admin-panel admin-panel-narrow">
        <div className="admin-panel-title">Invite User</div>
        <label>
          Email
          <input value={invite.email} onChange={e => onInviteChange({ ...invite, email: e.target.value })} placeholder="name@company.com" />
        </label>
        <label>
          Role
          <select value={invite.role} onChange={e => onInviteChange({ ...invite, role: e.target.value })}>
            {ROLES.map(role => <option key={role}>{role}</option>)}
          </select>
        </label>
        <label>
          Team
          <input value={invite.team} onChange={e => onInviteChange({ ...invite, team: e.target.value })} placeholder="Delivery Team A" list="admin-team-list" />
        </label>
        <label>
          Manager
          <select value={invite.manager_id} onChange={e => onInviteChange({ ...invite, manager_id: e.target.value })}>
            <option value="">Unassigned</option>
            {managers.map(manager => <option key={manager.id} value={manager.id}>{manager.full_name || manager.email}</option>)}
          </select>
        </label>
        <button className="admin-primary" onClick={onSendInvite} disabled={saving}>
          {saving ? 'Sending...' : 'Send Invite'}
        </button>
        <p className="admin-note">Creates a pending invite in this company workspace.</p>
        <datalist id="admin-team-list">
          {teams.map(team => <option key={team} value={team} />)}
        </datalist>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-title">Users</div>
        <div className="admin-table-scroll">
          <table className="admin-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Team</th>
                <th>Department</th>
                <th>Manager</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <UserRow
                  key={user.id}
                  managers={managers}
                  onUpdateUser={onUpdateUser}
                  saving={saving}
                  user={user}
                />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function UserRow({ managers, onUpdateUser, saving, user }) {
  const [draft, setDraft] = useState({
    team: user.team || '',
    department: user.department || '',
    phone: user.phone || '',
    extension: user.extension || '',
  })

  useEffect(() => {
    setDraft({
      team: user.team || '',
      department: user.department || '',
      phone: user.phone || '',
      extension: user.extension || '',
    })
  }, [user.team, user.department, user.phone, user.extension])

  const commit = (field) => {
    const nextValue = draft[field] || null
    if ((user[field] || null) !== nextValue) onUpdateUser(user.id, { [field]: nextValue })
  }

  const editProps = (field, placeholder) => ({
    value: draft[field],
    disabled: saving,
    placeholder,
    onChange: e => setDraft(prev => ({ ...prev, [field]: e.target.value })),
    onBlur: () => commit(field),
    onKeyDown: e => {
      if (e.key === 'Enter') e.currentTarget.blur()
    },
  })

  return (
    <tr>
      <td>
        <strong>{user.full_name || 'Unnamed user'}</strong>
        <span>{user.email}</span>
        <div className="admin-contact-edits">
          <input {...editProps('phone', 'Phone')} />
          <input {...editProps('extension', 'Ext.')} />
        </div>
      </td>
      <td>
        <select value={user.role || 'recruiter'} disabled={saving} onChange={e => onUpdateUser(user.id, { role: e.target.value })}>
          {[...ROLES, 'superadmin'].map(role => <option key={role}>{role}</option>)}
        </select>
      </td>
      <td>
        <input {...editProps('team', 'Team')} />
      </td>
      <td>
        <input {...editProps('department', 'Department')} list="admin-department-list" />
        <datalist id="admin-department-list">
          {['Recruiters', 'Managers', 'PMO', 'E-care', 'Onboarding', 'Operations'].map(department => <option key={department} value={department} />)}
        </datalist>
      </td>
      <td>
        <select value={user.manager_id || ''} disabled={saving} onChange={e => onUpdateUser(user.id, { manager_id: e.target.value || null })}>
          <option value="">Unassigned</option>
          {managers.filter(manager => manager.id !== user.id).map(manager => (
            <option key={manager.id} value={manager.id}>{manager.full_name || manager.email}</option>
          ))}
        </select>
      </td>
      <td>
        <button
          className={user.is_active === false ? 'admin-status inactive' : 'admin-status active'}
          onClick={() => onUpdateUser(user.id, { is_active: user.is_active === false })}
          type="button"
        >
          {user.is_active === false ? 'Inactive' : 'Active'}
        </button>
      </td>
    </tr>
  )
}

function TeamsTab({ teams, users, onUpdateUser, saving }) {
  const grouped = teams.map(team => ({
    team,
    managers: users.filter(user => user.team === team && user.role === 'manager'),
    recruiters: users.filter(user => user.team === team && user.role === 'recruiter'),
  }))

  return (
    <div className="admin-team-grid">
      {grouped.length === 0 ? (
        <EmptyState title="No teams yet" body="Assign a team name to users from the Users tab to create team groupings." />
      ) : grouped.map(group => (
        <section className="admin-panel" key={group.team}>
          <div className="admin-team-head">
            <div>
              <div className="admin-panel-title">{group.team}</div>
              <p>{group.recruiters.length} recruiters, {group.managers.length} managers</p>
            </div>
          </div>
          <div className="admin-member-list">
            {[...group.managers, ...group.recruiters].map(member => (
              <div className="admin-member" key={member.id}>
                <div>
                  <strong>{member.full_name || member.email}</strong>
                  <span>{member.email}</span>
                </div>
                <select value={member.role || 'recruiter'} disabled={saving} onChange={e => onUpdateUser(member.id, { role: e.target.value })}>
                  {ROLES.map(role => <option key={role}>{role}</option>)}
                </select>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

function OrgSettingsTab({ form, onChange, onSave, saving }) {
  return (
    <section className="admin-panel admin-settings">
      <div className="admin-panel-title">Organization Settings</div>
      <div className="admin-form-grid">
        <label>
          Company Name
          <input value={form.name} onChange={e => onChange({ ...form, name: e.target.value })} />
        </label>
        <label>
          Workspace Slug
          <input value={form.slug} onChange={e => onChange({ ...form, slug: e.target.value })} />
        </label>
        <label>
          Subdomain
          <input value={form.subdomain} onChange={e => onChange({ ...form, subdomain: e.target.value.toLowerCase() })} placeholder="acme" />
        </label>
        <label>
          Company Email Domain
          <input value={form.email_domain} onChange={e => onChange({ ...form, email_domain: e.target.value.toLowerCase() })} placeholder="company.com" />
        </label>
        <label>
          Primary Color
          <input type="color" value={form.primary_color} onChange={e => onChange({ ...form, primary_color: e.target.value })} />
        </label>
        <label>
          Timezone
          <select value={form.timezone} onChange={e => onChange({ ...form, timezone: e.target.value })}>
            {['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Asia/Calcutta', 'UTC'].map(zone => <option key={zone}>{zone}</option>)}
          </select>
        </label>
        <label className="admin-span-2">
          Logo URL
          <input value={form.logo_url} onChange={e => onChange({ ...form, logo_url: e.target.value })} placeholder="https://..." />
        </label>
      </div>
      <button className="admin-primary" onClick={onSave} disabled={saving}>{saving ? 'Saving...' : 'Save Settings'}</button>
    </section>
  )
}

function AnalyticsTab({ analytics }) {
  const maxFunnel = Math.max(...analytics.funnel.map(item => item.count), 1)

  return (
    <div className="admin-analytics">
      <div className="admin-stat-grid">
        <Stat label="Active Users" value={analytics.activeUsers} helper={`${analytics.totalUsers} total`} />
        <Stat label="Recruiters" value={analytics.recruiters} helper={`${analytics.managers} managers`} />
        <Stat label="Candidates" value={analytics.candidates} helper="Org-wide" />
        <Stat label="Open Jobs" value={analytics.openJobs} helper={`${analytics.hires} hires`} />
      </div>

      <section className="admin-panel">
        <div className="admin-panel-title">Pipeline Conversion</div>
        <div className="admin-funnel">
          {analytics.funnel.map(item => (
            <div key={item.status}>
              <div>
                <span>{item.status}</span>
                <strong>{item.count}</strong>
              </div>
              <progress max={maxFunnel} value={item.count} />
            </div>
          ))}
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-title">Recruiter Performance</div>
        <div className="admin-leaderboard">
          {analytics.byRecruiter.map((row, index) => (
            <div className="admin-rank" key={row.id}>
              <span>{index + 1}</span>
              <div>
                <strong>{row.name}</strong>
                <em>{row.role}</em>
              </div>
              <b>{row.hires} hires</b>
              <small>{row.submissions} submissions</small>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function Stat({ label, value, helper }) {
  return (
    <div className="admin-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{helper}</small>
    </div>
  )
}

function EmptyState({ title, body }) {
  return (
    <div className="admin-empty">
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  )
}
