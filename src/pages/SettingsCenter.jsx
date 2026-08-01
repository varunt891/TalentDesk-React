import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { organizationApi, db } from '../lib/api'
import { PageContainer } from '../components/layout/PageContainer'
import {
  Button, Card, CardHeader, KPICard, PageHeader, Tabs, EmptyState, Select, Input, Textarea,
  Switch, FormField, Badge, Avatar, Modal, useToast, cn, SearchBar,
} from '../components/ui'
import { SettingsCard, StatusBadge, InfoBanner, ProfileCard, PermissionMatrix } from '../components/admin'
import { ROLES, MODULES, getRole } from '../lib/admin/permissions'
import { useOrgPreferences } from '../lib/admin/orgPreferences'
import { useNotificationPreferences, NOTIFICATION_CATEGORIES } from '../lib/admin/notificationPreferences'
import { fetchNotifications, markNotificationRead, markNotificationsRead, deleteNotification } from '../lib/admin/notifications'
import { fetchActivityLog, fetchAuditLog } from '../lib/admin/activity'
import { useAIGovernance } from '../lib/ai/governance'
import { SETTINGS_TAB_FLAG } from '../lib/admin/settingsNav'

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'organization', label: 'Organization' },
  { id: 'teams', label: 'Teams' },
  { id: 'users', label: 'Users' },
  { id: 'roles', label: 'Roles & Permissions' },
  { id: 'ai', label: 'AI' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'workspace', label: 'Workspace' },
  { id: 'activity', label: 'Audit & Activity' },
  { id: 'security', label: 'Security' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'billing', label: 'Billing' },
]

// The real, backend-validated role vocabulary (server/src/routes/organization.routes.js's
// allowedRoles list) — used for the actual invite/role-change controls. This is a superset of
// src/lib/admin/permissions.js's ROLES, which models only the brief's six example roles for the
// permission-matrix architecture; existing members with a role outside that curated six (OWNER,
// ACCOUNT_MANAGER, MANAGER) must remain assignable here.
const ALL_ROLES = [
  { value: 'OWNER', label: 'Owner', desc: 'Full billing, user, and workspace administration' },
  { value: 'ADMIN', label: 'Admin', desc: 'Manage users, team members, and view reports' },
  { value: 'RECRUITMENT_MANAGER', label: 'Recruitment Manager', desc: 'Manage recruiters, requisitions, and teams' },
  { value: 'HR_MANAGER', label: 'HR Manager', desc: 'Manage HR team and hiring workflow' },
  { value: 'HR_TEAM', label: 'HR Team Member', desc: 'HR operations reporting to HR Manager' },
  { value: 'ACCOUNT_MANAGER', label: 'Account Manager', desc: 'Client relations and team job requisitions' },
  { value: 'RECRUITER', label: 'Recruiter', desc: 'Manage candidates, jobs, submissions, and AI tools' },
  { value: 'MANAGER', label: 'Manager', desc: 'Departmental management' },
  { value: 'VIEWER', label: 'Viewer', desc: 'Read-only access across company records' },
]

const SUBSCRIPTION_PLAN_OPTIONS = [
  { value: 'Starter', label: 'Starter', desc: '250 Candidates | 250 AI Credits' },
  { value: 'Growth', label: 'Growth', desc: '500 Candidates | 1,000 AI Credits' },
  { value: 'Enterprise', label: 'Enterprise', desc: '2,500 Candidates | 5,000 AI Credits' },
]

const PLAN_TIERS = [
  { id: 'Starter', label: 'Starter', candidates: '250 candidates', credits: '250 AI credits/mo', seats: 'Up to 3 users' },
  { id: 'Growth', label: 'Growth', candidates: '500 candidates', credits: '1,000 AI credits/mo', seats: 'Up to 15 users' },
  { id: 'Enterprise', label: 'Enterprise', candidates: '2,500 candidates', credits: '5,000 AI credits/mo', seats: 'Unlimited users' },
]

const TIMEZONE_OPTIONS = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Sao_Paulo',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Calcutta', 'Asia/Dubai', 'Asia/Singapore',
  'Asia/Shanghai', 'Asia/Tokyo', 'Australia/Sydney', 'UTC',
].map(tz => ({ value: tz, label: tz.replace(/_/g, ' ') }))

const CURRENCY_OPTIONS = ['USD', 'EUR', 'GBP', 'INR', 'AUD', 'CAD', 'SGD', 'AED', 'JPY'].map(c => ({ value: c, label: c }))

const DATE_FORMAT_OPTIONS = [
  { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' },
  { value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' },
  { value: 'YYYY-MM-DD', label: 'YYYY-MM-DD' },
]

const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'hi', label: 'Hindi' },
]

function isSuperAdminRole(role) { return ['superadmin', 'SUPERADMIN'].includes(role) }
function isOwnerOrAdminRole(role) { return isSuperAdminRole(role) || ['admin', 'owner', 'ADMIN', 'OWNER'].includes(role) }

/**
 * The unified enterprise Settings experience — Phase 6. Replaces the two
 * separate OrgSettings.jsx / TeamManagement.jsx pages with one tabbed
 * workspace so admin tasks live in one predictable place. Both original
 * pages now render this component with a different `initialTab` (see their
 * files) so existing sidebar entries / bookmarked page ids keep working
 * unchanged. Reuses every existing organizationApi/db call exactly as the
 * two prior pages did — no backend or schema changes.
 */
