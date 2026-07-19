import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiRequest, db } from '../lib/api'
import { useAuth } from '../context/AuthContext'

const TABS = ['Overview', 'Org Chart', 'Members', 'Access', 'Company']
const ROLES = ['employee', 'recruiter', 'manager', 'admin', 'superadmin']
const DEPARTMENTS = ['Healthcare', 'IT', 'Operations']

const isSubmissionRecruiter = user => user.role === 'recruiter'

export default function Admin() {
  const { profile } = useAuth()
  const [activeTab, setActiveTab] = useState('Overview')
  const [users, setUsers] = useState([])
  const [candidates, setCandidates] = useState([])
  const [jobs, setJobs] = useState([])
  const [org, setOrg] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)
  const [search, setSearch] = useState('')
  const [memberFilters, setMemberFilters] = useState({ department: 'All', role: 'All' })
  const [invite, setInvite] = useState({ email: '', role: 'recruiter', team: '', manager_id: '', department: 'Recruiting' })
  const [orgForm, setOrgForm] = useState({ name: '', slug: '', subdomain: '', email_domain: '', primary_color: '#4f7cff', logo_url: '', timezone: 'America/New_York' })

  const isSuperAdmin = profile?.role === 'superadmin'
  const isAdmin = profile?.role === 'admin' || isSuperAdmin
  const orgId = profile?.org_id

  // Superadmin org switching
  const [allOrgs, setAllOrgs] = useState([])
  const [selectedOrgId, setSelectedOrgId] = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3200)
  }

  const fetchAdminData = useCallback(async () => {
    const activeOrgId = selectedOrgId || orgId
    if (!activeOrgId) return
    setLoading(true)
    try {
      const [profilesRes, candidatesRes, jobsRes, orgRes] = await Promise.all([
        db.from('profiles').select('*').eq('org_id', activeOrgId).param('full_org', 'true').order('full_name'),
        db.from('candidates').select('*').eq('org_id', activeOrgId),
        db.from('jobs').select('*'),
        db.from('organizations').select('*').eq('id', activeOrgId).single(),
      ])

      if (profilesRes.error) throw profilesRes.error
      if (candidatesRes.error) throw candidatesRes.error
      if (jobsRes.error) throw jobsRes.error
      if (orgRes.error) throw orgRes.error

      setUsers(profilesRes.data || [])
      setCandidates(candidatesRes.data || [])
      setJobs((jobsRes.data || []).filter(job => !job.org_id || job.org_id === activeOrgId))

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
  }, [orgId, selectedOrgId])

  // Fetch all orgs for superadmin org switcher
  useEffect(() => {
    if (!isSuperAdmin) return
    db.from('organizations').select('*').order('name').then(({ data }) => {
      if (data && data.length > 0) {
        setAllOrgs(data)
        // Default to the superadmin's own org
        if (!selectedOrgId) setSelectedOrgId(orgId)
      }
    })
  }, [isSuperAdmin, orgId])

  useEffect(() => {
    if (!orgId || !isAdmin) return
    fetchAdminData()
  }, [fetchAdminData, isAdmin, orgId, selectedOrgId])

  const teams = useMemo(() => [...new Set(users.map(user => user.team).filter(Boolean))].sort(), [users])
  const managers = useMemo(() => users.filter(user => ['manager', 'admin', 'superadmin'].includes(user.role)), [users])

  const userStats = useMemo(() => {
    const stats = new Map()
    users.forEach(user => {
      const owned = candidates.filter(candidate => (
        candidate.user_id === user.id ||
        candidate.recruiter_id === user.id ||
        candidate.recruiter_name === user.full_name ||
        candidate.fe_name === user.full_name
      ))
      stats.set(user.id, {
        submissions: owned.length,
        interviews: owned.filter(candidate => ['Interview Scheduled', 'Interview Done'].includes(candidate.external_status || candidate.internal_status)).length,
        hires: owned.filter(candidate => candidate.external_status === 'Hired' || candidate.internal_status === 'Hired').length,
      })
    })
    return stats
  }, [candidates, users])

  const teamGroups = useMemo(() => {
    const managerLedUnits = users
      .filter(user => user.role === 'manager')
      .map(manager => {
        const reports = users.filter(user => user.manager_id === manager.id)
        const recruiters = reports.filter(isSubmissionRecruiter)
        const supportMembers = reports.filter(member => !['manager', 'admin', 'superadmin'].includes(member.role) && !isSubmissionRecruiter(member))
        const candidateOwners = recruiters
        const ownerIds = new Set(candidateOwners.map(user => user.id))
        const ownerNames = new Set(candidateOwners.map(user => user.full_name || user.email).filter(Boolean))
        const owned = candidates.filter(candidate => (
          ownerIds.has(candidate.user_id) ||
          ownerIds.has(candidate.recruiter_id) ||
          ownerNames.has(candidate.recruiter_name) ||
          ownerNames.has(candidate.fe_name)
        ))

        return {
          key: manager.id,
          team: manager.team || `${manager.full_name} Team`,
          title: manager.manager_id 
            ? `${manager.full_name} (${manager.department} Account Manager)` 
            : `${manager.full_name} (${manager.department} Recruitment Manager)`,
          department: manager.department || 'Unassigned',
          managers: [manager],
          manager,
          recruiters,
          supportMembers,
          admins: [],
          members: [manager, ...reports],
          submissions: owned.length,
          interviews: owned.filter(candidate => ['Interview Scheduled', 'Interview Done'].includes(candidate.external_status || candidate.internal_status)).length,
          hires: owned.filter(candidate => candidate.external_status === 'Hired' || candidate.internal_status === 'Hired').length,
        }
      })

    const assignedIds = new Set(managerLedUnits.flatMap(unit => unit.members.map(member => member.id)))
    const unassigned = users.filter(user => !assignedIds.has(user.id) && !['admin', 'superadmin'].includes(user.role))
    if (unassigned.length === 0) return managerLedUnits

    return [
      ...managerLedUnits,
      {
        key: 'unassigned',
        team: 'Unassigned',
        title: 'Unassigned Members',
        department: 'Unassigned',
        managers: [],
        manager: null,
        recruiters: unassigned.filter(isSubmissionRecruiter),
        supportMembers: unassigned.filter(member => !isSubmissionRecruiter(member)),
        admins: [],
        members: unassigned,
        submissions: 0,
        interviews: 0,
        hires: 0,
      },
    ]
  }, [candidates, users])

  const adminUsers = useMemo(() => users.filter(user => ['admin', 'superadmin'].includes(user.role)), [users])

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
      recruiters: users.filter(isSubmissionRecruiter).length,
      teams: teamGroups.filter(group => group.key !== 'unassigned').length,
      candidates: candidates.length,
      openJobs: jobs.filter(job => job.status === 'Open').length,
      hires: candidates.filter(candidate => candidate.internal_status === 'Hired' || candidate.external_status === 'Hired').length,
      byRecruiter,
    }
  }, [candidates, jobs, teamGroups, users])

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase().trim()
    return users.filter(user => {
      const matchesQuery = !q || `${user.full_name} ${user.email} ${displayRole(user)} ${user.team} ${user.department}`.toLowerCase().includes(q)
      const matchesDepartment = memberFilters.department === 'All' || (user.department || 'Unassigned') === memberFilters.department
      const matchesRole = memberFilters.role === 'All' || displayRole(user) === memberFilters.role
      return matchesQuery && matchesDepartment && matchesRole
    })
  }, [memberFilters, search, users])

  const updateUser = async (id, updates) => {
    setSaving(true)
    const { error } = await db.from('profiles').update(updates).eq('id', id)
    setSaving(false)

    if (error) return showToast(error.message, 'error')
    setUsers(prev => prev.map(user => user.id === id ? { ...user, ...updates } : user))
    showToast('Member updated')
  }

  const moveMemberToTeam = async (member, unitKey) => {
    const targetTeam = teamGroups.find(group => group.key === unitKey)
    await updateUser(member.id, {
      team: targetTeam?.team || null,
      department: targetTeam?.department || member.department || null,
      manager_id: targetTeam?.manager?.id || null,
    })
  }

  const assignManager = async (member, managerId) => {
    const manager = users.find(user => user.id === managerId)
    await updateUser(member.id, {
      manager_id: managerId || null,
      team: manager?.team || member.team || null,
      department: manager?.department || member.department || null,
    })
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

      {/* Superadmin Org Switcher */}
      {isSuperAdmin && allOrgs.length > 1 && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          padding: '0 2rem 0',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
          overflowX: 'auto',
        }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '1px', whiteSpace: 'nowrap', paddingRight: 12, borderRight: '1px solid var(--border)', marginRight: 4 }}>
            🏢 Platform Orgs
          </span>
          {allOrgs.map(o => {
            const isActive = (selectedOrgId || orgId) === o.id
            return (
              <button
                key={o.id}
                onClick={() => setSelectedOrgId(o.id)}
                type="button"
                style={{
                  position: 'relative',
                  padding: '14px 20px',
                  fontSize: 13,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? '#ff5c87' : 'var(--text2)',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: isActive ? '2px solid #ff5c87' : '2px solid transparent',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  whiteSpace: 'nowrap',
                  transition: 'color 0.15s, border-color 0.15s',
                  marginBottom: -1,
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = 'var(--text)' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = 'var(--text2)' }}
              >
                {o.name}
                {isActive && (
                  <span style={{
                    position: 'absolute',
                    top: 10,
                    right: 8,
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: '#ff5c87',
                  }} />
                )}
              </button>
            )
          })}
        </div>
      )}

      <section className="admin-command-grid">
        <Stat label="Active Members" value={analytics.activeUsers} helper={`${analytics.totalUsers} total`} />
        <Stat label="Manager Groups" value={analytics.teams} helper={`${analytics.managers} managers`} />
        <Stat label="Submission Recruiters" value={analytics.recruiters} helper="Recruiting only" />
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
          {activeTab === 'Overview' && (
            <CommandCenter
              adminUsers={adminUsers}
              onSeed={seedDemoProfiles}
              saving={saving}
              teamGroups={teamGroups}
              userStats={userStats}
            />
          )}
          {activeTab === 'Members' && (
            <PeopleTab
              filteredUsers={filteredUsers}
              invite={invite}
              memberFilters={memberFilters}
              managers={managers}
              onAssignManager={assignManager}
              onFilterChange={setMemberFilters}
              onInviteChange={setInvite}
              onSearch={setSearch}
              onSendInvite={sendInvite}
              onUpdateUser={updateUser}
              saving={saving}
              search={search}
              teams={teams}
            />
          )}
          {activeTab === 'Org Chart' && <TeamsTab onAssignManager={assignManager} onMoveMember={moveMemberToTeam} saving={saving} teamGroups={teamGroups} userStats={userStats} users={users} />}
          {activeTab === 'Access' && <PermissionsTab onUpdateUser={updateUser} saving={saving} users={users} />}
          {activeTab === 'Company' && <OrgSettingsTab form={orgForm} onChange={setOrgForm} onSave={saveOrgSettings} saving={saving} />}
        </>
      )}

      {toast && <div className={`admin-toast ${toast.type || 'success'}`}>{toast.msg}</div>}
    </div>
  )
}

