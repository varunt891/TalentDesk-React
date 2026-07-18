import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiRequest, db } from '../lib/api'
import { useAuth } from '../context/AuthContext'

const TABS = ['Command Center', 'People', 'Teams', 'Organization', 'Analytics']
const ROLES = ['recruiter', 'manager', 'admin', 'superadmin']
const DEPARTMENTS = ['Recruiting', 'Managers', 'PMO', 'E-care', 'Onboarding', 'Operations']

export default function Admin() {
  const { profile } = useAuth()
  const [activeTab, setActiveTab] = useState('Command Center')
  const [users, setUsers] = useState([])
  const [candidates, setCandidates] = useState([])
  const [jobs, setJobs] = useState([])
  const [org, setOrg] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [search, setSearch] = useState('')
  const [invite, setInvite] = useState({ email: '', role: 'recruiter', team: '', manager_id: '', department: 'Recruiting' })
  const [orgForm, setOrgForm] = useState({ name: '', slug: '', subdomain: '', email_domain: '', primary_color: '#4f7cff', logo_url: '', timezone: 'America/New_York' })

  const isAdmin = profile?.role === 'admin' || profile?.role === 'superadmin'
  const orgId = profile?.org_id

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3200)
  }

  const fetchAdminData = useCallback(async () => {
    if (!orgId) return
    setLoading(true)
    try {
      const [profilesRes, candidatesRes, jobsRes, orgRes] = await Promise.all([
        db.from('profiles').select('*').eq('org_id', orgId).order('full_name'),
        db.from('candidates').select('*').eq('org_id', orgId),
        db.from('jobs').select('*'),
        db.from('organizations').select('*').eq('id', orgId).single(),
      ])

      if (profilesRes.error) throw profilesRes.error
      if (candidatesRes.error) throw candidatesRes.error
      if (jobsRes.error) throw jobsRes.error
      if (orgRes.error) throw orgRes.error

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
    } catch (err) {
      console.error('Admin data fetch failed:', err)
      showToast(err.message || 'Admin data failed to load', 'error')
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    if (!orgId || !isAdmin) return
    fetchAdminData()
  }, [fetchAdminData, isAdmin, orgId])

  const teams = useMemo(() => [...new Set(users.map(user => user.team).filter(Boolean))].sort(), [users])
  const managers = useMemo(() => users.filter(user => ['manager', 'admin', 'superadmin'].includes(user.role)), [users])

  const teamGroups = useMemo(() => {
    return teams.map(team => {
      const members = users.filter(user => user.team === team)
      const memberIds = new Set(members.map(user => user.id))
      const memberNames = new Set(members.map(user => user.full_name || user.email).filter(Boolean))
      const owned = candidates.filter(candidate => (
        memberIds.has(candidate.user_id) ||
        memberIds.has(candidate.recruiter_id) ||
        memberNames.has(candidate.recruiter_name) ||
        memberNames.has(candidate.fe_name)
      ))

      return {
        team,
        department: members.find(member => member.department)?.department || 'Unassigned',
        managers: members.filter(member => ['manager', 'admin', 'superadmin'].includes(member.role)),
        recruiters: members.filter(member => member.role === 'recruiter'),
        members,
        submissions: owned.length,
        interviews: owned.filter(candidate => ['Interview Scheduled', 'Interview Done'].includes(candidate.external_status || candidate.internal_status)).length,
        hires: owned.filter(candidate => candidate.external_status === 'Hired' || candidate.internal_status === 'Hired').length,
      }
    })
  }, [candidates, teams, users])

  const analytics = useMemo(() => {
    const activeUsers = users.filter(user => user.is_active !== false)
    const byRecruiter = users.map(user => {
      const owned = candidates.filter(candidate => (
        candidate.user_id === user.id ||
        candidate.recruiter_id === user.id ||
        candidate.recruiter_name === user.full_name ||
        candidate.fe_name === user.full_name
      ))
      return {
        id: user.id,
        name: user.full_name || user.email || 'Unknown',
        team: user.team || 'Unassigned',
        role: user.role || 'recruiter',
        submissions: owned.length,
        hires: owned.filter(candidate => candidate.internal_status === 'Hired' || candidate.external_status === 'Hired').length,
        interviews: owned.filter(candidate => ['Interview Scheduled', 'Interview Done'].includes(candidate.internal_status || candidate.external_status)).length,
      }
    }).sort((a, b) => b.submissions - a.submissions)

    return {
      totalUsers: users.length,
      activeUsers: activeUsers.length,
      admins: users.filter(user => ['admin', 'superadmin'].includes(user.role)).length,
      managers: users.filter(user => user.role === 'manager').length,
      recruiters: users.filter(user => user.role === 'recruiter').length,
      teams: teams.length,
      candidates: candidates.length,
      openJobs: jobs.filter(job => job.status === 'Open').length,
      hires: candidates.filter(candidate => candidate.internal_status === 'Hired' || candidate.external_status === 'Hired').length,
      byRecruiter,
    }
  }, [candidates, jobs, teams.length, users])

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return users
    return users.filter(user => `${user.full_name} ${user.email} ${user.role} ${user.team} ${user.department}`.toLowerCase().includes(q))
  }, [search, users])

  const updateUser = async (id, updates) => {
    setSaving(true)
    const { error } = await db.from('profiles').update(updates).eq('id', id)
    setSaving(false)

    if (error) return showToast(error.message, 'error')
    setUsers(prev => prev.map(user => user.id === id ? { ...user, ...updates } : user))
    showToast('Member updated')
  }

  const sendInvite = async () => {
    if (!invite.email.trim()) return showToast('Email is required', 'error')
    setSaving(true)
    try {
      await apiRequest('/admin/invite-user', {
        method: 'POST',
        body: {
          email: invite.email.trim(),
          role: invite.role,
          team: invite.team || null,
          manager_id: invite.manager_id || null,
          department: invite.department || null,
        },
      })
      setInvite({ email: '', role: 'recruiter', team: '', manager_id: '', department: 'Recruiting' })
      showToast('Invite created')
      await fetchAdminData()
    } catch (err) {
      showToast(err.message || 'Invite failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  const seedDemoProfiles = async () => {
    setSaving(true)
    try {
      const response = await apiRequest('/admin/seed-demo-profiles', { method: 'POST' })
      showToast(response.data?.created ? `Created ${response.data.created} demo profiles` : 'Demo profiles already exist')
      await fetchAdminData()
    } catch (err) {
      showToast(err.message || 'Demo seed failed', 'error')
    } finally {
      setSaving(false)
    }
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

    if (error) return showToast(error.message, 'error')
    setOrg(prev => ({ ...prev, ...payload }))
    showToast('Organization settings saved')
  }

  if (!isAdmin) {
    return (
      <div className="admin-page">
        <EmptyState title="Admin access required" body="Only admins and superadmins can open this panel." />
      </div>
    )
  }

  return (
    <div className="admin-page admin-v2">
      <header className="admin-hero">
        <div>
          <p>Organization Control</p>
          <h1>{org?.name || 'TalentDesk'} Admin Console</h1>
          <span>Manage company structure, reporting hierarchy, user access, and workspace governance.</span>
        </div>
        <div className="admin-hero-actions">
          <button className="admin-refresh" onClick={fetchAdminData} disabled={loading || saving}>Refresh</button>
          <button className="admin-primary" onClick={seedDemoProfiles} disabled={saving}>Add Demo Profiles</button>
        </div>
      </header>

      <section className="admin-command-grid">
        <Stat label="Active Members" value={analytics.activeUsers} helper={`${analytics.totalUsers} total`} />
        <Stat label="Teams" value={analytics.teams} helper={`${analytics.managers} managers`} />
        <Stat label="Recruiters" value={analytics.recruiters} helper={`${analytics.admins} admins`} />
        <Stat label="Open Jobs" value={analytics.openJobs} helper={`${analytics.candidates} candidates`} />
        <Stat label="Hires" value={analytics.hires} helper="org-wide" />
      </section>

      <nav className="admin-tabs">
        {TABS.map(tab => (
          <button key={tab} className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)} type="button">
            {tab}
          </button>
        ))}
      </nav>

      {loading ? (
        <EmptyState title="Loading admin workspace" body="Pulling members, teams, organization settings, and analytics." />
      ) : (
        <>
          {activeTab === 'Command Center' && (
            <CommandCenter
              analytics={analytics}
              onSeed={seedDemoProfiles}
              saving={saving}
              teamGroups={teamGroups}
            />
          )}
          {activeTab === 'People' && (
            <PeopleTab
              filteredUsers={filteredUsers}
              invite={invite}
              managers={managers}
              onInviteChange={setInvite}
              onSearch={setSearch}
              onSendInvite={sendInvite}
              onUpdateUser={updateUser}
              saving={saving}
              search={search}
              teams={teams}
            />
          )}
          {activeTab === 'Teams' && <TeamsTab saving={saving} teamGroups={teamGroups} users={users} onUpdateUser={updateUser} />}
          {activeTab === 'Organization' && <OrgSettingsTab form={orgForm} onChange={setOrgForm} onSave={saveOrgSettings} saving={saving} />}
          {activeTab === 'Analytics' && <AnalyticsTab analytics={analytics} teamGroups={teamGroups} />}
        </>
      )}

      {toast && <div className={`admin-toast ${toast.type || 'success'}`}>{toast.msg}</div>}
    </div>
  )
}

