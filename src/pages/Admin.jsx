import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiRequest, db, organizationApi } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { PageContainer } from '../components/layout/PageContainer'
import {
  Button, Card, CardHeader, KPICard, PageHeader, Tabs, EmptyState, Select, Input, FormField,
  Badge, Avatar, Table, cn, SearchBar, Icon, Switch,
} from '../components/ui'
import { StatusBadge, InfoBanner, ProfileCard } from '../components/admin'

const TABS = ['Overview', 'Org Chart', 'Members', 'Access', 'Company']
const ROLES = ['employee', 'recruiter', 'account_manager', 'recruitment_manager', 'operations_manager', 'manager', 'admin', 'superadmin']

const isSubmissionRecruiter = user => user.role === 'recruiter'

const getAllDescendants = (userId, allUsers) => {
  if (!userId || !allUsers) return []
  const direct = allUsers.filter(u => u.manager_id === userId)
  let result = [...direct]
  for (const child of direct) {
    result = result.concat(getAllDescendants(child.id, allUsers))
  }
  return result
}

export default function Admin() {
  const { profile, switchOrganization } = useAuth()
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
  const [orgForm, setOrgForm] = useState({ name: '', slug: '', subdomain: '', email_domain: '', primary_color: '#0d9488', logo_url: '', timezone: 'America/New_York' })

  const userRole = (profile?.role || '').toLowerCase()
  const isSuperAdmin = userRole === 'superadmin'
  const isAdmin = ['admin', 'superadmin', 'owner'].includes(userRole)
  const orgId = profile?.org_id

  // Superadmin org switching
  const [allOrgs, setAllOrgs] = useState([])
  const [selectedOrgId, setSelectedOrgId] = useState(null)
  const [deletingOrgId, setDeletingOrgId] = useState(null)
  // Platform tab state
  const [platformOp, setPlatformOp] = useState(null) // which danger op is confirming
  const [platformConfirmText, setPlatformConfirmText] = useState('')
  const [platformTargetOrgId, setPlatformTargetOrgId] = useState('')
  const [newOrgForm, setNewOrgForm] = useState({ name: '', slug: '', email_domain: '' })
  const [creatingOrg, setCreatingOrg] = useState(false)

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
          primary_color: orgRes.data.primary_color || '#0d9488',
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

  // Re-sync whenever this tab regains focus, so member/org changes made from another tab or
  // session (e.g. Team Settings) show up here without a manual reload.
  useEffect(() => {
    if (!orgId || !isAdmin) return
    const handleFocus = () => fetchAdminData()
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [fetchAdminData, isAdmin, orgId])

  const teams = useMemo(() => [...new Set(users.map(user => user.team).filter(Boolean))].sort(), [users])
  const departments = useMemo(() => [...new Set(users.map(user => user.department).filter(Boolean))].sort(), [users])
  const managers = useMemo(() => users.filter(user => ['manager', 'admin', 'superadmin'].includes(user.role)), [users])

  const userStats = useMemo(() => {
    const stats = new Map()
    users.forEach(user => {
      const descendants = getAllDescendants(user.id, users)
      const targetUserIds = new Set([user.id, ...descendants.map(d => d.id)])
      const targetNames = new Set([user.full_name, ...descendants.map(d => d.full_name)].filter(Boolean))

      const owned = candidates.filter(candidate => (
        targetUserIds.has(candidate.user_id) ||
        targetUserIds.has(candidate.recruiter_id) ||
        targetNames.has(candidate.recruiter_name) ||
        targetNames.has(candidate.fe_name)
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
        const allReports = getAllDescendants(manager.id, users)
        const directReports = users.filter(u => u.manager_id === manager.id)
        const recruiters = allReports.filter(isSubmissionRecruiter)
        const supportMembers = allReports.filter(member => !['manager', 'admin', 'superadmin'].includes(member.role) && !isSubmissionRecruiter(member))
        const candidateOwners = recruiters
        const ownerIds = new Set(candidateOwners.map(user => user.id))
        const ownerNames = new Set(candidateOwners.map(user => user.full_name || user.email).filter(Boolean))
        const owned = candidates.filter(candidate => (
          ownerIds.has(candidate.user_id) ||
          ownerIds.has(candidate.recruiter_id) ||
          ownerNames.has(candidate.recruiter_name) ||
          ownerNames.has(candidate.fe_name)
        ))

        const isRecruitmentManager = directReports.some(r => r.role === 'manager') || !manager.manager_id

        return {
          key: manager.id,
          team: manager.team || `${manager.full_name} Team`,
          title: isRecruitmentManager
            ? `${manager.full_name} (${manager.department} Recruitment Manager)`
            : `${manager.full_name} (${manager.department} Account Manager)`,
          department: manager.department || 'Unassigned',
          managers: [manager, ...directReports.filter(r => r.role === 'manager')],
          manager,
          recruiters,
          supportMembers,
          admins: [],
          members: [manager, ...allReports],
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
      const activeOrgId = selectedOrgId || orgId
      const response = await apiRequest('/admin/seed-demo-profiles', { method: 'POST', body: { organization_id: activeOrgId } })
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

  // ── Platform Operations (superadmin only) ──
  const handleCreateOrg = async () => {
    if (!newOrgForm.name.trim()) return showToast('Org name is required', 'error')
    setCreatingOrg(true)
    try {
      const { data, error } = await db.from('organizations').insert({
        name: newOrgForm.name.trim(),
        slug: newOrgForm.slug.trim() || newOrgForm.name.toLowerCase().replace(/\s+/g, '-'),
        email_domain: newOrgForm.email_domain.trim() || null,
      })
      if (error) throw error
      const created = Array.isArray(data) ? data[0] : data
      if (created) setAllOrgs(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
      setNewOrgForm({ name: '', slug: '', email_domain: '' })
      showToast(`Organization "${newOrgForm.name.trim()}" created successfully`)
    } catch (err) {
      showToast(err.message || 'Create org failed', 'error')
    } finally {
      setCreatingOrg(false)
    }
  }

  const handlePlatformDanger = async () => {
    const target = allOrgs.find(o => o.id === platformTargetOrgId)
    if (!target) return showToast('Please select an organization first.', 'error')
    if (platformConfirmText !== target.name) {
      return showToast('Org name did not match. Operation cancelled.', 'error')
    }
    setSaving(true)
    try {
      if (platformOp === 'delete_org') {
        if (target.id === orgId) return showToast('Cannot delete your active workspace.', 'error')
        const res = await organizationApi.deleteOrg(target.id)
        setAllOrgs(prev => prev.filter(o => o.id !== target.id))
        if (selectedOrgId === target.id) setSelectedOrgId(orgId)
        showToast(res.message || `Organization "${target.name}" permanently deleted.`)
      } else if (platformOp === 'purge_members') {
        if (target.id === orgId) return showToast('Cannot purge members of active workspace.', 'error')
        const res = await organizationApi.purgeMembers(target.id)
        showToast(res.message || `All members of "${target.name}" removed.`)
      } else if (platformOp === 'purge_candidates') {
        const res = await organizationApi.purgeCandidates(target.id)
        showToast(res.message || `All candidates of "${target.name}" purged.`)
      }
      setPlatformOp(null)
      setPlatformConfirmText('')
      setPlatformTargetOrgId('')
      await fetchAdminData()
    } catch (err) {
      showToast(err.message || 'Operation failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleSwitchMyOrg = async (targetOrg) => {
    if (!profile?.id) return
    setSaving(true)
    try {
      const { error } = await switchOrganization(targetOrg.id)
      if (error) throw error
      showToast(`Switched your profile organization to "${targetOrg.name}". Reloading workspace...`)
      setTimeout(() => {
        window.location.reload()
      }, 800)
    } catch (err) {
      showToast(err.message || 'Failed to switch organization', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (!isAdmin) {
    return (
      <PageContainer>
        <EmptyState icon="lock" title="Admin access required" description="Only authorized admins and superadmins can access this console." />
      </PageContainer>
    )
  }

  const tabItems = [
    ...TABS.map(tab => ({ id: tab, label: tab })),
    ...(isSuperAdmin ? [{ id: 'Platform', label: 'Platform' }] : []),
  ]

  return (
    <PageContainer>
      <PageHeader
        eyebrow="Administration"
        title="Admin Console"
        subtitle={`Platform governance & access management — Workspace: ${org?.name || 'TalentDesk'}`}
        actions={
          <>
            <Button variant="secondary" size="sm" leftIcon="refresh" loading={loading} disabled={saving} onClick={fetchAdminData}>
              Refresh
            </Button>
            <Button size="sm" leftIcon="plus" onClick={seedDemoProfiles} disabled={saving}>
              Add Demo Profiles
            </Button>
          </>
        }
      />

      {/* Superadmin Org Switcher Bar */}
      {isSuperAdmin && allOrgs.length > 1 && (
        <Card padding="sm" className="mt-5 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-text3 shrink-0">
            <Icon name="building" size={12} />
            <span>Platform Organizations</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {allOrgs.map(o => {
              const isActive = (selectedOrgId || orgId) === o.id
              return (
                <button
                  key={o.id}
                  onClick={() => setSelectedOrgId(o.id)}
                  type="button"
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 h-7 rounded-full text-xs font-semibold border transition-colors duration-[var(--duration-fast)]',
                    isActive ? 'bg-accent/12 text-accent border-accent/30' : 'bg-surface2 text-text2 border-border hover:bg-surface3'
                  )}
                >
                  <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', isActive ? 'bg-accent' : 'bg-text3')} />
                  <span>{o.name}</span>
                </button>
              )
            })}
          </div>
        </Card>
      )}

      {/* Identical Uniform KPI Command Cards */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-5">
        <KPICard
          label="Active Members"
          value={analytics.activeUsers}
          helper={`${analytics.totalUsers} total registered`}
          icon="users"
          tone="accent"
        />
        <KPICard
          label="Manager Groups"
          value={analytics.teams}
          helper={`${analytics.managers} active managers`}
          icon="layers"
          tone="ai"
        />
        <KPICard
          label="Submission Recruiters"
          value={analytics.recruiters}
          helper="Recruiting focus"
          icon="users"
          tone="yellow"
        />
        <KPICard
          label="Open Jobs"
          value={analytics.openJobs}
          helper={`${analytics.candidates} candidates in funnel`}
          icon="jobs"
          tone="orange"
        />
        <KPICard
          label="Total Hires"
          value={analytics.hires}
          helper="Organization wide"
          icon="checkCircle"
          tone="green"
        />
      </section>

      {/* Evenly Spaced Segmented Navigation Tabs */}
      <div className="mt-6">
        <Tabs items={tabItems} value={activeTab} onChange={setActiveTab} />
      </div>

      {/* Tab Panels Container */}
      {loading ? (
        <Card className="flex flex-col items-center justify-center gap-3 py-16 text-center mt-6">
          <Icon name="refresh" size={26} className="animate-spin text-accent" />
          <h3 className="text-sm font-bold text-text">Loading Admin Workspace</h3>
          <p className="text-xs text-text3 max-w-sm leading-relaxed">
            Retrieving organization hierarchy, member permissions, performance analytics, and settings...
          </p>
        </Card>
      ) : (
        <main className="pt-6">
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
          {activeTab === 'Platform' && isSuperAdmin && (
            <PlatformTab
              allOrgs={allOrgs}
              orgId={orgId}
              newOrgForm={newOrgForm}
              onNewOrgFormChange={setNewOrgForm}
              onCreateOrg={handleCreateOrg}
              creatingOrg={creatingOrg}
              platformOp={platformOp}
              platformTargetOrgId={platformTargetOrgId}
              platformConfirmText={platformConfirmText}
              onSetPlatformOp={(op, targetId) => { setPlatformOp(op); setPlatformTargetOrgId(targetId || ''); setPlatformConfirmText('') }}
              onPlatformConfirmTextChange={setPlatformConfirmText}
              onExecuteDanger={handlePlatformDanger}
              onSwitchMyOrg={handleSwitchMyOrg}
              saving={saving}
            />
          )}
        </main>
      )}

      {/* Toast Notifications */}
      {toast && (
        <div
          className={cn(
            'fixed bottom-4 right-4 flex items-start gap-2.5 w-[min(360px,calc(100vw-2rem))] bg-surface border border-border rounded-[var(--radius-md)] shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset,var(--shadow-lg)] p-3 animate-[toast-in_var(--duration-base)_var(--ease-standard)]'
          )}
          style={{ zIndex: 'var(--z-toast)' }}
        >
          <Icon name={toast.type === 'error' ? 'xCircle' : 'checkCircle'} size={16} className={cn('shrink-0 mt-0.5', toast.type === 'error' ? 'text-red' : 'text-green')} />
          <p className="text-sm font-semibold text-text min-w-0 flex-1">{toast.msg}</p>
        </div>
      )}
    </PageContainer>
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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Governance Card */}
      <Card>
        <CardHeader title="Workspace Hierarchy & Governance" />
        <div className="flex flex-wrap gap-1.5 mb-4">
          <RolePill role="superadmin" />
          <RolePill role="admin" />
          <RolePill role="manager" />
          <RolePill role="recruiter" />
          <RolePill role="employee" />
        </div>
        <p className="text-xs text-text3 leading-relaxed mb-4">
          Admins oversee global operations. Recruitment Managers supervise Account Managers. Account Managers direct recruiters and monitor candidate submission funnels.
        </p>
        {needsTeamSetup && (
          <Button size="sm" leftIcon="plus" onClick={onSeed} disabled={saving}>
            Create Demo Profiles
          </Button>
        )}
      </Card>

      {/* Administrative Owners Card */}
      <Card>
        <CardHeader title="Administrative Owners" action={<Badge tone="accent" size="sm">{adminUsers.length} Admins</Badge>} />
        <div className="flex flex-col">
          {adminUsers.map(user => (
            <PersonMini key={user.id} stats={userStats.get(user.id)} user={user} />
          ))}
        </div>
      </Card>

      {/* Manager Groups Overview Card */}
      <Card className="lg:col-span-2">
        <CardHeader title="Manager Groups Overview" subtitle={`${teamGroups.length} active groups`} />
        {teamGroups.length === 0 ? (
          <EmptyState icon="users" title="No team structure initialized" description="Click Add Demo Profiles or assign team leadership in the Members tab." />
        ) : (
          <div className="flex flex-col gap-3">
            {teamGroups.slice(0, 8).map(group => {
              const maxSub = Math.max(...teamGroups.map(g => g.submissions), 1)
              const percent = Math.min(Math.round((group.submissions / maxSub) * 100), 100)
              return (
                <div className="flex items-center gap-4" key={group.key}>
                  <div className="min-w-0 w-56 shrink-0">
                    <strong className="block text-[13px] font-semibold text-text truncate">{group.title}</strong>
                    <span className="text-xs text-text3">{group.department} Department · {group.recruiters.length} recruiters</span>
                  </div>
                  <div className="flex-1 h-2 rounded-full bg-surface2 overflow-hidden">
                    <div className="h-full bg-accent rounded-full" style={{ width: `${percent}%` }} />
                  </div>
                  <div className="shrink-0 text-xs text-text3 whitespace-nowrap">
                    <b className="text-text">{group.submissions}</b> Submissions
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Top Performing Groups Card */}
      <Card>
        <CardHeader title="Top Performing Groups" />
        <div className="flex flex-col divide-y divide-border">
          {topTeams.map(group => (
            <div className="py-2.5 flex items-center justify-between gap-3 flex-wrap" key={group.key}>
              <div className="min-w-0">
                <strong className="block text-[13px] font-semibold text-text truncate">{group.title}</strong>
                <span className="text-xs text-text3">{group.members.length} members assigned</span>
              </div>
              <MetricStrip stats={group} />
            </div>
          ))}
        </div>
      </Card>

      {/* Submission Recruiters Card */}
      <Card>
        <CardHeader title="Recruiter Performance Spotlight" />
        <div className="flex flex-col">
          {topRecruiters.map(row => (
            <PersonMini key={row.user.id} stats={row.stats} user={row.user} />
          ))}
        </div>
      </Card>
    </div>
  )
}

/* Members / People Directory Tab Component */
function PeopleTab({ departments, filteredUsers, invite, managers, memberFilters, onAssignManager, onFilterChange, onInviteChange, onSearch, onSendInvite, onUpdateUser, saving, search, teams }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 items-start">
      {/* Invite Member Side Card */}
      <Card>
        <CardHeader title="Invite Team Member" />
        <div className="flex flex-col gap-4">
          <FormField label="Email Address">
            <Input
              value={invite.email}
              onChange={e => onInviteChange({ ...invite, email: e.target.value })}
              placeholder="colleague@company.com"
            />
          </FormField>
          <FormField label="Workspace Role">
            <Select
              value={invite.role}
              onChange={v => onInviteChange({ ...invite, role: v })}
              options={ROLES.filter(r => r !== 'superadmin').map(role => ({ value: role, label: role.toUpperCase() }))}
            />
          </FormField>
          <FormField label="Team Group">
            <Input
              value={invite.team}
              onChange={e => onInviteChange({ ...invite, team: e.target.value })}
              list="admin-team-list"
              placeholder="e.g. Front-End Team"
            />
          </FormField>
          <FormField label="Department">
            <Input
              value={invite.department}
              onChange={e => onInviteChange({ ...invite, department: e.target.value })}
              list="admin-department-list"
              placeholder="e.g. Recruiting"
            />
          </FormField>
          <FormField label="Reporting Manager">
            <Select
              value={invite.manager_id}
              onChange={v => onInviteChange({ ...invite, manager_id: v })}
              options={[{ value: '', label: 'Unassigned (Direct Root)' }, ...managers.map(manager => ({ value: manager.id, label: manager.full_name || manager.email }))]}
            />
          </FormField>
          <Button className="w-full" onClick={onSendInvite} disabled={saving}>
            {saving ? 'Processing...' : 'Send Invitation'}
          </Button>
          <datalist id="admin-team-list">{teams.map(team => <option key={team} value={team} />)}</datalist>
        </div>
      </Card>

      {/* Main Members Directory */}
      <Card>
        <CardHeader
          title="Member Directory"
          subtitle={`${filteredUsers.length} members matching criteria`}
          action={
            <div className="flex items-center gap-2 flex-wrap">
              <SearchBar value={search} onChange={onSearch} placeholder="Search name, email, role, team..." className="w-56" />
              <div className="w-40">
                <Select
                  value={memberFilters.department}
                  onChange={v => onFilterChange(prev => ({ ...prev, department: v }))}
                  options={[{ value: 'All', label: 'All Departments' }, ...[...(departments || []), 'Unassigned'].map(department => ({ value: department, label: department }))]}
                />
              </div>
              <div className="w-36">
                <Select
                  value={memberFilters.role}
                  onChange={v => onFilterChange(prev => ({ ...prev, role: v }))}
                  options={[{ value: 'All', label: 'All Roles' }, ...['superadmin', 'admin', 'manager', 'recruiter', 'employee', 'member'].map(role => ({ value: role, label: role.toUpperCase() }))]}
                />
              </div>
            </div>
          }
        />
        <div className="grid sm:grid-cols-2 gap-3">
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
      </Card>
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
    <article className={cn('rounded-[var(--radius-md)] border border-border bg-surface2/40 p-3.5', user.is_active === false && 'opacity-60')}>
      <div className="flex items-start gap-3">
        <Avatar name={user.full_name || user.email} />
        <div className="min-w-0 flex-1">
          <strong className="block text-[13px] font-semibold text-text truncate">{user.full_name || 'Unnamed Member'}</strong>
          <span className="block text-xs text-text3 truncate">{user.email}</span>
          <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
            <RolePill role={role} />
            <Badge tone="neutral" size="sm">{user.department || 'Unassigned'}</Badge>
            <Badge tone="neutral" size="sm">{user.team || 'No group'}</Badge>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <StatusBadge status={user.is_active === false ? 'inactive' : 'active'} />
          <Button
            size="sm"
            variant={expanded ? 'secondary' : 'ghost'}
            type="button"
            onClick={() => setExpanded(prev => !prev)}
          >
            {expanded ? 'Close' : 'Edit'}
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3.5 pt-3.5 border-t border-border grid sm:grid-cols-2 gap-3">
          <FormField label="Active status" className="sm:col-span-2">
            <Switch
              checked={user.is_active !== false}
              onChange={v => onUpdateUser(user.id, { is_active: v })}
              label={user.is_active === false ? 'Inactive' : 'Active'}
            />
          </FormField>
          <FormField label="Role">
            <Select
              value={user.role || 'recruiter'}
              disabled={saving}
              onChange={v => onUpdateUser(user.id, { role: v })}
              options={ROLES.map(r => ({ value: r, label: r.toUpperCase() }))}
            />
          </FormField>
          <FormField label="Team Group">
            <Input {...editProps('team', 'Team Name')} />
          </FormField>
          <FormField label="Department">
            <Input {...editProps('department', 'Department')} list="admin-department-list" />
          </FormField>
          <FormField label="Reporting Manager">
            <Select
              value={user.manager_id || ''}
              disabled={saving}
              onChange={v => onAssignManager(user, v)}
              options={[{ value: '', label: 'Unassigned (Direct Root)' }, ...managers.filter(m => m.id !== user.id).map(mgr => ({ value: mgr.id, label: mgr.full_name || mgr.email }))]}
            />
          </FormField>
          <FormField label="Phone">
            <Input {...editProps('phone', '+1 (555) 000-0000')} />
          </FormField>
          <FormField label="Extension">
            <Input {...editProps('extension', 'x101')} />
          </FormField>
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
    <Card>
      <CardHeader
        title="Interactive Organizational Tree"
        subtitle="Collapsible reporting hierarchy with real-time performance metrics"
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <SearchBar value={query} onChange={setQuery} placeholder="Search tree members..." className="w-56" />
            <Button variant="secondary" size="sm" onClick={expandAll} type="button">Expand All</Button>
            <Button variant="secondary" size="sm" onClick={collapseAll} type="button">Collapse All</Button>
          </div>
        }
      />

      {treeRoots.length === 0 ? (
        <EmptyState icon="layers" title="No organizational hierarchy defined" description="Assign reporting managers under the Members tab to build reporting trees." />
      ) : (
        <div className="flex flex-col gap-1">
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
    </Card>
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
    'linear-gradient(135deg, var(--accent), var(--accent2))',
    'linear-gradient(135deg, var(--ai), #d946ef)',
    'linear-gradient(135deg, var(--green), #06b6d4)',
    'linear-gradient(135deg, var(--yellow), var(--red))'
  ]
  const avatarBg = avatarGradients[(user.full_name || '').charCodeAt(0) % avatarGradients.length]
  const managerOptions = allUsers.filter(u => ['manager', 'admin', 'superadmin'].includes(u.role) && u.id !== user.id)

  const roleLabel = user.role === 'recruiter'
    ? `${user.department || ''} Recruiter`
    : user.role === 'manager'
      ? ((allUsers.some(u => u.manager_id === user.id && u.role === 'manager') || !user.manager_id) ? `${user.department || ''} Recruitment Manager` : `${user.department || ''} Account Manager`)
      : `${user.department || ''} ${user.role}`

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2.5 py-2 border-b border-border/60" style={{ paddingLeft: level * 24 }}>
        {hasChildren ? (
          <button
            className="shrink-0 w-5 h-5 flex items-center justify-center text-text3 hover:text-text transition-colors"
            onClick={() => toggleExpand(user.id)}
            type="button"
          >
            <Icon name="chevronRight" size={13} className={cn('transition-transform duration-[var(--duration-fast)]', isOpen && 'rotate-90')} />
          </button>
        ) : (
          <span className="shrink-0 w-5 h-5" />
        )}

        <span className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: avatarBg }}>
          {initials(user.full_name || user.email)}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-text truncate">{user.full_name || 'Unnamed User'}</span>
            <Badge tone="neutral" size="sm">{roleLabel}</Badge>
            {reportsCount > 0 && (
              <span className="text-[11px] text-text3">
                ({reportsCount} {reportsCount === 1 ? 'direct report' : 'total reports'})
              </span>
            )}
          </div>
          <span className="text-xs text-text3 truncate">{user.email}</span>
        </div>

        <div className="shrink-0 hidden sm:block">
          <MetricStrip stats={stats} />
        </div>

        <div className="shrink-0 w-48">
          <Select
            size="sm"
            value={user.manager_id || ''}
            disabled={saving}
            onChange={v => onAssignManager(user, v)}
            options={[{ value: '', label: 'No manager (Root Node)' }, ...managerOptions.map(mgr => ({ value: mgr.id, label: `Reports to: ${mgr.full_name || mgr.email}` }))]}
          />
        </div>
      </div>

      {hasChildren && isOpen && (
        <div className="flex flex-col">
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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader title="Administrative Privileges" action={<Badge tone="accent" size="sm">{admins.length} Executive Users</Badge>} />
        <p className="text-xs text-text3 leading-relaxed mb-3">
          Administrators hold full tenant privileges. Superadmin roles are reserved strictly for account owners.
        </p>
        <div className="flex flex-col divide-y divide-border">
          {admins.map(user => (
            <ProfileCard
              key={user.id}
              name={user.full_name || user.email}
              email={user.email}
              actions={
                <div className="w-40">
                  <Select
                    size="sm"
                    value={user.role || 'admin'}
                    disabled={saving || user.role === 'superadmin'}
                    onChange={v => onUpdateUser(user.id, { role: v })}
                    options={[
                      { value: 'admin', label: 'ADMIN' },
                      { value: 'manager', label: 'MANAGER' },
                      { value: 'employee', label: 'EMPLOYEE' },
                      { value: 'recruiter', label: 'RECRUITER' },
                      ...(user.role === 'superadmin' ? [{ value: 'superadmin', label: 'SUPERADMIN' }] : []),
                    ]}
                  />
                </div>
              }
            />
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader title="Staff Member Promotions" />
        <p className="text-xs text-text3 leading-relaxed mb-3">
          Elevate staff roles to grant manager supervision or workspace-wide administration privileges.
        </p>
        <div className="flex flex-col divide-y divide-border">
          {staff.slice(0, 20).map(user => (
            <ProfileCard
              key={user.id}
              name={user.full_name || user.email}
              email={user.email}
              department={user.team || 'No team'}
              team={user.department || 'No department'}
              actions={
                <div className="w-40">
                  <Select
                    size="sm"
                    value={user.role || 'employee'}
                    disabled={saving}
                    onChange={v => onUpdateUser(user.id, { role: v })}
                    options={[
                      { value: 'employee', label: 'EMPLOYEE' },
                      { value: 'recruiter', label: 'RECRUITER' },
                      { value: 'manager', label: 'MANAGER' },
                      { value: 'admin', label: 'ADMIN' },
                    ]}
                  />
                </div>
              }
            />
          ))}
        </div>
      </Card>
    </div>
  )
}

/* Company / Settings Tab Component */
function OrgSettingsTab({ form, onChange, onSave, saving }) {
  return (
    <Card>
      <CardHeader title="Organization Governance Settings" />
      <p className="text-xs text-text3 leading-relaxed mb-4">
        Configure multi-tenant subdomain routing, enterprise email domain verification, branding, and default timezones.
      </p>
      <div className="grid sm:grid-cols-2 gap-4">
        <FormField label="Company Name">
          <Input value={form.name} onChange={e => onChange({ ...form, name: e.target.value })} />
        </FormField>
        <FormField label="Workspace Slug">
          <Input value={form.slug} onChange={e => onChange({ ...form, slug: e.target.value })} />
        </FormField>
        <FormField label="Subdomain Prefix">
          <Input value={form.subdomain} onChange={e => onChange({ ...form, subdomain: e.target.value.toLowerCase() })} placeholder="e.g. acme" />
        </FormField>
        <FormField label="Allowed Email Domain">
          <Input value={form.email_domain} onChange={e => onChange({ ...form, email_domain: e.target.value.toLowerCase() })} placeholder="e.g. company.com" />
        </FormField>
        <FormField label="Primary Brand Accent Color">
          <div className="flex items-center gap-2">
            <Input type="color" value={form.primary_color} onChange={e => onChange({ ...form, primary_color: e.target.value })} className="w-11 h-9 p-1 shrink-0" />
            <Input value={form.primary_color} onChange={e => onChange({ ...form, primary_color: e.target.value })} />
          </div>
        </FormField>
        <FormField label="Default Timezone">
          <Select
            value={form.timezone}
            onChange={v => onChange({ ...form, timezone: v })}
            options={['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Asia/Calcutta', 'UTC'].map(zone => ({ value: zone, label: zone }))}
          />
        </FormField>
        <FormField label="Logo Image URL" className="sm:col-span-2">
          <Input value={form.logo_url} onChange={e => onChange({ ...form, logo_url: e.target.value })} placeholder="https://..." />
        </FormField>
      </div>
      <div className="flex justify-end mt-5">
        <Button onClick={onSave} disabled={saving}>
          {saving ? 'Saving Changes...' : 'Save Organization Settings'}
        </Button>
      </div>
    </Card>
  )
}

/* Person Mini Row */
function PersonMini({ stats, user }) {
  const role = displayRole(user)
  const subTitle = user.team ? `${user.team}` : user.department ? `${user.department}` : role
  return (
    <div className="flex items-center gap-3 py-2.5 border-b border-border last:border-0 flex-wrap">
      <Avatar name={user.full_name || user.email} size="sm" />
      <div className="min-w-0 flex-1">
        <strong className="block text-[13px] font-semibold text-text truncate">{user.full_name || user.email}</strong>
        <span className="block text-xs text-text3 truncate">{subTitle}</span>
      </div>
      <RolePill role={role} />
      <MetricStrip stats={stats || { submissions: 0, interviews: 0, hires: 0 }} />
    </div>
  )
}

/* Metric Strip Component */
function MetricStrip({ stats }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <Badge tone="accent" size="sm">{stats.submissions || 0} Sub</Badge>
      <Badge tone="ai" size="sm">{stats.interviews || 0} Int</Badge>
      <Badge tone="green" size="sm">{stats.hires || 0} Hires</Badge>
    </div>
  )
}

const ROLE_TONE = {
  superadmin: 'ai',
  admin: 'accent',
  manager: 'green',
  recruitment_manager: 'green',
  account_manager: 'green',
  operations_manager: 'green',
  recruiter: 'yellow',
  employee: 'neutral',
  member: 'neutral',
}

/* Role Pill Component */
function RolePill({ role }) {
  const normRole = (role || 'recruiter').toLowerCase().replace(/\s+/g, '_')
  const formattedText = (role || 'recruiter').replace('_', ' ')
  return <Badge tone={ROLE_TONE[normRole] || 'neutral'} size="sm">{formattedText}</Badge>
}

function displayRole(user) {
  if (!user) return 'recruiter'
  if (user.role === 'recruitment_manager') return 'recruitment manager'
  if (user.role === 'account_manager') return 'account manager'
  if (user.role === 'operations_manager') return 'operations manager'
  if (user.role === 'employee') return 'employee'
  if (user.role === 'recruiter' && user.department !== 'Recruiting') return 'member'
  return user.role ? user.role.replace('_', ' ') : 'recruiter'
}

function initials(value = '') {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return value.slice(0, 2).toUpperCase()
}

/* ========================================================
   PLATFORM TAB — Superadmin-only Org Management Console
   ======================================================== */
function PlatformTab({
  allOrgs, orgId, newOrgForm, onNewOrgFormChange, onCreateOrg, creatingOrg,
  platformOp, platformTargetOrgId, platformConfirmText,
  onSetPlatformOp, onPlatformConfirmTextChange, onExecuteDanger, onSwitchMyOrg, saving,
}) {
  const DANGER_OPS = [
    {
      id: 'delete_org',
      label: 'Delete Organization',
      icon: '🗑️',
      color: 'red',
      description: 'Permanently removes the organization and all associated settings. This cannot be undone.',
      warning: 'Members and candidates of this org may become orphaned. Remove them first.',
      btnLabel: 'Delete Organization',
    },
    {
      id: 'purge_members',
      label: 'Purge All Members',
      icon: '👥',
      color: 'orange',
      description: 'Removes all user profiles linked to the selected organization from the system.',
      warning: 'This will sign out and permanently delete all member accounts in this org.',
      btnLabel: 'Purge All Members',
    },
    {
      id: 'purge_candidates',
      label: 'Purge All Candidates',
      icon: '📋',
      color: 'amber',
      description: 'Deletes all candidate records, pipeline entries, and submission data for this org.',
      warning: 'All pipeline history, interview notes, and candidate data will be gone permanently.',
      btnLabel: 'Purge All Candidates',
    },
  ]

  const activeOp = DANGER_OPS.find(op => op.id === platformOp)
  const targetOrg = allOrgs.find(o => o.id === platformTargetOrgId)
  const canExecute = platformConfirmText === targetOrg?.name && platformTargetOrgId

  return (
    <div className="flex flex-col gap-6">

      {/* ── Section 1: Platform Overview ── */}
      <Card>
        <CardHeader title="Platform Organization Overview" action={<Badge tone="accent" size="sm">{allOrgs.length} Organizations</Badge>} />
        <Table
          columns={[
            {
              key: 'name',
              header: 'Organization',
              render: o => (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-accent shrink-0" />
                  <strong className="text-text truncate">{o.name}</strong>
                  {o.id === orgId && <Badge tone="accent" size="sm">Your Org</Badge>}
                </div>
              ),
            },
            { key: 'slug', header: 'Slug', render: o => o.slug || '—' },
            { key: 'email_domain', header: 'Email Domain', render: o => o.email_domain || '—' },
            { key: 'status', header: 'Status', render: () => <StatusBadge status="active" /> },
            {
              key: 'action',
              header: 'Action',
              align: 'right',
              render: o => (
                o.id !== orgId ? (
                  <Button type="button" variant="secondary" size="sm" onClick={() => onSwitchMyOrg(o)} disabled={saving}>
                    Set as My Org
                  </Button>
                ) : (
                  <span className="text-xs font-semibold text-accent">Active Workspace</span>
                )
              ),
            },
          ]}
          data={allOrgs}
          getRowId={o => o.id}
        />
      </Card>

      {/* ── Section 2: Create New Organization ── */}
      <Card>
        <CardHeader title="Create New Organization" />
        <div className="grid sm:grid-cols-3 gap-4">
          <FormField label="Organization Name" required>
            <Input
              placeholder="e.g. Acme Corp"
              value={newOrgForm.name}
              onChange={e => onNewOrgFormChange({ ...newOrgForm, name: e.target.value })}
            />
          </FormField>
          <FormField label="Slug" hint="Auto-generated if blank">
            <Input
              placeholder="e.g. acme-corp"
              value={newOrgForm.slug}
              onChange={e => onNewOrgFormChange({ ...newOrgForm, slug: e.target.value })}
            />
          </FormField>
          <FormField label="Email Domain" hint="Optional">
            <Input
              placeholder="e.g. acmecorp.com"
              value={newOrgForm.email_domain}
              onChange={e => onNewOrgFormChange({ ...newOrgForm, email_domain: e.target.value })}
            />
          </FormField>
        </div>
        <div className="mt-4">
          <Button
            type="button"
            leftIcon="plus"
            onClick={onCreateOrg}
            disabled={!newOrgForm.name.trim()}
            loading={creatingOrg}
          >
            {creatingOrg ? 'Creating…' : 'Create Organization'}
          </Button>
        </div>
      </Card>

      {/* ── Section 3: Danger Zone ── */}
      <Card className="border-red/25">
        <CardHeader
          title={<span className="inline-flex items-center gap-1.5 text-red"><Icon name="alertCircle" size={14} />Danger Zone — Irreversible Operations</span>}
          action={<Badge tone="red" size="sm">Superadmin Only</Badge>}
        />
        <InfoBanner tone="warn" className="mb-4">
          These operations are permanent and cannot be undone. All actions require you to select a target organization
          and type its exact name as confirmation before executing.
        </InfoBanner>

        {/* Danger Op Cards */}
        <div className="grid md:grid-cols-3 gap-3">
          {DANGER_OPS.map(op => (
            <div key={op.id} className={cn('rounded-[var(--radius-md)] border p-3.5 flex flex-col gap-3', platformOp === op.id ? 'border-red/40 bg-red/5' : 'border-border')}>
              <div className="flex items-start gap-2.5">
                <div className="text-xl leading-none shrink-0">{op.icon}</div>
                <div className="min-w-0">
                  <strong className="block text-[13px] font-semibold text-text">{op.label}</strong>
                  <p className="text-xs text-text3 mt-1 leading-relaxed">{op.description}</p>
                  <p className="text-xs text-red mt-1.5 leading-relaxed">⚠️ {op.warning}</p>
                </div>
              </div>
              <Button
                type="button"
                variant={platformOp === op.id ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => onSetPlatformOp(platformOp === op.id ? null : op.id, platformTargetOrgId)}
              >
                {platformOp === op.id ? 'Cancel' : 'Configure →'}
              </Button>

              {/* Expanded Confirmation Panel */}
              {platformOp === op.id && (
                <div className="flex flex-col gap-3 pt-3 border-t border-border">
                  <FormField label="Step 1 — Select Target Organization">
                    <Select
                      size="sm"
                      value={platformTargetOrgId}
                      onChange={v => onSetPlatformOp(platformOp, v)}
                      placeholder="— Select an organization —"
                      options={allOrgs
                        .filter(o => op.id !== 'delete_org' || o.id !== orgId)
                        .map(o => ({ value: o.id, label: `${o.name}${o.id === orgId ? ' (your org)' : ''}` }))}
                    />
                  </FormField>
                  {platformTargetOrgId && (
                    <FormField label={<>Step 2 — Type <strong>&quot;{targetOrg?.name}&quot;</strong> to confirm</>}>
                      <Input
                        size="sm"
                        className={canExecute ? 'border-green focus:border-green' : ''}
                        placeholder={`Type: ${targetOrg?.name}`}
                        value={platformConfirmText}
                        onChange={e => onPlatformConfirmTextChange(e.target.value)}
                      />
                    </FormField>
                  )}
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    leftIcon="trash"
                    onClick={onExecuteDanger}
                    disabled={!canExecute || saving}
                  >
                    {saving ? 'Executing…' : `Execute: ${op.btnLabel}`}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