function CommandCenter({ adminUsers, onSeed, saving, teamGroups, userStats }) {
  const needsTeamSetup = teamGroups.length === 0
  const topTeams = [...teamGroups].sort((a, b) => b.submissions - a.submissions).slice(0, 4)
  const topRecruiters = [...userStats.entries()]
    .map(([id, stats]) => ({ user: teamGroups.flatMap(group => group.members).find(member => member.id === id), stats }))
    .filter(row => row.user && isSubmissionRecruiter(row.user))
    .sort((a, b) => b.stats.submissions - a.stats.submissions)
    .slice(0, 6)

  return (
    <div className="admin-overview-layout">
      <section className="admin-panel admin-executive-card">
        <div className="admin-panel-title">How This Workspace Is Organized</div>
        <div className="admin-org-legend">
          <RolePill role="superadmin" />
          <RolePill role="admin" />
          <RolePill role="manager" />
          <RolePill role="recruiter" />
          <RolePill role="employee" />
        </div>
        <p className="admin-note">Admins control the workspace. Recruitment Managers supervise Account Managers. Account Managers manage recruiters and their submissions.</p>
        {needsTeamSetup && (
          <button className="admin-primary" onClick={onSeed} disabled={saving}>Create demo profiles</button>
        )}
      </section>

      <section className="admin-panel">
        <div className="admin-panel-title">Admin Owners</div>
        <div className="admin-owner-list">
          {adminUsers.map(user => (
            <PersonMini key={user.id} stats={userStats.get(user.id)} user={user} />
          ))}
        </div>
      </section>

      <section className="admin-panel admin-span-2">
        <div className="admin-panel-title">Manager Groups at a Glance</div>
        <div className="admin-team-health">
          {teamGroups.length === 0 ? <EmptyState title="No team structure yet" body="Use Add Demo Profiles or assign team names in Members." /> : teamGroups.slice(0, 8).map(group => (
            <div className="admin-health-row" key={group.key}>
              <div>
                <strong>{group.title}</strong>
                <span>{group.department} Department - {group.recruiters.length} recruiters</span>
              </div>
              <b>{group.submissions} sub</b>
            </div>
          ))}
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-title">Highest Activity Account Managers</div>
        <div className="admin-owner-list">
          {topTeams.map(group => (
            <div className="admin-performance-row" key={group.key}>
              <div>
                <strong>{group.title}</strong>
                <span>{group.members.length} people</span>
              </div>
              <MetricStrip stats={group} />
            </div>
          ))}
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-title">Submission Recruiters to Review</div>
        <div className="admin-owner-list">
          {topRecruiters.map(row => <PersonMini key={row.user.id} stats={row.stats} user={row.user} />)}
        </div>
      </section>
    </div>
  )
}