function CommandCenter({ analytics, onSeed, saving, teamGroups }) {
  const needsTeamSetup = teamGroups.length === 0
  return (
    <div className="admin-command-layout">
      <section className="admin-panel admin-playbook">
        <div className="admin-panel-title">Setup Playbook</div>
        <div className="admin-check-list">
          <CheckRow done={analytics.teams > 0} title="Create teams" body="Group recruiters into delivery teams, PMO, E-care, onboarding, or managers." />
          <CheckRow done={analytics.managers > 0} title="Assign managers" body="Managers become reporting owners for recruiter visibility and reports." />
          <CheckRow done={analytics.admins > 0} title="Protect admin access" body="Keep superadmin/admin users separate from recruiting teams." />
          <CheckRow done={analytics.recruiters > 0} title="Add recruiters" body="Recruiters should sit under a team and manager for scoped reporting." />
        </div>
        {needsTeamSetup && (
          <button className="admin-primary" onClick={onSeed} disabled={saving}>Create demo profiles</button>
        )}
      </section>

      <section className="admin-panel">
        <div className="admin-panel-title">Team Health</div>
        <div className="admin-team-health">
          {teamGroups.length === 0 ? <EmptyState title="No team structure yet" body="Use Add Demo Profiles or assign team names in People." /> : teamGroups.slice(0, 8).map(group => (
            <div className="admin-health-row" key={group.team}>
              <div>
                <strong>{group.team}</strong>
                <span>{group.department} - {group.members.length} members - {group.managers.length} managers</span>
              </div>
              <b>{group.submissions}</b>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

function PeopleTab({ filteredUsers, invite, managers, onInviteChange, onSearch, onSendInvite, onUpdateUser, saving, search, teams }) {
  return (
    <div className="admin-people-layout">
      <section className="admin-panel admin-invite-panel">
        <div className="admin-panel-title">Invite / Add Member</div>
        <div className="admin-form-grid single">
          <label>Email<input value={invite.email} onChange={e => onInviteChange({ ...invite, email: e.target.value })} placeholder="name@company.com" /></label>
          <label>Role<select value={invite.role} onChange={e => onInviteChange({ ...invite, role: e.target.value })}>{ROLES.filter(r => r !== 'superadmin').map(role => <option key={role}>{role}</option>)}</select></label>
          <label>Team<input value={invite.team} onChange={e => onInviteChange({ ...invite, team: e.target.value })} list="admin-team-list" placeholder="Front-End Team" /></label>
          <label>Department<select value={invite.department} onChange={e => onInviteChange({ ...invite, department: e.target.value })}>{DEPARTMENTS.map(department => <option key={department}>{department}</option>)}</select></label>
          <label>Manager<select value={invite.manager_id} onChange={e => onInviteChange({ ...invite, manager_id: e.target.value })}><option value="">Unassigned</option>{managers.map(manager => <option key={manager.id} value={manager.id}>{manager.full_name || manager.email}</option>)}</select></label>
        </div>
        <button className="admin-primary" onClick={onSendInvite} disabled={saving}>{saving ? 'Saving...' : 'Send Invite'}</button>
        <datalist id="admin-team-list">{teams.map(team => <option key={team} value={team} />)}</datalist>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-headline">
          <div>
            <div className="admin-panel-title">People Directory</div>
            <p>Update roles, reporting managers, team, department, extension, and active status.</p>
          </div>
          <input className="admin-search" value={search} onChange={e => onSearch(e.target.value)} placeholder="Search people, team, role..." />
        </div>
        <div className="admin-member-directory">
          {filteredUsers.map(user => (
            <MemberCard key={user.id} managers={managers} onUpdateUser={onUpdateUser} saving={saving} user={user} />
          ))}
        </div>
      </section>
    </div>
  )
}

function MemberCard({ managers, onUpdateUser, saving, user }) {
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
    <article className="admin-member-card">
      <div className="admin-member-main">
        <div className="admin-member-avatar">{(user.full_name || user.email || 'U').slice(0, 1).toUpperCase()}</div>
        <div>
          <strong>{user.full_name || 'Unnamed member'}</strong>
          <span>{user.email}</span>
        </div>
      </div>
      <div className="admin-member-controls">
        <label>Role<select value={user.role || 'recruiter'} disabled={saving} onChange={e => onUpdateUser(user.id, { role: e.target.value })}>{ROLES.map(role => <option key={role}>{role}</option>)}</select></label>
        <label>Team<input {...editProps('team', 'Team')} /></label>
        <label>Department<input {...editProps('department', 'Department')} list="admin-department-list" /></label>
        <label>Manager<select value={user.manager_id || ''} disabled={saving} onChange={e => onUpdateUser(user.id, { manager_id: e.target.value || null })}><option value="">Unassigned</option>{managers.filter(manager => manager.id !== user.id).map(manager => <option key={manager.id} value={manager.id}>{manager.full_name || manager.email}</option>)}</select></label>
        <label>Phone<input {...editProps('phone', 'Phone')} /></label>
        <label>Ext.<input {...editProps('extension', 'Ext.')} /></label>
      </div>
      <button className={user.is_active === false ? 'admin-status inactive' : 'admin-status active'} onClick={() => onUpdateUser(user.id, { is_active: user.is_active === false })} type="button">
        {user.is_active === false ? 'Inactive' : 'Active'}
      </button>
      <datalist id="admin-department-list">{DEPARTMENTS.map(department => <option key={department} value={department} />)}</datalist>
    </article>
  )
}

function TeamsTab({ saving, teamGroups, users, onUpdateUser }) {
  return (
    <div className="admin-team-grid-v2">
      {teamGroups.length === 0 ? (
        <EmptyState title="No teams yet" body="Seed demo profiles or assign teams in People to build the org chart." />
      ) : teamGroups.map(group => (
        <section className="admin-panel admin-team-card-v2" key={group.team}>
          <div className="admin-team-head">
            <div>
              <div className="admin-panel-title">{group.team}</div>
              <p>{group.department} - {group.members.length} members - {group.submissions} submissions</p>
            </div>
            <span>{group.hires} hires</span>
          </div>
          <div className="admin-manager-strip">
            {group.managers.length === 0 ? <em>No manager assigned</em> : group.managers.map(manager => <strong key={manager.id}>{manager.full_name || manager.email}</strong>)}
          </div>
          <div className="admin-member-list">
            {group.members.map(member => (
              <div className="admin-member" key={member.id}>
                <div>
                  <strong>{member.full_name || member.email}</strong>
                  <span>{member.role} - {member.extension || 'no ext.'}</span>
                </div>
                <select value={member.manager_id || ''} disabled={saving} onChange={e => onUpdateUser(member.id, { manager_id: e.target.value || null })}>
                  <option value="">Manager</option>
                  {users.filter(user => ['manager', 'admin', 'superadmin'].includes(user.role) && user.id !== member.id).map(manager => (
                    <option key={manager.id} value={manager.id}>{manager.full_name || manager.email}</option>
                  ))}
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
      <p className="admin-note">These values drive multi-tenant routing, company matching, and workspace branding.</p>
      <div className="admin-form-grid">
        <label>Company Name<input value={form.name} onChange={e => onChange({ ...form, name: e.target.value })} /></label>
        <label>Workspace Slug<input value={form.slug} onChange={e => onChange({ ...form, slug: e.target.value })} /></label>
        <label>Subdomain<input value={form.subdomain} onChange={e => onChange({ ...form, subdomain: e.target.value.toLowerCase() })} placeholder="acme" /></label>
        <label>Email Domain<input value={form.email_domain} onChange={e => onChange({ ...form, email_domain: e.target.value.toLowerCase() })} placeholder="company.com" /></label>
        <label>Primary Color<input type="color" value={form.primary_color} onChange={e => onChange({ ...form, primary_color: e.target.value })} /></label>
        <label>Timezone<select value={form.timezone} onChange={e => onChange({ ...form, timezone: e.target.value })}>{['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Asia/Calcutta', 'UTC'].map(zone => <option key={zone}>{zone}</option>)}</select></label>
        <label className="admin-span-2">Logo URL<input value={form.logo_url} onChange={e => onChange({ ...form, logo_url: e.target.value })} placeholder="https://..." /></label>
      </div>
      <button className="admin-primary" onClick={onSave} disabled={saving}>{saving ? 'Saving...' : 'Save Organization'}</button>
    </section>
  )
}

function AnalyticsTab({ analytics, teamGroups }) {
  return (
    <div className="admin-analytics">
      <section className="admin-panel">
        <div className="admin-panel-title">Team Leaderboard</div>
        <div className="admin-leaderboard">
          {teamGroups.map((row, index) => (
            <div className="admin-rank" key={row.team}>
              <span>{index + 1}</span>
              <div>
                <strong>{row.team}</strong>
                <em>{row.members.length} members</em>
              </div>
              <b>{row.hires} hires</b>
              <small>{row.submissions} submissions</small>
            </div>
          ))}
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-title">Recruiter Performance</div>
        <div className="admin-leaderboard">
          {analytics.byRecruiter.slice(0, 12).map((row, index) => (
            <div className="admin-rank" key={row.id}>
              <span>{index + 1}</span>
              <div>
                <strong>{row.name}</strong>
                <em>{row.team} - {row.role}</em>
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

function CheckRow({ body, done, title }) {
  return (
    <div className={done ? 'admin-check-row done' : 'admin-check-row'}>
      <span>{done ? 'OK' : 'TO DO'}</span>
      <div>
        <strong>{title}</strong>
        <small>{body}</small>
      </div>
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
