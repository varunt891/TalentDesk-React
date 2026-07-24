import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiRequest, db } from '../lib/api'
import { useAuth } from '../context/AuthContext'

const TABS = ['Overview', 'Org Chart', 'Members', 'Access', 'Company']
const ROLES = ['employee', 'recruiter', 'manager', 'admin', 'superadmin']

const isSubmissionRecruiter = user => user.role === 'recruiter'

// Inline SVG Icons for visual consistency & branding
const Icons = {
  TalentDeskLogo: () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5" />
      <path d="M2 12l10 5 10-5" />
    </svg>
  ),
  Overview: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" />
    </svg>
  ),
  OrgChart: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v6m0 0l-6 6m6-6l6 6" /><circle cx="12" cy="3" r="2" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="18" r="2" />
    </svg>
  ),
  Members: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Access: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  ),
  Company: () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18" /><path d="M9 8h1" /><path d="M9 12h1" /><path d="M9 16h1" /><path d="M14 8h1" /><path d="M14 12h1" /><path d="M14 16h1" />
      <path d="M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16" />
    </svg>
  ),
  Refresh: ({ className }) => (
    <svg width="14" height="14" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
    </svg>
  ),
  Plus: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  UsersStat: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  GroupStat: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
    </svg>
  ),
  RecruiterStat: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  ),
  JobStat: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  ),
  HireStat: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
      <path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
      <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
      <path d="M18 2H6v7a6 6 0 0 0 12 0V2z" />
    </svg>
  ),
  Search: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  ),
  Building: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" ry="2" /><path d="M9 22v-4h6v4" /><path d="M8 6h.01" />
      <path d="M16 6h.01" /><path d="M12 6h.01" /><path d="M12 10h.01" /><path d="M12 14h.01" /><path d="M16 10h.01" />
      <path d="M16 14h.01" /><path d="M8 10h.01" /><path d="M8 14h.01" />
    </svg>
  ),
  Check: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  Shield: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  )
}

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

  useEffect(() => {
    if (!isSuperAdmin) return
    db.from('organizations').select('*').order('name').then(({ data }) => {
      if (data && data.length > 0) {
        setAllOrgs(data)
        if (!selectedOrgId) setSelectedOrgId(orgId)
      }
    })
  }, [isSuperAdmin, orgId, selectedOrgId])

  useEffect(() => {
    if (!orgId || !isAdmin) return
    fetchAdminData()
  }, [fetchAdminData, isAdmin, orgId, selectedOrgId])

  const teams = useMemo(() => [...new Set(users.map(user => user.team).filter(Boolean))].sort(), [users])
  const departments = useMemo(() => [...new Set(users.map(user => user.department).filter(Boolean))].sort(), [users])
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
    showToast('Member updated successfully')
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
        <EmptyState title="Admin access required" body="Only authorized admins and superadmins can access this console." />
      </div>
    )
  }

  const tabIconMap = {
    'Overview': Icons.Overview,
    'Org Chart': Icons.OrgChart,
    'Members': Icons.Members,
    'Access': Icons.Access,
    'Company': Icons.Company,
  }

  return (
    <div className="admin-page admin-v2">
      {/* TalentDesk Enterprise Branded Header Toolbar */}
      <header className="admin-header-toolbar">
        <div className="admin-header-brand">
          <div className="admin-brand-icon">
            <Icons.TalentDeskLogo />
          </div>
          <div className="admin-header-titles">
            <div className="admin-title-row">
              <h1>TalentDesk Admin Console</h1>
              <span className="admin-workspace-pill">
                Workspace: <b>{org?.name || 'TalentDesk'}</b>
              </span>
            </div>
            <p className="admin-header-subtitle">
              Platform Governance & Access Management
            </p>
          </div>
        </div>
        <div className="admin-header-actions">
          <button 
            className="admin-btn admin-btn-secondary" 
            onClick={fetchAdminData} 
            disabled={loading || saving} 
            type="button"
          >
            <Icons.Refresh className={loading ? 'admin-spin' : ''} />
            <span>Refresh</span>
          </button>
          <button 
            className="admin-btn admin-btn-primary" 
            onClick={seedDemoProfiles} 
            disabled={saving} 
            type="button"
          >
            <Icons.Plus />
            <span>Add Demo Profiles</span>
          </button>
        </div>
      </header>

      {/* Superadmin Org Switcher Bar */}
      {isSuperAdmin && allOrgs.length > 1 && (
        <div className="admin-org-switcher-bar">
          <div className="admin-org-switcher-label">
            <Icons.Building />
            <span>PLATFORM ORGANIZATIONS</span>
          </div>
          <div className="admin-org-switcher-list">
            {allOrgs.map(o => {
              const isActive = (selectedOrgId || orgId) === o.id
              return (
                <button
                  key={o.id}
                  onClick={() => setSelectedOrgId(o.id)}
                  type="button"
                  className={`admin-org-btn ${isActive ? 'active' : ''}`}
                >
                  <span className="admin-org-dot" />
                  <span className="admin-org-name">{o.name}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Identical Uniform KPI Command Cards */}
      <section className="admin-command-grid">
        <Stat 
          label="ACTIVE MEMBERS" 
          value={analytics.activeUsers} 
          helper={`${analytics.totalUsers} total registered`} 
          icon={Icons.UsersStat}
          accent="blue"
        />
        <Stat 
          label="MANAGER GROUPS" 
          value={analytics.teams} 
          helper={`${analytics.managers} active managers`} 
          icon={Icons.GroupStat}
          accent="purple"
        />
        <Stat 
          label="SUBMISSION RECRUITERS" 
          value={analytics.recruiters} 
          helper="Recruiting focus" 
          icon={Icons.RecruiterStat}
          accent="teal"
        />
        <Stat 
          label="OPEN JOBS" 
          value={analytics.openJobs} 
          helper={`${analytics.candidates} candidates in funnel`} 
          icon={Icons.JobStat}
          accent="amber"
        />
        <Stat 
          label="TOTAL HIRES" 
          value={analytics.hires} 
          helper="Organization wide" 
          icon={Icons.HireStat}
          accent="emerald"
        />
      </section>

      {/* Evenly Spaced Segmented Navigation Tabs */}
      <nav className="admin-tabs-nav">
        <div className="admin-tabs-wrapper">
          {TABS.map(tab => {
            const TabIcon = tabIconMap[tab]
            const isActive = activeTab === tab
            return (
              <button 
                key={tab} 
                className={`admin-tab-btn ${isActive ? 'active' : ''}`} 
                onClick={() => setActiveTab(tab)} 
                type="button"
              >
                {TabIcon && <TabIcon />}
                <span>{tab}</span>
              </button>
            )
          })}
        </div>
      </nav>

      {/* Tab Panels Container */}
      {loading ? (
        <div className="admin-loading-card">
          <Icons.Refresh className="admin-spin admin-loading-icon" />
          <h3>Loading Admin Workspace</h3>
          <p>Retrieving organization hierarchy, member permissions, performance analytics, and settings...</p>
        </div>
      ) : (
        <main className="admin-tab-content">
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
              departments={departments}
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
          {activeTab === 'Org Chart' && (
            <TeamsTab 
              onAssignManager={assignManager} 
              onMoveMember={moveMemberToTeam} 
              saving={saving} 
              teamGroups={teamGroups} 
              userStats={userStats} 
              users={users} 
            />
          )}
          {activeTab === 'Access' && (
            <PermissionsTab 
              onUpdateUser={updateUser} 
              saving={saving} 
              users={users} 
            />
          )}
          {activeTab === 'Company' && (
            <OrgSettingsTab 
              form={orgForm} 
              onChange={setOrgForm} 
              onSave={saveOrgSettings} 
              saving={saving} 
            />
          )}
        </main>
      )}

      {/* Toast Notifications */}
      {toast && (
        <div className={`admin-toast-banner ${toast.type || 'success'}`}>
          <div className="admin-toast-icon">
            {toast.type === 'error' ? '!' : <Icons.Check />}
          </div>
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  )
}

/* Overview / Command Center Component */
function CommandCenter({ adminUsers, onSeed, saving, teamGroups, userStats }) {
  const needsTeamSetup = teamGroups.length === 0
  const topTeams = [...teamGroups].sort((a, b) => b.submissions - a.submissions).slice(0, 4)
  const topRecruiters = [...userStats.entries()]
    .map(([id, stats]) => ({ user: teamGroups.flatMap(group => group.members).find(member => member.id === id), stats }))
    .filter(row => row.user && isSubmissionRecruiter(row.user))
    .sort((a, b) => b.stats.submissions - a.stats.submissions)
    .slice(0, 6)

  return (
    <div className="admin-overview-grid">
      {/* Light Clean Enterprise Governance Card */}
      <section className="admin-card">
        <div className="admin-card-header">
          <div className="admin-card-title">
            <Icons.Shield />
            <span>Workspace Hierarchy & Governance</span>
          </div>
        </div>
        <div className="admin-card-body">
          <div className="admin-role-legend-grid">
            <RolePill role="superadmin" />
            <RolePill role="admin" />
            <RolePill role="manager" />
            <RolePill role="recruiter" />
            <RolePill role="employee" />
          </div>
          <p className="admin-card-description">
            Admins oversee global operations. Recruitment Managers supervise Account Managers. Account Managers direct recruiters and monitor candidate submission funnels.
          </p>
          {needsTeamSetup && (
            <button className="admin-btn admin-btn-primary admin-btn-sm" onClick={onSeed} disabled={saving}>
              <Icons.Plus />
              <span>Create Demo Profiles</span>
            </button>
          )}
        </div>
      </section>

      {/* Administrative Owners Card */}
      <section className="admin-card">
        <div className="admin-card-header">
          <div className="admin-card-title">
            <Icons.Access />
            <span>Administrative Owners</span>
          </div>
          <span className="admin-card-badge">{adminUsers.length} Admins</span>
        </div>
        <div className="admin-card-body">
          <div className="admin-owner-stack">
            {adminUsers.map(user => (
              <PersonMini key={user.id} stats={userStats.get(user.id)} user={user} />
            ))}
          </div>
        </div>
      </section>

      {/* Manager Groups Overview Card */}
      <section className="admin-card admin-span-2">
        <div className="admin-card-header">
          <div className="admin-card-title">
            <Icons.GroupStat />
            <span>Manager Groups Overview</span>
          </div>
          <span className="admin-card-subtitle">{teamGroups.length} Active Groups</span>
        </div>
        <div className="admin-card-body">
          <div className="admin-team-health-list">
            {teamGroups.length === 0 ? (
              <EmptyState title="No team structure initialized" body="Click Add Demo Profiles or assign team leadership in the Members tab." />
            ) : (
              teamGroups.slice(0, 8).map(group => {
                const maxSub = Math.max(...teamGroups.map(g => g.submissions), 1)
                const percent = Math.min(Math.round((group.submissions / maxSub) * 100), 100)
                return (
                  <div className="admin-team-row" key={group.key}>
                    <div className="admin-team-meta">
                      <strong>{group.title}</strong>
                      <span>{group.department} Department · {group.recruiters.length} recruiters</span>
                    </div>
                    <div className="admin-team-bar-wrapper">
                      <div className="admin-team-bar" style={{ width: `${percent}%` }} />
                    </div>
                    <div className="admin-team-stat-tag">
                      <b>{group.submissions}</b> Submissions
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </section>

      {/* Top Performing Groups Card */}
      <section className="admin-card">
        <div className="admin-card-header">
          <div className="admin-card-title">
            <Icons.OrgChart />
            <span>Top Performing Groups</span>
          </div>
        </div>
        <div className="admin-card-body">
          <div className="admin-leaderboard-list">
            {topTeams.map(group => (
              <div className="admin-leaderboard-row" key={group.key}>
                <div className="admin-leaderboard-info">
                  <strong>{group.title}</strong>
                  <span>{group.members.length} members assigned</span>
                </div>
                <MetricStrip stats={group} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Submission Recruiters Card */}
      <section className="admin-card">
        <div className="admin-card-header">
          <div className="admin-card-title">
            <Icons.RecruiterStat />
            <span>Recruiter Performance Spotlight</span>
          </div>
        </div>
        <div className="admin-card-body">
          <div className="admin-owner-stack">
            {topRecruiters.map(row => (
              <PersonMini key={row.user.id} stats={row.stats} user={row.user} />
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

/* Members / People Directory Tab Component */
function PeopleTab({ departments, filteredUsers, invite, managers, memberFilters, onAssignManager, onFilterChange, onInviteChange, onSearch, onSendInvite, onUpdateUser, saving, search, teams }) {
  return (
    <div className="admin-people-layout">
      {/* Invite Member Side Card */}
      <section className="admin-card admin-invite-card">
        <div className="admin-card-header">
          <div className="admin-card-title">
            <Icons.Plus />
            <span>Invite Team Member</span>
          </div>
        </div>
        <div className="admin-card-body">
          <div className="admin-form-group">
            <label className="admin-label">Email Address</label>
            <input 
              className="admin-input" 
              value={invite.email} 
              onChange={e => onInviteChange({ ...invite, email: e.target.value })} 
              placeholder="colleague@company.com" 
            />
          </div>
          <div className="admin-form-group">
            <label className="admin-label">Workspace Role</label>
            <select 
              className="admin-select" 
              value={invite.role} 
              onChange={e => onInviteChange({ ...invite, role: e.target.value })}
            >
              {ROLES.filter(r => r !== 'superadmin').map(role => (
                <option key={role} value={role}>{role.toUpperCase()}</option>
              ))}
            </select>
          </div>
          <div className="admin-form-group">
            <label className="admin-label">Team Group</label>
            <input 
              className="admin-input" 
              value={invite.team} 
              onChange={e => onInviteChange({ ...invite, team: e.target.value })} 
              list="admin-team-list" 
              placeholder="e.g. Front-End Team" 
            />
          </div>
          <div className="admin-form-group">
            <label className="admin-label">Department</label>
            <input 
              className="admin-input" 
              value={invite.department} 
              onChange={e => onInviteChange({ ...invite, department: e.target.value })} 
              list="admin-department-list" 
              placeholder="e.g. Recruiting" 
            />
          </div>
          <div className="admin-form-group">
            <label className="admin-label">Reporting Manager</label>
            <select 
              className="admin-select" 
              value={invite.manager_id} 
              onChange={e => onInviteChange({ ...invite, manager_id: e.target.value })}
            >
              <option value="">Unassigned (Direct Root)</option>
              {managers.map(manager => (
                <option key={manager.id} value={manager.id}>{manager.full_name || manager.email}</option>
              ))}
            </select>
          </div>
          <button 
            className="admin-btn admin-btn-primary admin-btn-full" 
            onClick={onSendInvite} 
            disabled={saving}
          >
            {saving ? 'Processing...' : 'Send Invitation'}
          </button>
          <datalist id="admin-team-list">{teams.map(team => <option key={team} value={team} />)}</datalist>
        </div>
      </section>

      {/* Main Members Directory */}
      <section className="admin-card admin-directory-card">
        <div className="admin-card-header admin-directory-header">
          <div>
            <div className="admin-card-title">
              <Icons.Members />
              <span>Member Directory</span>
            </div>
            <p className="admin-card-subtitle">{filteredUsers.length} members matching criteria</p>
          </div>
          <div className="admin-filter-bar">
            <div className="admin-search-wrapper">
              <Icons.Search />
              <input 
                className="admin-search-input" 
                value={search} 
                onChange={e => onSearch(e.target.value)} 
                placeholder="Search name, email, role, team..." 
              />
            </div>
            <select 
              className="admin-filter-select" 
              value={memberFilters.department} 
              onChange={e => onFilterChange(prev => ({ ...prev, department: e.target.value }))}
            >
              <option value="All">All Departments</option>
              {[...(departments || []), 'Unassigned'].map(department => (
                <option key={department} value={department}>{department}</option>
              ))}
            </select>
            <select 
              className="admin-filter-select" 
              value={memberFilters.role} 
              onChange={e => onFilterChange(prev => ({ ...prev, role: e.target.value }))}
            >
              <option value="All">All Roles</option>
              {['superadmin', 'admin', 'manager', 'recruiter', 'employee', 'member'].map(role => (
                <option key={role} value={role}>{role.toUpperCase()}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="admin-card-body">
          <div className="admin-member-grid">
            {filteredUsers.map(user => (
              <MemberCard 
                key={user.id} 
                departments={departments} 
                managers={managers} 
                onAssignManager={onAssignManager} 
                onUpdateUser={onUpdateUser} 
                saving={saving} 
                user={user} 
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

/* Individual Member Card Component */
function MemberCard({ departments, managers, onAssignManager, onUpdateUser, saving, user }) {
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

  const role = displayRole(user)

  return (
    <article className={`admin-member-item ${user.is_active === false ? 'inactive' : ''}`}>
      <div className="admin-member-header-row">
        <div className="admin-member-avatar-ring">
          {initials(user.full_name || user.email)}
        </div>
        <div className="admin-member-info-col">
          <strong className="admin-member-title">{user.full_name || 'Unnamed Member'}</strong>
          <span className="admin-member-email">{user.email}</span>
          <div className="admin-member-badge-row">
            <RolePill role={role} />
            <span className="admin-chip">{user.department || 'Unassigned'}</span>
            <span className="admin-chip">{user.team || 'No group'}</span>
          </div>
        </div>
        <div className="admin-member-action-col">
          <button 
            className={`admin-toggle-switch ${user.is_active === false ? 'off' : 'on'}`} 
            onClick={() => onUpdateUser(user.id, { is_active: user.is_active === false })} 
            type="button"
            title="Toggle account active status"
          >
            <span className="admin-toggle-thumb" />
            <span className="admin-toggle-text">{user.is_active === false ? 'Inactive' : 'Active'}</span>
          </button>
          <button 
            className={`admin-btn-ghost ${expanded ? 'active' : ''}`} 
            type="button" 
            onClick={() => setExpanded(prev => !prev)}
          >
            {expanded ? 'Close' : 'Edit'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="admin-member-drawer">
          <div className="admin-drawer-grid">
            <div className="admin-form-group">
              <label className="admin-label">Role</label>
              <select 
                className="admin-select" 
                value={user.role || 'recruiter'} 
                disabled={saving} 
                onChange={e => onUpdateUser(user.id, { role: e.target.value })}
              >
                {ROLES.map(r => <option key={r} value={r}>{r.toUpperCase()}</option>)}
              </select>
            </div>
            <div className="admin-form-group">
              <label className="admin-label">Team Group</label>
              <input className="admin-input" {...editProps('team', 'Team Name')} />
            </div>
            <div className="admin-form-group">
              <label className="admin-label">Department</label>
              <input className="admin-input" {...editProps('department', 'Department')} list="admin-department-list" />
            </div>
            <div className="admin-form-group">
              <label className="admin-label">Reporting Manager</label>
              <select 
                className="admin-select" 
                value={user.manager_id || ''} 
                disabled={saving} 
                onChange={e => onAssignManager(user, e.target.value)}
              >
                <option value="">Unassigned (Direct Root)</option>
                {managers.filter(m => m.id !== user.id).map(mgr => (
                  <option key={mgr.id} value={mgr.id}>{mgr.full_name || mgr.email}</option>
                ))}
              </select>
            </div>
            <div className="admin-form-group">
              <label className="admin-label">Phone</label>
              <input className="admin-input" {...editProps('phone', '+1 (555) 000-0000')} />
            </div>
            <div className="admin-form-group">
              <label className="admin-label">Extension</label>
              <input className="admin-input" {...editProps('extension', 'x101')} />
            </div>
          </div>
        </div>
      )}
      <datalist id="admin-department-list">{(departments || []).map(department => <option key={department} value={department} />)}</datalist>
    </article>
  )
}

/* Org Chart Tab Component */
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
    <section className="admin-card admin-org-tree-card">
      <div className="admin-card-header admin-tree-toolbar">
        <div>
          <div className="admin-card-title">
            <Icons.OrgChart />
            <span>Interactive Organizational Tree</span>
          </div>
          <p className="admin-card-subtitle">Collapsible reporting hierarchy with real-time performance metrics</p>
        </div>
        <div className="admin-tree-toolbar-actions">
          <div className="admin-search-wrapper">
            <Icons.Search />
            <input 
              className="admin-search-input" 
              value={query} 
              onChange={e => setQuery(e.target.value)} 
              placeholder="Search tree members..." 
            />
          </div>
          <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={expandAll} type="button">Expand All</button>
          <button className="admin-btn admin-btn-secondary admin-btn-sm" onClick={collapseAll} type="button">Collapse All</button>
        </div>
      </div>
      
      <div className="admin-card-body">
        {treeRoots.length === 0 ? (
          <EmptyState title="No organizational hierarchy defined" body="Assign reporting managers under the Members tab to build reporting trees." />
        ) : (
          <div className="org-tree-root-container">
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
    </section>
  )
}

/* Individual Tree Node Component */
function TreeNode({ user, allUsers, userStats, onAssignManager, query, level, expandedNodes, toggleExpand, getDescendantsMatch, saving }) {
  const children = useMemo(() => allUsers.filter(u => u.manager_id === user.id), [allUsers, user.id])
  const term = query.toLowerCase().trim()
  
  const isMatch = !term || (user.full_name || '').toLowerCase().includes(term) || (user.email || '').toLowerCase().includes(term)
  const hasMatchingDescendant = getDescendantsMatch(user.id, term)
  
  if (term && !isMatch && !hasMatchingDescendant) return null
  
  const isOpen = expandedNodes.has(user.id)
  const hasChildren = children.length > 0
  
  const stats = userStats.get(user.id) || { submissions: 0, interviews: 0, hires: 0 }
  const initialsText = initials(user.full_name || user.email)
  
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
    'linear-gradient(135deg, #3b82f6, #6366f1)',
    'linear-gradient(135deg, #8b5cf6, #d946ef)',
    'linear-gradient(135deg, #10b981, #06b6d4)',
    'linear-gradient(135deg, #f59e0b, #ef4444)'
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
          <span className="org-tree-node-spacer" />
        )}
        
        <div className="org-tree-node-avatar" style={{ background: avatarBg }}>
          {initialsText}
        </div>
        
        <div className="org-tree-node-details">
          <span className="org-tree-node-name">{user.full_name || 'Unnamed User'}</span>
          <span className={`org-tree-node-role-badge ${user.department?.toLowerCase() || 'operations'}`}>
            {user.role === 'recruiter' 
              ? `${user.department || ''} Recruiter` 
              : user.role === 'manager'
                ? (user.manager_id ? `${user.department || ''} Account Manager` : `${user.department || ''} Recruitment Manager`)
                : `${user.department || ''} ${user.role}`}
          </span>
          <span className="org-tree-node-email">{user.email}</span>
          {reportsCount > 0 && (
            <span className="org-tree-node-reports-count">
              ({reportsCount} {reportsCount === 1 ? 'direct report' : 'total reports'})
            </span>
          )}
        </div>
        
        <div className="org-tree-node-metrics">
          <span className="org-tree-metric-pill"><b>{stats.submissions}</b> Sub</span>
          <span className="org-tree-metric-pill"><b>{stats.interviews}</b> Int</span>
          <span className="org-tree-metric-pill"><b>{stats.hires}</b> Hires</span>
        </div>
        
        <div className="org-tree-node-actions">
          <select 
            className="admin-select admin-select-sm"
            value={user.manager_id || ''} 
            disabled={saving} 
            onChange={e => onAssignManager(user, e.target.value)}
          >
            <option value="">No manager (Root Node)</option>
            {managerOptions.map(mgr => (
              <option key={mgr.id} value={mgr.id}>
                Reports to: {mgr.full_name || mgr.email}
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

/* Access & Permissions Tab Component */
function PermissionsTab({ onUpdateUser, saving, users }) {
  const admins = users.filter(user => ['admin', 'superadmin'].includes(user.role))
  const staff = users.filter(user => !['admin', 'superadmin'].includes(user.role))

  return (
    <div className="admin-permission-grid">
      <section className="admin-card">
        <div className="admin-card-header">
          <div className="admin-card-title">
            <Icons.Access />
            <span>Administrative Privileges</span>
          </div>
          <span className="admin-card-badge">{admins.length} Executive Users</span>
        </div>
        <div className="admin-card-body">
          <p className="admin-card-description">
            Administrators hold full tenant privileges. Superadmin roles are reserved strictly for account owners.
          </p>
          <div className="admin-member-stack">
            {admins.map(user => (
              <div className="admin-member-perm-row" key={user.id}>
                <div className="admin-member-avatar-ring">
                  {initials(user.full_name || user.email)}
                </div>
                <div className="admin-member-details">
                  <strong className="admin-member-name">{user.full_name || user.email}</strong>
                  <span className="admin-member-sub">{user.email}</span>
                </div>
                <select 
                  className="admin-select" 
                  value={user.role || 'admin'} 
                  disabled={saving || user.role === 'superadmin'} 
                  onChange={e => onUpdateUser(user.id, { role: e.target.value })}
                >
                  <option value="admin">ADMIN</option>
                  <option value="manager">MANAGER</option>
                  <option value="employee">EMPLOYEE</option>
                  <option value="recruiter">RECRUITER</option>
                  {user.role === 'superadmin' && <option value="superadmin">SUPERADMIN</option>}
                </select>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="admin-card">
        <div className="admin-card-header">
          <div className="admin-card-title">
            <Icons.Members />
            <span>Staff Member Promotions</span>
          </div>
        </div>
        <div className="admin-card-body">
          <p className="admin-card-description">
            Elevate staff roles to grant manager supervision or workspace-wide administration privileges.
          </p>
          <div className="admin-member-stack">
            {staff.slice(0, 20).map(user => (
              <div className="admin-member-perm-row" key={user.id}>
                <div className="admin-member-avatar-ring">
                  {initials(user.full_name || user.email)}
                </div>
                <div className="admin-member-details">
                  <strong className="admin-member-name">{user.full_name || user.email}</strong>
                  <span className="admin-member-sub">{user.team || 'No team'} · {user.department || 'No department'}</span>
                </div>
                <select 
                  className="admin-select" 
                  value={user.role || 'employee'} 
                  disabled={saving} 
                  onChange={e => onUpdateUser(user.id, { role: e.target.value })}
                >
                  <option value="employee">EMPLOYEE</option>
                  <option value="recruiter">RECRUITER</option>
                  <option value="manager">MANAGER</option>
                  <option value="admin">ADMIN</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

/* Company / Settings Tab Component */
function OrgSettingsTab({ form, onChange, onSave, saving }) {
  return (
    <section className="admin-card admin-settings-card">
      <div className="admin-card-header">
        <div className="admin-card-title">
          <Icons.Company />
          <span>Organization Governance Settings</span>
        </div>
      </div>
      <div className="admin-card-body">
        <p className="admin-card-description">
          Configure multi-tenant subdomain routing, enterprise email domain verification, branding, and default timezones.
        </p>
        <div className="admin-form-grid">
          <div className="admin-form-group">
            <label className="admin-label">Company Name</label>
            <input className="admin-input" value={form.name} onChange={e => onChange({ ...form, name: e.target.value })} />
          </div>
          <div className="admin-form-group">
            <label className="admin-label">Workspace Slug</label>
            <input className="admin-input" value={form.slug} onChange={e => onChange({ ...form, slug: e.target.value })} />
          </div>
          <div className="admin-form-group">
            <label className="admin-label">Subdomain Prefix</label>
            <input className="admin-input" value={form.subdomain} onChange={e => onChange({ ...form, subdomain: e.target.value.toLowerCase() })} placeholder="e.g. acme" />
          </div>
          <div className="admin-form-group">
            <label className="admin-label">Allowed Email Domain</label>
            <input className="admin-input" value={form.email_domain} onChange={e => onChange({ ...form, email_domain: e.target.value.toLowerCase() })} placeholder="e.g. company.com" />
          </div>
          <div className="admin-form-group">
            <label className="admin-label">Primary Brand Accent Color</label>
            <div className="admin-color-picker-row">
              <input type="color" className="admin-color-input" value={form.primary_color} onChange={e => onChange({ ...form, primary_color: e.target.value })} />
              <input className="admin-input" value={form.primary_color} onChange={e => onChange({ ...form, primary_color: e.target.value })} />
            </div>
          </div>
          <div className="admin-form-group">
            <label className="admin-label">Default Timezone</label>
            <select className="admin-select" value={form.timezone} onChange={e => onChange({ ...form, timezone: e.target.value })}>
              {['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Asia/Calcutta', 'UTC'].map(zone => (
                <option key={zone} value={zone}>{zone}</option>
              ))}
            </select>
          </div>
          <div className="admin-form-group admin-span-full">
            <label className="admin-label">Logo Image URL</label>
            <input className="admin-input" value={form.logo_url} onChange={e => onChange({ ...form, logo_url: e.target.value })} placeholder="https://..." />
          </div>
        </div>
        <div className="admin-form-actions">
          <button className="admin-btn admin-btn-primary" onClick={onSave} disabled={saving}>
            {saving ? 'Saving Changes...' : 'Save Organization Settings'}
          </button>
        </div>
      </div>
    </section>
  )
}

/* Person Mini Row */
function PersonMini({ stats, user }) {
  const role = displayRole(user)
  const subTitle = user.team ? `${user.team}` : user.department ? `${user.department}` : role
  return (
    <div className="admin-person-mini-card">
      <div className="admin-member-avatar-ring">
        {initials(user.full_name || user.email)}
      </div>
      <div className="admin-member-details">
        <strong className="admin-member-name">{user.full_name || user.email}</strong>
        <span className="admin-member-sub">{subTitle}</span>
      </div>
      <RolePill role={role} />
      <MetricStrip stats={stats || { submissions: 0, interviews: 0, hires: 0 }} />
    </div>
  )
}

/* Metric Strip Component */
function MetricStrip({ stats }) {
  return (
    <div className="admin-metric-badge-strip">
      <span className="admin-metric-tag"><b>{stats.submissions || 0}</b> Sub</span>
      <span className="admin-metric-tag"><b>{stats.interviews || 0}</b> Int</span>
      <span className="admin-metric-tag"><b>{stats.hires || 0}</b> Hires</span>
    </div>
  )
}

/* Role Pill Component */
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

/* Stat Card Component with Identical Alignment */
function Stat({ label, value, helper, icon: Icon, accent = 'blue' }) {
  return (
    <div className={`admin-stat-card accent-${accent}`}>
      <div className="admin-stat-top">
        <span className="admin-stat-label">{label}</span>
        {Icon && <div className="admin-stat-icon-wrapper"><Icon /></div>}
      </div>
      <div className="admin-stat-bottom">
        <strong className="admin-stat-value">{value}</strong>
        <span className="admin-stat-helper">{helper}</span>
      </div>
    </div>
  )
}

function EmptyState({ title, body }) {
  return (
    <div className="admin-empty-state">
      <div className="admin-empty-icon">!</div>
      <strong>{title}</strong>
      <span>{body}</span>
    </div>
  )
}