function PeopleTab({ filteredUsers, invite, managers, memberFilters, onAssignManager, onFilterChange, onInviteChange, onSearch, onSendInvite, onUpdateUser, saving, search, teams }) {
  return (
    <div className="admin-people-layout">
      <section className="admin-panel admin-invite-panel">
        <div className="admin-panel-title">Invite Member</div>
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
            <div className="admin-panel-title">Member Directory</div>
            <p>{filteredUsers.length} visible members. Use filters first, then edit the row you need.</p>
          </div>
          <div className="admin-directory-tools">
            <input className="admin-search" value={search} onChange={e => onSearch(e.target.value)} placeholder="Search people, manager, role..." />
            <select value={memberFilters.department} onChange={e => onFilterChange(prev => ({ ...prev, department: e.target.value }))}>
              <option>All</option>
              {[...DEPARTMENTS, 'Unassigned'].map(department => <option key={department}>{department}</option>)}
            </select>
            <select value={memberFilters.role} onChange={e => onFilterChange(prev => ({ ...prev, role: e.target.value }))}>
              <option>All</option>
              {['superadmin', 'admin', 'manager', 'recruiter', 'employee', 'member'].map(role => <option key={role}>{role}</option>)}
            </select>
          </div>
        </div>
        <div className="admin-member-directory compact">
          {filteredUsers.map(user => (
            <MemberCard key={user.id} managers={managers} onAssignManager={onAssignManager} onUpdateUser={onUpdateUser} saving={saving} user={user} />
          ))}
        </div>
      </section>
    </div>
  )
}