export default function SettingsCenter({ initialTab = 'general', onNavigate }) {
  const { user, profile, organization, refreshOrg, switchOrganization } = useAuth()
  const { toast } = useToast()

  const orgId = organization?.id || profile?.org_id
  const userId = user?.id
  const role = profile?.role || 'recruiter'
  const isSuperAdmin = isSuperAdminRole(role)
  const isOwnerOrAdmin = isOwnerOrAdminRole(role)

  const [activeTab, setActiveTab] = useState(initialTab)
  useEffect(() => {
    const flag = sessionStorage.getItem(SETTINGS_TAB_FLAG)
    if (flag) {
      sessionStorage.removeItem(SETTINGS_TAB_FLAG)
      setActiveTab(flag)
    }
  }, [])

  const [org, setOrg] = useState(null)
  const [allOrgs, setAllOrgs] = useState([])
  const [members, setMembers] = useState([])
  const [invitations, setInvitations] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [switchingId, setSwitchingId] = useState(null)

  const [orgForm, setOrgForm] = useState({
    name: '', domain: '', website: '', logo_url: '', industry: '', company_size: '', timezone: 'Asia/Calcutta',
  })

  const { preferences: orgPrefs, updatePreferences: updateOrgPrefs } = useOrgPreferences(orgId)
  const { preferences: notifPrefs, updatePreferences: updateNotifPrefs } = useNotificationPreferences(userId)

  const [notifications, setNotifications] = useState([])
  const [notifLoading, setNotifLoading] = useState(false)
  const [activityEvents, setActivityEvents] = useState([])
  const [auditEvents, setAuditEvents] = useState([])
  const [activityLoading, setActivityLoading] = useState(false)

  const [showOnboardModal, setShowOnboardModal] = useState(false)
  const [onboardForm, setOnboardForm] = useState({
    name: '', domain: '', website: '', industry: 'Staffing & Recruiting', subscription_plan: 'Growth',
    candidate_limit: 500, ai_credit_limit: 1000, owner_name: '', owner_email: '',
  })
  const [onboarding, setOnboarding] = useState(false)
  const [onboardInviteUrl, setOnboardInviteUrl] = useState('')

  const [showInviteModal, setShowInviteModal] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('RECRUITER')
  const [sendingInvite, setSendingInvite] = useState(false)
  const [createdInviteUrl, setCreatedInviteUrl] = useState('')

  const loadOrgDetails = useCallback(async () => {
    try {
      const res = await organizationApi.getOrg()
      if (res.data) {
        setOrg(res.data)
        setOrgForm({
          name: res.data.name || '',
          domain: res.data.domain || res.data.email_domain || '',
          website: res.data.website || '',
          logo_url: res.data.logo_url || '',
          industry: res.data.industry || 'Staffing & Recruiting',
          company_size: res.data.company_size || '10-50',
          timezone: res.data.timezone || 'Asia/Calcutta',
        })
      }
    } catch (err) {
      toast({ tone: 'error', title: 'Failed to load organization', description: err.message })
    }
  }, [toast])

  const loadAllOrgs = useCallback(async () => {
    try {
      const res = await organizationApi.getAllOrgs()
      if (res.data) setAllOrgs(res.data)
    } catch {
      /* superadmin-only endpoint — ignore for non-superadmins */
    }
  }, [])

  const loadMembers = useCallback(async () => {
    try {
      const [membersRes, invitesRes] = await Promise.all([organizationApi.getMembers(), organizationApi.getInvitations()])
      if (membersRes.data) setMembers(membersRes.data)
      if (invitesRes.data) setInvitations(invitesRes.data)
    } catch (err) {
      toast({ tone: 'error', title: 'Failed to load team', description: err.message })
    }
  }, [toast])

  useEffect(() => {
    setLoading(true)
    Promise.all([loadOrgDetails(), loadMembers(), isSuperAdmin ? loadAllOrgs() : Promise.resolve()]).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Re-sync with the backend whenever this tab regains focus, so changes made elsewhere
  // (e.g. a superadmin purging/deleting this org from the admin panel) show up without a manual reload.
  useEffect(() => {
    const handleFocus = () => {
      loadOrgDetails()
      loadMembers()
      if (isSuperAdmin) loadAllOrgs()
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [loadOrgDetails, loadMembers, loadAllOrgs, isSuperAdmin])

  const loadNotifications = useCallback(async () => {
    setNotifLoading(true)
    const data = await fetchNotifications(userId)
    setNotifications(data)
    setNotifLoading(false)
  }, [userId])

  useEffect(() => {
    if (activeTab === 'notifications' && userId) loadNotifications()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, userId])

  const loadActivity = useCallback(async () => {
    setActivityLoading(true)
    const [a, b] = await Promise.all([fetchActivityLog(150), fetchAuditLog(150)])
    setActivityEvents(a)
    setAuditEvents(b)
    setActivityLoading(false)
  }, [])

  useEffect(() => {
    if (activeTab === 'activity') loadActivity()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  const handleSwitchWorkspace = async (targetOrgId, targetName) => {
    setSwitchingId(targetOrgId)
    try {
      const res = await switchOrganization(targetOrgId)
      if (res?.data) {
        toast({ tone: 'success', title: `Switched to ${targetName}` })
        await Promise.all([loadOrgDetails(), loadAllOrgs(), loadMembers()])
      }
    } catch (err) {
      toast({ tone: 'error', title: 'Failed to switch workspace', description: err.message })
    } finally {
      setSwitchingId(null)
    }
  }

  const handleSaveOrg = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await organizationApi.updateOrg(orgForm)
      if (res.data) {
        setOrg(prev => ({ ...prev, ...res.data }))
        refreshOrg(res.data)
        toast({ tone: 'success', title: 'Organization profile updated' })
      }
    } catch (err) {
      toast({ tone: 'error', title: 'Failed to update organization', description: err.message })
    } finally {
      setSaving(false)
    }
  }

  const handleOnboardSubmit = async (e) => {
    e.preventDefault()
    setOnboarding(true)
    try {
      const res = await organizationApi.onboardOrg(onboardForm)
      if (res.data) {
        toast({ tone: 'success', title: `Organization "${res.data.name}" onboarded` })
        if (res.invite_url) setOnboardInviteUrl(res.invite_url)
        else setShowOnboardModal(false)
        loadAllOrgs()
      }
    } catch (err) {
      toast({ tone: 'error', title: 'Failed to onboard organization', description: err.message })
    } finally {
      setOnboarding(false)
    }
  }

  const handlePlanChange = async (targetPlan) => {
    setSaving(true)
    try {
      const res = await organizationApi.updateOrg({ subscription_plan: targetPlan })
      if (res.data) {
        setOrg(prev => ({ ...prev, ...res.data }))
        refreshOrg(res.data)
        toast({ tone: 'success', title: `Subscription plan updated to ${targetPlan}` })
      }
    } catch (err) {
      toast({ tone: 'error', title: 'Failed to update plan', description: err.message })
    } finally {
      setSaving(false)
    }
  }

  const handleRoleChange = async (memberId, newRole) => {
    try {
      const res = await organizationApi.updateMemberRole(memberId, newRole)
      if (res.data) {
        setMembers(prev => prev.map(m => (m.id === memberId ? { ...m, role: newRole } : m)))
        toast({ tone: 'success', title: 'Role updated' })
      }
    } catch (err) {
      toast({ tone: 'error', title: 'Failed to update role', description: err.message })
    }
  }

  const handleToggleActive = async (profileId, active) => {
    const { error } = await db.from('profiles').update({ is_active: active }).eq('id', profileId)
    if (error) {
      toast({ tone: 'error', title: 'Failed to update status', description: error.message })
      return
    }
    setMembers(prev => prev.map(m => (m.user_id === profileId ? { ...m, is_active: active } : m)))
    toast({ tone: 'success', title: active ? 'Member activated' : 'Member deactivated' })
  }

  const handleRemoveMember = async (memberId, name) => {
    if (!window.confirm(`Remove ${name || 'this member'} from the organization?`)) return
    try {
      await organizationApi.removeMember(memberId)
      setMembers(prev => prev.filter(m => m.id !== memberId))
      toast({ tone: 'success', title: 'Member removed' })
    } catch (err) {
      toast({ tone: 'error', title: 'Failed to remove member', description: err.message })
    }
  }

  const handleSendInvite = async (e) => {
    e.preventDefault()
    setSendingInvite(true)
    try {
      const res = await organizationApi.createInvitation(inviteEmail, inviteRole)
      if (res.data) {
        setInvitations(prev => [res.data, ...prev])
        setCreatedInviteUrl(res.invite_url)
        toast({ tone: 'success', title: `Invitation created for ${inviteEmail}` })
      }
    } catch (err) {
      toast({ tone: 'error', title: 'Failed to create invitation', description: err.message })
    } finally {
      setSendingInvite(false)
    }
  }

  const handleRevokeInvite = async (inviteId) => {
    try {
      await organizationApi.revokeInvitation(inviteId)
      setInvitations(prev => prev.filter(i => i.id !== inviteId))
      toast({ tone: 'success', title: 'Invitation revoked' })
    } catch (err) {
      toast({ tone: 'error', title: 'Failed to revoke invitation', description: err.message })
    }
  }

  const handleMarkRead = async (id) => {
    await markNotificationRead(id)
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)))
  }

  const handleMarkAllRead = async () => {
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id)
    if (unreadIds.length === 0) return
    await markNotificationsRead(unreadIds)
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  const handleDeleteNotification = async (id) => {
    await deleteNotification(id)
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  return (
    <PageContainer>
      <PageHeader eyebrow="Administration" title="Settings" subtitle="Organization, team, role, and workspace configuration for TalentDesk." />

      <div className="mt-5">
        <Tabs items={TABS} value={activeTab} onChange={setActiveTab} />
      </div>

      <div className="pt-6">
        {loading ? (
          <div className="text-sm text-text3 py-16 text-center">Loading settings...</div>
        ) : (
          <>
            {activeTab === 'general' && (
              <GeneralTab
                org={org} allOrgs={allOrgs} isSuperAdmin={isSuperAdmin} switchingId={switchingId}
                onSwitchWorkspace={handleSwitchWorkspace}
                onOpenOnboard={() => { setOnboardInviteUrl(''); setShowOnboardModal(true) }}
              />
            )}
            {activeTab === 'organization' && (
              <OrganizationTab
                org={org} form={orgForm} setForm={setOrgForm} onSave={handleSaveOrg} saving={saving}
                isOwnerOrAdmin={isOwnerOrAdmin} preferences={orgPrefs} updatePreferences={updateOrgPrefs}
              />
            )}
            {activeTab === 'teams' && <TeamsTab members={members} />}
            {activeTab === 'users' && (
              <UsersTab
                members={members} invitations={invitations} isOwnerOrAdmin={isOwnerOrAdmin}
                onRoleChange={handleRoleChange} onToggleActive={handleToggleActive} onRemove={handleRemoveMember}
                onOpenInvite={() => { setCreatedInviteUrl(''); setInviteEmail(''); setShowInviteModal(true) }}
                onRevoke={handleRevokeInvite}
              />
            )}
            {activeTab === 'roles' && <RolesTab />}
            {activeTab === 'ai' && <AITab orgId={orgId} onNavigate={onNavigate} />}
            {activeTab === 'notifications' && (
              <NotificationsTab
                notifications={notifications} loading={notifLoading} preferences={notifPrefs}
                updatePreferences={updateNotifPrefs} onMarkRead={handleMarkRead} onMarkAllRead={handleMarkAllRead}
                onDelete={handleDeleteNotification}
              />
            )}
            {activeTab === 'workspace' && <WorkspaceTab preferences={orgPrefs} updatePreferences={updateOrgPrefs} />}
            {activeTab === 'activity' && <ActivityTab activity={activityEvents} auditLog={auditEvents} loading={activityLoading} />}
            {activeTab === 'security' && (
              <PlaceholderTab
                title="Security controls are coming soon"
                description="SSO, SAML, IP allowlisting, and session policies will appear here once backend support exists. Nothing here is simulated in the meantime."
              />
            )}
            {activeTab === 'integrations' && (
              <PlaceholderTab
                title="Integrations are coming soon"
                description="Connections to ATS, HRIS, calendar, and email providers will appear here once backend support exists."
              />
            )}
            {activeTab === 'billing' && <BillingTab org={org} isOwnerOrAdmin={isOwnerOrAdmin} saving={saving} onPlanChange={handlePlanChange} />}
          </>
        )}
      </div>

      <Modal open={showOnboardModal} onClose={() => setShowOnboardModal(false)} title="Onboard New Organization" size="md">
        {!onboardInviteUrl ? (
          <form onSubmit={handleOnboardSubmit} className="flex flex-col gap-4">
            <FormField label="Organization Name" required>
              <Input value={onboardForm.name} onChange={e => setOnboardForm(f => ({ ...f, name: e.target.value }))} required placeholder="Acme Staffing Inc" />
            </FormField>
            <div className="grid sm:grid-cols-2 gap-4">
              <FormField label="Domain">
                <Input value={onboardForm.domain} onChange={e => setOnboardForm(f => ({ ...f, domain: e.target.value }))} placeholder="acme.com" />
              </FormField>
              <FormField label="Subscription Plan">
                <Select
                  value={onboardForm.subscription_plan}
                  options={SUBSCRIPTION_PLAN_OPTIONS}
                  onChange={plan => {
                    let candLimit = 500, aiLimit = 1000
                    if (plan === 'Starter') { candLimit = 250; aiLimit = 250 }
                    if (plan === 'Enterprise') { candLimit = 2500; aiLimit = 5000 }
                    setOnboardForm(f => ({ ...f, subscription_plan: plan, candidate_limit: candLimit, ai_credit_limit: aiLimit }))
                  }}
                />
              </FormField>
            </div>
            <div className="rounded-[var(--radius-md)] border border-border bg-surface2 p-3.5 flex flex-col gap-2">
              <div className="text-xs font-bold text-text">Initial Company Owner</div>
              <Input size="sm" value={onboardForm.owner_name} onChange={e => setOnboardForm(f => ({ ...f, owner_name: e.target.value }))} placeholder="Owner Name" />
              <Input size="sm" type="email" value={onboardForm.owner_email} onChange={e => setOnboardForm(f => ({ ...f, owner_email: e.target.value }))} placeholder="owner@acme.com" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="secondary" onClick={() => setShowOnboardModal(false)}>Cancel</Button>
              <Button type="submit" loading={onboarding}>Onboard Organization</Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-text2">Send this invitation link to the company owner:</p>
            <div className="text-xs bg-surface2 border border-border rounded-[var(--radius-md)] p-3 break-all text-accent">{onboardInviteUrl}</div>
            <Button onClick={() => { navigator.clipboard.writeText(onboardInviteUrl); toast({ tone: 'success', title: 'Copied to clipboard' }); setShowOnboardModal(false) }}>
              Copy Owner Invite Link
            </Button>
          </div>
        )}
      </Modal>

      <Modal open={showInviteModal} onClose={() => setShowInviteModal(false)} title="Invite Team Member" size="sm">
        {!createdInviteUrl ? (
          <form onSubmit={handleSendInvite} className="flex flex-col gap-4">
            <FormField label="Email Address" required>
              <Input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} required placeholder="teammate@company.com" />
            </FormField>
            <FormField label="Organization Role" required>
              <Select value={inviteRole} onChange={setInviteRole} options={ALL_ROLES} />
            </FormField>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="secondary" onClick={() => setShowInviteModal(false)}>Cancel</Button>
              <Button type="submit" loading={sendingInvite}>Generate Invite Link</Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-text2">Share this link with {inviteEmail}</p>
            <div className="text-xs bg-surface2 border border-border rounded-[var(--radius-md)] p-3 break-all text-accent">{createdInviteUrl}</div>
            <Button onClick={() => { navigator.clipboard.writeText(createdInviteUrl); toast({ tone: 'success', title: 'Copied to clipboard' }) }}>
              Copy Invite Link
            </Button>
          </div>
        )}
      </Modal>
    </PageContainer>
  )
}

function GeneralTab({ org, allOrgs, isSuperAdmin, switchingId, onSwitchWorkspace, onOpenOnboard }) {
  const candidateUsagePercent = Math.min(100, Math.round(((org?.stats?.candidates || 0) / (org?.candidate_limit || 500)) * 100))

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPICard label="Team Members" value={org?.stats?.members ?? '—'} icon="users" />
        <KPICard label="Candidates" value={`${org?.stats?.candidates ?? 0} / ${org?.candidate_limit ?? 500}`} icon="layers" tone={candidateUsagePercent > 90 ? 'red' : 'accent'} />
        <KPICard label="Subscription" value={org?.subscription_plan || 'Growth'} icon="sparkles" tone="ai" />
        <KPICard label="Pending Invites" value={org?.stats?.pending_invites ?? 0} icon="mail" tone="yellow" />
      </div>

      <Card>
        <CardHeader title={org?.name || 'Organization'} subtitle={`Tenant ID: ${org?.id || '—'}`} />
        <div className="grid sm:grid-cols-2">
          <SettingsCard title="Domain" description={org?.domain || org?.email_domain || 'Not set'} />
          <SettingsCard title="Industry" description={org?.industry || 'Not set'} />
          <SettingsCard title="Website" description={org?.website || 'Not set'} />
          <SettingsCard title="Timezone" description={org?.timezone || 'Not set'} />
        </div>
      </Card>

      {isSuperAdmin && (
        <Card>
          <CardHeader
            title={`All Platform Organizations (${allOrgs.length})`}
            subtitle="Superadmin privileged view"
            action={<Button size="sm" leftIcon="plus" onClick={onOpenOnboard}>Onboard Organization</Button>}
          />
          {allOrgs.length === 0 ? (
            <EmptyState title="No organizations yet" />
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {allOrgs.map(o => {
                const isActive = o.id === org?.id
                return (
                  <div key={o.id} className={cn('rounded-[var(--radius-md)] border p-3.5 flex flex-col gap-2', isActive ? 'border-accent bg-accent/5' : 'border-border bg-surface2')}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-text truncate">{o.name}</span>
                      {isActive && <Badge tone="accent" size="sm">Active</Badge>}
                    </div>
                    <div className="text-xs text-text3">{o.domain || o.email_domain || '—'}</div>
                    <div className="flex gap-3 text-xs text-text2 border-t border-border pt-2">
                      <span>{o.stats?.members || 0} members</span>
                      <span>{o.stats?.candidates || 0} candidates</span>
                    </div>
                    {!isActive && (
                      <Button size="sm" variant="outline" loading={switchingId === o.id} onClick={() => onSwitchWorkspace(o.id, o.name)}>
                        Switch workspace
                      </Button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

function OrganizationTab({ org, form, setForm, onSave, saving, isOwnerOrAdmin, preferences, updatePreferences }) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title="Company Profile" subtitle={`Real fields stored on the organization record. Tenant ID: ${org?.id || '—'}`} />
        <form onSubmit={onSave} className="flex flex-col gap-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <FormField label="Company Name" required>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} disabled={!isOwnerOrAdmin} required />
            </FormField>
            <FormField label="Primary Domain">
              <Input value={form.domain} onChange={e => setForm(f => ({ ...f, domain: e.target.value }))} disabled={!isOwnerOrAdmin} placeholder="company.com" />
            </FormField>
            <FormField label="Website">
              <Input type="url" value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} disabled={!isOwnerOrAdmin} placeholder="https://www.company.com" />
            </FormField>
            <FormField label="Industry">
              <Input value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))} disabled={!isOwnerOrAdmin} />
            </FormField>
            <FormField label="Company Size">
              <Input value={form.company_size} onChange={e => setForm(f => ({ ...f, company_size: e.target.value }))} disabled={!isOwnerOrAdmin} placeholder="10-50" />
            </FormField>
            <FormField label="Logo URL">
              <Input type="url" value={form.logo_url} onChange={e => setForm(f => ({ ...f, logo_url: e.target.value }))} disabled={!isOwnerOrAdmin} />
            </FormField>
            <FormField label="Timezone">
              <Select value={form.timezone} onChange={v => setForm(f => ({ ...f, timezone: v }))} options={TIMEZONE_OPTIONS} disabled={!isOwnerOrAdmin} />
            </FormField>
          </div>
          {isOwnerOrAdmin && <Button type="submit" loading={saving} className="self-start">Save changes</Button>}
        </form>
      </Card>

      <Card>
        <CardHeader title="Regional & Recruiting Preferences" subtitle="Personalize currency, dates, language, and drafting defaults." />
        <InfoBanner tone="info" className="mb-4">
          These preferences are saved locally to your browser for this organization. They are not yet synced across devices or enforced server-side.
        </InfoBanner>
        <div className="grid sm:grid-cols-2 gap-4 mb-5">
          <FormField label="Currency">
            <Select value={preferences.currency} onChange={v => updatePreferences({ currency: v })} options={CURRENCY_OPTIONS} />
          </FormField>
          <FormField label="Date Format">
            <Select value={preferences.dateFormat} onChange={v => updatePreferences({ dateFormat: v })} options={DATE_FORMAT_OPTIONS} />
          </FormField>
          <FormField label="Language">
            <Select value={preferences.language} onChange={v => updatePreferences({ language: v })} options={LANGUAGE_OPTIONS} />
          </FormField>
          <FormField label="Business Hours">
            <div className="flex items-center gap-2">
              <Input type="time" value={preferences.businessHours.start} onChange={e => updatePreferences({ businessHours: { start: e.target.value } })} />
              <span className="text-text3 text-xs">to</span>
              <Input type="time" value={preferences.businessHours.end} onChange={e => updatePreferences({ businessHours: { end: e.target.value } })} />
            </div>
          </FormField>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <FormField label="Default Email Signature">
            <Textarea rows={3} value={preferences.emailSignature} onChange={e => updatePreferences({ emailSignature: e.target.value })} placeholder={'Best regards,\nThe Recruiting Team'} />
          </FormField>
          <FormField label="Offer Letter Defaults">
            <Textarea rows={3} value={preferences.offerLetterDefaults} onChange={e => updatePreferences({ offerLetterDefaults: e.target.value })} placeholder="Standard offer terms, benefits summary, start date policy..." />
          </FormField>
        </div>
      </Card>
    </div>
  )
}

function TeamsTab({ members }) {
  const groups = useMemo(() => {
    const map = new Map()
    for (const m of members) {
      const key = m.department || m.team || 'Unassigned'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(m)
    }
    return Array.from(map.entries()).sort((a, b) => b[1].length - a[1].length)
  }, [members])

  const managers = useMemo(() => members.filter(m => !m.manager_id), [members])
  const unassignedCount = groups.find(([name]) => name === 'Unassigned')?.[1].length || 0

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPICard label="Departments / Teams" value={groups.length} icon="layers" />
        <KPICard label="Active Members" value={members.filter(m => m.is_active !== false).length} icon="users" />
        <KPICard label="Managers" value={managers.length} icon="users" />
        <KPICard label="Unassigned" value={unassignedCount} icon="users" tone={unassignedCount > 0 ? 'yellow' : 'accent'} />
      </div>

      <Card>
        <CardHeader title="Departments & Teams" subtitle="Grouped from real recruiter profile data (department / team fields)." />
        {groups.length === 0 ? (
          <EmptyState title="No team members yet" description="Invite recruiters from the Users tab to see team groupings here." />
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {groups.map(([name, list]) => (
              <div key={name} className="py-3 flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-text">{name}</div>
                  <div className="text-xs text-text3 mt-0.5">{list.filter(m => m.is_active !== false).length} active of {list.length}</div>
                </div>
                <div className="flex -space-x-2">
                  {list.slice(0, 5).map(m => <Avatar key={m.id} name={m.full_name || m.email} size="sm" className="ring-2 ring-surface" />)}
                  {list.length > 5 && (
                    <span className="w-7 h-7 rounded-full bg-surface3 text-[10px] font-bold text-text3 flex items-center justify-center ring-2 ring-surface">
                      +{list.length - 5}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Manager Hierarchy" subtitle="Real reporting structure from recruiter profiles (manager_id)." />
        {managers.length === 0 ? (
          <EmptyState title="No managers on record" />
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {managers.map(m => {
              const reports = members.filter(r => r.manager_id === m.user_id)
              return (
                <ProfileCard
                  key={m.id} name={m.full_name} email={m.email} roleLabel={getRole(m.role)?.label || m.role}
                  status={m.is_active === false ? 'inactive' : 'active'}
                  actions={<span className="text-xs text-text3 whitespace-nowrap">{reports.length} direct report{reports.length === 1 ? '' : 's'}</span>}
                />
              )
            })}
          </div>
        )}
      </Card>

      <InfoBanner tone="warn">
        Office locations, territory assignment rules, and structured recruiter skill tags are not yet part of the data model — they will appear here once that backend support exists rather than being shown with invented values.
      </InfoBanner>
    </div>
  )
}

function UsersTab({ members, invitations, isOwnerOrAdmin, onRoleChange, onToggleActive, onRemove, onOpenInvite, onRevoke }) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return members
    return members.filter(m =>
      `${m.full_name || ''} ${m.email || ''} ${m.role || ''} ${m.department || ''} ${m.team || ''}`.toLowerCase().includes(q)
    )
  }, [members, search])

  return (
    <div className="flex flex-col gap-6">
      {/* Header row: stats + search + invite button */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="text-sm text-text3 shrink-0">
          {members.length} member{members.length === 1 ? '' : 's'} · {invitations.length} pending invitation{invitations.length === 1 ? '' : 's'}
        </div>
        <div className="flex-1">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search by name, email, role..."
          />
        </div>
        {isOwnerOrAdmin && <Button size="sm" leftIcon="plus" onClick={onOpenInvite} className="shrink-0">Invite User</Button>}
      </div>

      <Card>
        <CardHeader
          title="Organization Members"
          subtitle={search ? `${filtered.length} of ${members.length} members` : `${members.length} member${members.length === 1 ? '' : 's'}`}
        />
        {members.length === 0 ? (
          <EmptyState title="No members yet" />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon="search"
            title="No members match your search"
            description={`No results for "${search}". Try a different name, email, or role.`}
          />
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {filtered.map(m => (
              <div key={m.id} className="py-3 flex flex-col gap-2">
                {/* Top row: avatar + name/email (always full width) */}
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar name={m.full_name || m.email} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-text">{m.full_name || 'Unnamed User'}</div>
                    <div className="text-xs text-text3 truncate">{m.email}</div>
                  </div>
                  <span className="text-xs text-text3 hidden sm:block shrink-0 truncate max-w-[8rem]">{m.department || m.team || 'General'}</span>
                </div>
                {/* Controls row: role select + toggle + remove */}
                <div className="flex items-center gap-2 flex-wrap pl-0 sm:pl-11">
                  {isOwnerOrAdmin ? (
                    <div className="flex-1 min-w-[140px] max-w-[200px]"><Select size="sm" value={m.role} onChange={v => onRoleChange(m.id, v)} options={ALL_ROLES} /></div>
                  ) : (
                    <Badge tone="accent" size="sm">{m.role}</Badge>
                  )}
                  {isOwnerOrAdmin ? (
                    <Switch checked={m.is_active !== false} onChange={v => onToggleActive(m.user_id, v)} label={m.is_active !== false ? 'Active' : 'Inactive'} />
                  ) : (
                    <StatusBadge status={m.is_active !== false ? 'active' : 'inactive'} />
                  )}
                  {isOwnerOrAdmin && <Button size="sm" variant="ghost" onClick={() => onRemove(m.id, m.full_name)} className="text-red ml-auto">Remove</Button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {invitations.length > 0 && (
        <Card>
          <CardHeader title={`Pending Invitations (${invitations.length})`} />
          <div className="flex flex-col divide-y divide-border">
            {invitations.map(inv => (
              <div key={inv.id} className="py-2.5 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-sm font-semibold text-text">{inv.email}</div>
                  <div className="text-xs text-text3 mt-0.5">{inv.role} · Expires {new Date(inv.expires_at).toLocaleDateString()}</div>
                </div>
                <Button size="sm" variant="ghost" className="text-red" onClick={() => onRevoke(inv.id)}>Revoke</Button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

function RolesTab() {
  return (
    <div className="flex flex-col gap-5">
      <InfoBanner tone="info">
        This matrix is the single source of truth for what each role can do across TalentDesk (src/lib/admin/permissions.js). It currently governs UI presentation only — there is no Role/Permission table in the database yet, so nothing here is enforced server-side. It exists as reusable configuration so real backend authorization can be layered in later without a UI rewrite.
      </InfoBanner>
      <Card>
        <CardHeader title="Role × Module Access" subtitle={`${ROLES.length} roles across ${MODULES.length} modules`} />
        <PermissionMatrix />
      </Card>
    </div>
  )
}

function AITab({ orgId, onNavigate }) {
  const { settings } = useAIGovernance(orgId)
  return (
    <div className="flex flex-col gap-5">
      <InfoBanner tone="info">
        Full AI configuration — chat/actions/automation toggles, workspace permissions, model preference, response style, and daily request limits — lives in the AI Center's Settings tab so it isn't duplicated in two places. This is a read-only summary.
      </InfoBanner>
      <Card>
        <CardHeader title="Current AI Governance" action={<Button size="sm" variant="secondary" onClick={() => onNavigate?.('ai_center')}>Open AI Center Settings</Button>} />
        <div className="grid sm:grid-cols-2">
          <SettingsCard title="Chat" description={settings.features.chat ? 'Enabled' : 'Disabled'} />
          <SettingsCard title="Actions" description={settings.features.actions ? 'Enabled' : 'Disabled'} />
          <SettingsCard title="Automations" description={settings.features.automations ? 'Enabled' : 'Disabled'} />
          <SettingsCard title="Streaming" description={settings.streamingEnabled ? 'Enabled' : 'Disabled'} />
          <SettingsCard title="Response Style" description={settings.responseStyle} />
          <SettingsCard title="Daily Request Limit" description={settings.dailyRequestLimit ? `${settings.dailyRequestLimit} / day` : 'No limit set'} />
        </div>
      </Card>
    </div>
  )
}

function NotificationsTab({ notifications, loading, preferences, updatePreferences, onMarkRead, onMarkAllRead, onDelete }) {
  const unread = notifications.filter(n => !n.read)
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title="Notification Center" subtitle={`${unread.length} unread of ${notifications.length}`}
          action={unread.length > 0 && <Button size="sm" variant="secondary" onClick={onMarkAllRead}>Mark all read</Button>}
        />
        {loading ? (
          <div className="text-sm text-text3 py-10 text-center">Loading notifications...</div>
        ) : notifications.length === 0 ? (
          <EmptyState icon="bell" title="No notifications yet" description="Notifications will appear here as tasks, interviews, and follow-ups create real events." />
        ) : (
          <div className="flex flex-col divide-y divide-border max-h-[420px] overflow-y-auto">
            {notifications.map(n => (
              <div key={n.id} className={cn('py-2.5 flex items-start gap-3', !n.read && 'bg-accent/[0.03]')}>
                {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-text">{n.title}</div>
                  <div className="text-xs text-text3 mt-0.5">{n.message}</div>
                  <div className="text-[10px] text-text3 mt-1">{new Date(n.created_at).toLocaleString()}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!n.read && <Button size="sm" variant="ghost" onClick={() => onMarkRead(n.id)}>Mark read</Button>}
                  <Button size="sm" variant="ghost" iconOnly leftIcon="x" onClick={() => onDelete(n.id)} aria-label="Delete notification" />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Notification Categories" subtitle="Choose which categories you want surfaced. Saved to your browser." />
        <div className="grid sm:grid-cols-2">
          {NOTIFICATION_CATEGORIES.map(c => (
            <SettingsCard key={c.id} title={c.label} control={<Switch checked={preferences[c.id] !== false} onChange={v => updatePreferences({ [c.id]: v })} />} />
          ))}
        </div>
      </Card>
    </div>
  )
}

function WorkspaceTab({ preferences, updatePreferences }) {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title="Workspace Defaults" subtitle="Personalize how tables and lists render across TalentDesk." />
        <div className="grid sm:grid-cols-2">
          <SettingsCard
            title="Table Density"
            control={<div className="w-36"><Select size="sm" value={preferences.tableDensity} onChange={v => updatePreferences({ tableDensity: v })} options={[{ value: 'comfortable', label: 'Comfortable' }, { value: 'compact', label: 'Compact' }]} /></div>}
          />
          <SettingsCard
            title="Rows Per Page"
            control={<div className="w-28"><Select size="sm" value={String(preferences.pageSize)} onChange={v => updatePreferences({ pageSize: Number(v) })} options={[10, 25, 50, 100].map(n => ({ value: String(n), label: String(n) }))} /></div>}
          />
          <SettingsCard
            title="Default Candidate View"
            control={<div className="w-36"><Select size="sm" value={preferences.defaultCandidateView} onChange={v => updatePreferences({ defaultCandidateView: v })} options={[{ value: 'table', label: 'Table' }, { value: 'board', label: 'Board' }]} /></div>}
          />
          <SettingsCard
            title="Default Job View"
            control={<div className="w-36"><Select size="sm" value={preferences.defaultJobView} onChange={v => updatePreferences({ defaultJobView: v })} options={[{ value: 'table', label: 'Table' }, { value: 'board', label: 'Board' }]} /></div>}
          />
        </div>
      </Card>
      <InfoBanner tone="info">
        These are saved as preferences today. Wiring individual pages to read them (table density, default list view) is a natural follow-on, not part of this phase.
      </InfoBanner>
    </div>
  )
}

function ActivityTab({ activity, auditLog, loading }) {
  const [filter, setFilter] = useState('all')

  const combined = useMemo(() => {
    const a = activity.map(e => ({ id: `act-${e.id}`, type: 'activity', ts: e.created_at, actor: e.actor_name, summary: e.summary || `${e.action} ${e.entity}`, entity: e.entity }))
    const b = auditLog.map(e => ({ id: `audit-${e.id}`, type: 'audit', ts: e.created_at, actor: e.target_email || 'Admin', summary: e.action, entity: 'admin' }))
    return [...a, ...b].sort((x, y) => new Date(y.ts) - new Date(x.ts))
  }, [activity, auditLog])

  const entities = useMemo(() => Array.from(new Set(combined.map(e => e.entity))), [combined])
  const filtered = filter === 'all' ? combined : combined.filter(e => e.entity === filter)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2 flex-wrap">
        <Button size="sm" variant={filter === 'all' ? 'secondary' : 'ghost'} onClick={() => setFilter('all')}>All</Button>
        {entities.map(e => (
          <Button key={e} size="sm" variant={filter === e ? 'secondary' : 'ghost'} onClick={() => setFilter(e)}>{e}</Button>
        ))}
      </div>
      <Card>
        <CardHeader title="Recent Organization Activity" subtitle="Real, measurable events only — logged automatically as records are created, updated, or deleted." />
        {loading ? (
          <div className="text-sm text-text3 py-10 text-center">Loading activity...</div>
        ) : filtered.length === 0 ? (
          <EmptyState title="No activity recorded yet" description="Activity will appear here as your team creates and updates candidates, jobs, and admin actions." />
        ) : (
          <div className="flex flex-col divide-y divide-border max-h-[520px] overflow-y-auto">
            {filtered.map(e => (
              <div key={e.id} className="py-2.5 flex items-start gap-3">
                <Badge size="sm" tone={e.type === 'audit' ? 'ai' : 'neutral'}>{e.entity}</Badge>
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-text">{e.summary}</div>
                  <div className="text-xs text-text3 mt-0.5">{e.actor || 'System'} · {new Date(e.ts).toLocaleString()}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

function PlaceholderTab({ title, description }) {
  return (
    <Card>
      <EmptyState icon="alertCircle" title={title} description={description} />
    </Card>
  )
}

function BillingTab({ org, isOwnerOrAdmin, saving, onPlanChange }) {
  const candidateUsagePercent = Math.min(100, Math.round(((org?.stats?.candidates || 0) / (org?.candidate_limit || 500)) * 100))
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title="Subscription" subtitle="Organization-wide SaaS license with centralized billing." action={<Badge tone="accent">{org?.subscription_plan || 'Growth'}</Badge>} />
        <div className="flex flex-col gap-4">
          <div>
            <div className="flex justify-between text-xs font-semibold mb-1.5">
              <span className="text-text2">Candidate Database Limit</span>
              <span className="text-text">{org?.stats?.candidates || 0} / {org?.candidate_limit || 500}</span>
            </div>
            <div className="h-2 rounded-full bg-surface2 overflow-hidden">
              <div className="h-full bg-accent" style={{ width: `${candidateUsagePercent}%` }} />
            </div>
          </div>
          <InfoBanner tone="info">
            AI copilot usage is tracked per-request in the AI Center's Usage Analytics tab. There is no aggregate "credits consumed" counter on the organization record yet, so it isn't shown here as a number that would otherwise have to be invented.
          </InfoBanner>
        </div>
      </Card>

      <Card>
        <CardHeader title="Plans" />
        <div className="grid sm:grid-cols-3 gap-3">
          {PLAN_TIERS.map(plan => {
            const isCurrent = (org?.subscription_plan || 'Growth') === plan.id
            return (
              <div key={plan.id} className={cn('rounded-[var(--radius-md)] border p-4 flex flex-col gap-2', isCurrent ? 'border-accent bg-accent/5' : 'border-border')}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-text">{plan.label}</span>
                  {isCurrent && <Badge tone="accent" size="sm">Current</Badge>}
                </div>
                <div className="text-xs text-text3">{plan.candidates} · {plan.credits} · {plan.seats}</div>
                {isOwnerOrAdmin && !isCurrent && (
                  <Button size="sm" variant="outline" loading={saving} onClick={() => onPlanChange(plan.id)}>Switch to {plan.id}</Button>
                )}
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