function MemberCard({ managers, onAssignManager, onUpdateUser, saving, user }) {
  const [expanded, setExpanded] = useState(false)
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
          <div className="admin-compact-meta">
            <RolePill role={displayRole(user)} />
            <small>{user.department || 'Unassigned'}</small>
            <small>{user.team || 'No group'}</small>
          </div>
        </div>
      </div>
      <button className={user.is_active === false ? 'admin-status inactive' : 'admin-status active'} onClick={() => onUpdateUser(user.id, { is_active: user.is_active === false })} type="button">
        {user.is_active === false ? 'Inactive' : 'Active'}
      </button>
      <button className="admin-row-toggle" type="button" onClick={() => setExpanded(prev => !prev)}>
        {expanded ? 'Close' : 'Edit'}
      </button>
      {expanded && <div className="admin-member-controls">
        <label>Role<select value={user.role || 'recruiter'} disabled={saving} onChange={e => onUpdateUser(user.id, { role: e.target.value })}>{ROLES.map(role => <option key={role}>{role}</option>)}</select></label>
        <label>Team<input {...editProps('team', 'Team')} /></label>
        <label>Department<input {...editProps('department', 'Department')} list="admin-department-list" /></label>
        <label>Manager<select value={user.manager_id || ''} disabled={saving} onChange={e => onAssignManager(user, e.target.value)}><option value="">Unassigned</option>{managers.filter(manager => manager.id !== user.id).map(manager => <option key={manager.id} value={manager.id}>{manager.full_name || manager.email}</option>)}</select></label>
        <label>Phone<input {...editProps('phone', 'Phone')} /></label>
        <label>Ext.<input {...editProps('extension', 'Ext.')} /></label>
      </div>}
      <datalist id="admin-department-list">{DEPARTMENTS.map(department => <option key={department} value={department} />)}</datalist>
    </article>
  )
}

function TeamsTab({ onAssignManager, saving, userStats, users }) {
  const [query, setQuery] = useState('')
  const [expandedNodes, setExpandedNodes] = useState(new Set())

  const hierarchyUsers = useMemo(() => {
    return users.filter(u => !['admin', 'superadmin'].includes(u.role))
  }, [users])

  const treeRoots = useMemo(() => {
    return hierarchyUsers.filter(u => !u.manager_id || !hierarchyUsers.some(parent => parent.id === u.manager_id))
  }, [hierarchyUsers])

  const getDescendantsMatch = useCallback((userId, q) => {
    if (!q) return false
    const term = q.toLowerCase()
    const children = hierarchyUsers.filter(u => u.manager_id === userId)
    for (const child of children) {
      const match = (child.full_name || '').toLowerCase().includes(term) || (child.email || '').toLowerCase().includes(term)
      if (match) return true
      if (getDescendantsMatch(child.id, q)) return true
    }
    return false
  }, [hierarchyUsers])

  const toggleExpand = (id) => {
    setExpandedNodes(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const expandAll = () => {
    const allIds = hierarchyUsers.filter(u => hierarchyUsers.some(child => child.manager_id === u.id)).map(u => u.id)
    setExpandedNodes(new Set(allIds))
  }

  const collapseAll = () => {
    setExpandedNodes(new Set())
  }

  useEffect(() => {
    if (query.trim()) {
      const toExpand = new Set()
      hierarchyUsers.forEach(u => {
        if (getDescendantsMatch(u.id, query)) {
          toExpand.add(u.id)
        }
      })
      setExpandedNodes(toExpand)
    } else {
      const defaultExpand = new Set(treeRoots.map(r => r.id))
      setExpandedNodes(defaultExpand)
    }
  }, [query, treeRoots, hierarchyUsers, getDescendantsMatch])

  return (
    <div className="org-chart-tree-container">
      <div className="org-chart-toolbar">
        <div>
          <div className="admin-panel-title">Hierarchical Organization Chart</div>
          <p>Collapsible tree showing reporting lines and performance statistics.</p>
        </div>
        <div className="org-chart-toolbar-actions">
          <input className="admin-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search name or email..." style={{ width: 220, marginBottom: 0 }} />
          <button onClick={expandAll} type="button">Expand All</button>
          <button onClick={collapseAll} type="button">Collapse All</button>
        </div>
      </div>
      
      {treeRoots.length === 0 ? (
        <EmptyState title="No tree structure available" body="Assign managers under the Members tab to begin building the hierarchy." />
      ) : (
        <div className="org-tree-roots-list">
          {treeRoots.map(root => (
            <TreeNode 
              key={root.id}
              user={root}
              allUsers={hierarchyUsers}
              userStats={userStats}
              onAssignManager={onAssignManager}
              query={query}
              level={0}
              expandedNodes={expandedNodes}
              toggleExpand={toggleExpand}
              getDescendantsMatch={getDescendantsMatch}
              saving={saving}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TreeNode({ user, allUsers, userStats, onAssignManager, query, level, expandedNodes, toggleExpand, getDescendantsMatch, saving }) {
  const children = useMemo(() => allUsers.filter(u => u.manager_id === user.id), [allUsers, user.id])
  const term = query.toLowerCase().trim()
  
  const isMatch = !term || (user.full_name || '').toLowerCase().includes(term) || (user.email || '').toLowerCase().includes(term)
  const hasMatchingDescendant = getDescendantsMatch(user.id, term)
  
  if (term && !isMatch && !hasMatchingDescendant) return null
  
  const isOpen = expandedNodes.has(user.id)
  const hasChildren = children.length > 0
  
  const stats = userStats.get(user.id) || { submissions: 0, interviews: 0, hires: 0 }
  const initials = (user.full_name || user.email || 'U').split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
  
  const countReports = (uid) => {
    const direct = allUsers.filter(u => u.manager_id === uid)
    let total = direct.length
    direct.forEach(d => {
      total += countReports(d.id)
    })
    return total
  }
  
  const reportsCount = countReports(user.id)
  
  const avatarGradients = [
    'linear-gradient(135deg, #4f7cff, #7c5cff)',
    'linear-gradient(135deg, #7c5cff, #a47fff)',
    'linear-gradient(135deg, #2ecc8f, #15d1bb)',
    'linear-gradient(135deg, #ff8c42, #ffb342)'
  ]
  const avatarBg = avatarGradients[(user.full_name || '').charCodeAt(0) % avatarGradients.length]
  
  const managerOptions = allUsers.filter(u => ['manager', 'admin', 'superadmin'].includes(u.role) && u.id !== user.id)

  return (
    <div className="org-tree-node-wrapper">
      <div className={`org-tree-node-row level-${level}`}>
        {hasChildren ? (
          <button 
            className={`org-tree-node-toggle ${isOpen ? 'expanded' : ''}`}
            onClick={() => toggleExpand(user.id)}
            type="button"
          >
            ▶
          </button>
        ) : (
          <span style={{ width: 20 }} />
        )}
        
        <div className="org-tree-node-avatar" style={{ background: avatarBg }}>
          {initials}
        </div>
        
        <div className="org-tree-node-info">
          <span className="org-tree-node-name">{user.full_name}</span>
          <span className={`org-tree-node-role-badge ${user.department?.toLowerCase() || 'operations'}`}>
            {user.role === 'recruiter' 
              ? `${user.department} Recruiter` 
              : user.role === 'manager'
                ? (user.manager_id ? `${user.department} Account Manager` : `${user.department} Recruitment Manager`)
                : `${user.department} ${user.role}`}
          </span>
          <span className="org-tree-node-email">{user.email}</span>
          {reportsCount > 0 && (
            <span className="org-tree-node-reports-count">
              ({reportsCount} {reportsCount === 1 ? 'report' : 'reports'})
            </span>
          )}
        </div>
        
        <div className="org-tree-node-metrics">
          <span className="org-tree-node-metric-item"><b>{stats.submissions}</b> sub</span>
          <span className="org-tree-node-metric-item"><b>{stats.interviews}</b> int</span>
          <span className="org-tree-node-metric-item"><b>{stats.hires}</b> hires</span>
        </div>
        
        <div className="org-tree-node-actions">
          <select 
            value={user.manager_id || ''} 
            disabled={saving} 
            onChange={e => onAssignManager(user, e.target.value)}
          >
            <option value="">No manager (Root)</option>
            {managerOptions.map(mgr => (
              <option key={mgr.id} value={mgr.id}>
                Reports to: {mgr.full_name}
              </option>
            ))}
          </select>
        </div>
      </div>
      
      {hasChildren && isOpen && (
        <div className="org-tree-children-container">
          {children.map(child => (
            <TreeNode 
              key={child.id}
              user={child}
              allUsers={allUsers}
              userStats={userStats}
              onAssignManager={onAssignManager}
              query={query}
              level={Math.min(level + 1, 2)}
              expandedNodes={expandedNodes}
              toggleExpand={toggleExpand}
              getDescendantsMatch={getDescendantsMatch}
              saving={saving}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function PermissionsTab({ onUpdateUser, saving, users }) {
  const admins = users.filter(user => ['admin', 'superadmin'].includes(user.role))
  const staff = users.filter(user => !['admin', 'superadmin'].includes(user.role))

  return (
    <div className="admin-permission-layout">
      <section className="admin-panel">
        <div className="admin-panel-title">Admin Access</div>
        <p className="admin-note">Keep system access separate from team membership. Superadmin should stay limited to ownership-level users.</p>
        <div className="admin-member-list">
          {admins.map(user => (
            <div className="admin-member" key={user.id}>
              <div>
                <strong>{user.full_name || user.email}</strong>
                <span>{user.email}</span>
              </div>
              <select value={user.role || 'admin'} disabled={saving || user.role === 'superadmin'} onChange={e => onUpdateUser(user.id, { role: e.target.value })}>
                <option>admin</option>
                <option>manager</option>
                <option>employee</option>
                <option>recruiter</option>
                {user.role === 'superadmin' && <option>superadmin</option>}
              </select>
            </div>
          ))}
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-title">Promote Staff</div>
        <p className="admin-note">Managers see their team data. Recruiters see their own data. Admins see the company workspace.</p>
        <div className="admin-member-list">
          {staff.slice(0, 20).map(user => (
            <div className="admin-member" key={user.id}>
              <div>
                <strong>{user.full_name || user.email}</strong>
                <span>{user.team || 'No team'} - {user.department || 'No department'}</span>
              </div>
              <select value={user.role || 'employee'} disabled={saving} onChange={e => onUpdateUser(user.id, { role: e.target.value })}>
                <option>employee</option>
                <option>recruiter</option>
                <option>manager</option>
                <option>admin</option>
              </select>
            </div>
          ))}
        </div>
      </section>
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

function PersonMini({ stats, user }) {
  return (
    <div className="admin-person-mini">
      <div className="admin-member-main">
        <div className="admin-member-avatar">{initials(user.full_name || user.email)}</div>
        <div>
          <strong>{user.full_name || user.email}</strong>
          <span>{user.team || user.role}</span>
        </div>
      </div>
      <RolePill role={displayRole(user)} />
      <MetricStrip stats={stats || { submissions: 0, interviews: 0, hires: 0 }} />
    </div>
  )
}

function MetricStrip({ stats }) {
  return (
    <div className="admin-metric-strip">
      <span><b>{stats.submissions || 0}</b> Sub</span>
      <span><b>{stats.interviews || 0}</b> Int</span>
      <span><b>{stats.hires || 0}</b> Hires</span>
    </div>
  )
}

function RolePill({ role }) {
  return <span className={`admin-role-pill ${role || 'recruiter'}`}>{role || 'recruiter'}</span>
}

function displayRole(user) {
  if (user.role === 'employee') return 'employee'
  if (user.role === 'recruiter' && user.department !== 'Recruiting') return 'member'
  return user.role || 'recruiter'
}

function initials(value = '') {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return value.slice(0, 2).toUpperCase()
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
