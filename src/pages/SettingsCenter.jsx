import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { organizationApi, db, apiRequest } from '../lib/api'
import { PageContainer } from '../components/layout/PageContainer'
import {
  Button, Card, CardHeader, KPICard, PageHeader, Tabs, EmptyState, Select, Input, Textarea,
  Switch, FormField, Badge, Avatar, AvatarGroup, Modal, useToast, cn, SearchBar, Icon,
} from '../components/ui'
import { SettingsCard, StatusBadge, InfoBanner, PermissionMatrix, AIUsageSection } from '../components/admin'
import { ROLES, MODULES, getRole, getSettingsTabAccess, canDoAction } from '../lib/admin/permissions'
import { useOrgPreferences } from '../lib/admin/orgPreferences'
import { useNotificationPreferences, NOTIFICATION_CATEGORIES } from '../lib/admin/notificationPreferences'
import { fetchNotifications, markNotificationRead, markNotificationsRead, deleteNotification } from '../lib/admin/notifications'
import { fetchActivityLog, fetchAuditLog } from '../lib/admin/activity'
import { useAIGovernance } from '../lib/ai/governance'
import { SETTINGS_TAB_FLAG } from '../lib/admin/settingsNav'
import { MARKET_CONFIGS, MARKET_OPTIONS, getMarketConfig } from '../lib/marketConfig'
import { TIMEZONE_OPTIONS } from '../lib/timezone'

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
  { value: 'Starter', label: 'Starter', desc: '2,500 Candidates | 250 AI Credits' },
  { value: 'Growth', label: 'Growth', desc: '15,000 Candidates | 1,000 AI Credits' },
  { value: 'Enterprise', label: 'Enterprise', desc: 'Unlimited Candidates | 5,000 AI Credits' },
]

// Every claim below is checked against real, shipped behavior — no invented
// features (SSO/API/priority-support/SLAs aren't built, so they don't appear
// here even though they're common pricing-page filler elsewhere).
const PLAN_TIERS = [
  {
    id: 'Starter',
    label: 'Starter',
    price: '$79',
    period: '/ month',
    tagline: 'For solo recruiters & boutique agencies',
    valueProp: 'Everything you need to run a lean recruiting desk.',
    candidates: '2,500 candidates',
    credits: '250 AI credits/mo',
    creditsNote: '≈ 250 resumes parsed & analyzed every month',
    seats: 'Up to 3 users',
    highlights: [
      'AI Copilot on every conversation',
      'Bulk resume upload & AI auto-fill',
      'Full pipeline, tasks & reporting',
    ],
    ctaLabel: 'Get Started',
  },
  {
    id: 'Growth',
    label: 'Growth',
    price: '$249',
    period: '/ month',
    tagline: 'For scaling recruiting teams',
    popular: true,
    valueProp: 'Everything in Starter, built for teams that submit at volume.',
    candidates: '15,000 candidates',
    credits: '1,000 AI credits/mo',
    creditsNote: '≈ 1,000 resumes parsed & analyzed every month',
    seats: 'Up to 15 users',
    highlights: [
      '1-Click client submission packets',
      'Deep AI candidate fit scoring',
      '6× the candidate database of Starter',
    ],
    ctaLabel: 'Start Growing',
  },
  {
    id: 'Enterprise',
    label: 'Enterprise',
    price: 'Custom',
    period: 'pricing',
    tagline: 'For enterprise hiring organizations',
    valueProp: "Let's build your hiring platform — uncapped and tailored to your org.",
    candidates: 'Unlimited candidates',
    credits: '5,000 AI credits/mo',
    creditsNote: 'Highest AI processing allotment, for high-volume hiring ops',
    seats: 'Unlimited users',
    highlights: [
      'Unlimited candidate database',
      'Unlimited team seats',
      'Everything in Growth, uncapped',
    ],
    ctaLabel: 'Contact Sales',
  },
]

// Reflects what's actually gated in code (Candidates.jsx's openPacketForCandidate
// / openAiMatchForCandidate Starter checks) rather than aspirational marketing
// copy — Copilot, bulk upload, and usage analytics aren't plan-gated at all
// currently, so they're ticked across every tier. Grouped to read like a real
// SaaS comparison page instead of a flat spreadsheet.
const PLAN_COMPARISON = [
  {
    category: 'Recruiting',
    rows: [
      { label: 'Candidate Database', values: ['2,500', '15,000', 'Unlimited'] },
      { label: 'Job Requisition Management', values: [true, true, true] },
      { label: 'Pipeline (Kanban) View', values: [true, true, true] },
      { label: 'Bulk Resume Upload & AI Parsing', values: [true, true, true] },
      { label: 'Resume File Storage & Download', values: [true, true, true] },
      { label: 'Client Postings Tracker', values: [true, true, true] },
      { label: 'Callbacks & Follow-ups Tracking', values: [true, true, true] },
    ],
  },
  {
    category: 'AI-Powered Tools',
    rows: [
      { label: 'Monthly AI Credits', values: ['250', '1,000', '5,000'] },
      { label: 'AI Copilot Chat', values: [true, true, true] },
      { label: 'AI Action Framework (Summarize, Rewrite, Draft & more)', values: [true, true, true] },
      { label: 'Boolean Search Builder', values: [true, true, true] },
      { label: 'Job Description Analyzer', values: [true, true, true] },
      { label: 'Salary Benchmarking & Market Demand', values: [true, true, true] },
      { label: '1-Click Client Submission Packets', values: [false, true, true] },
      { label: 'Deep AI Candidate Fit Radar (AI Match)', values: [false, true, true] },
    ],
  },
  {
    category: 'Collaboration & Admin',
    rows: [
      { label: 'Team Seats', values: ['Up to 3', 'Up to 15', 'Unlimited'] },
      { label: 'Task Management', values: [true, true, true] },
      { label: 'Team Directory & Org Chart', values: [true, true, true] },
      { label: 'Role-Based Access Control', values: [true, true, true] },
      { label: 'Audit & Activity Log', values: [true, true, true] },
      { label: 'Reports & Analytics', values: [true, true, true] },
      { label: 'Organization AI Usage Analytics', values: [true, true, true] },
    ],
  },
  {
    // Only real Enterprise-exclusive facts — genuinely uncapped resources,
    // not invented enterprise-tier filler like SSO/API/priority support.
    category: 'Enterprise Scale',
    rows: [
      { label: 'Unlimited Candidate Database', values: [false, false, true] },
      { label: 'Unlimited Team Seats', values: [false, false, true] },
      { label: 'Highest AI Credit Allotment (5,000/mo)', values: [false, false, true] },
    ],
  },
]

const TRUST_ROW = [
  { icon: 'lock', label: 'Enterprise-grade Security' },
  { icon: 'users', label: 'Role-Based Access' },
  { icon: 'sparkles', label: 'AI-Powered Recruiting' },
  { icon: 'refresh', label: 'Fast Performance' },
]

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

  // ── RBAC ── single-source derived from permissions.js ──────────────────────
  const tabAccess = useMemo(() => getSettingsTabAccess(role), [role])
  const can = useMemo(() => ({
    inviteMember: canDoAction(role, 'inviteMember'),
    changeRole:   canDoAction(role, 'changeRole'),
    removeMember: canDoAction(role, 'removeMember'),
    toggleActive: canDoAction(role, 'toggleActive'),
    revokeInvite: canDoAction(role, 'revokeInvite'),
    editOrg:      canDoAction(role, 'editOrg'),
    changePlan:   canDoAction(role, 'changePlan'),
  }), [role])
  // Visible tabs: filter out 'none' access; also exclude superadmin-only items for non-superadmins
  const visibleTabs = TABS.filter(t => tabAccess[t.id] !== 'none')

  // If the initialTab is restricted for this role, silently fall back to 'general'
  const safeInitialTab = tabAccess[initialTab] !== 'none' ? initialTab : 'general'
  const [activeTab, setActiveTab] = useState(safeInitialTab)
  const [restrictedBanner, setRestrictedBanner] = useState(safeInitialTab !== initialTab)
  useEffect(() => {
    const flag = sessionStorage.getItem(SETTINGS_TAB_FLAG)
    if (flag) {
      sessionStorage.removeItem(SETTINGS_TAB_FLAG)
      const safeFlag = tabAccess[flag] !== 'none' ? flag : 'general'
      setActiveTab(safeFlag)
      if (safeFlag !== flag) setRestrictedBanner(true)
    }
  }, [tabAccess])

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

  const { preferences: orgPrefs, updatePreferences: updateOrgPrefs, savePreferences: saveOrgPrefs } = useOrgPreferences(orgId)
  const { preferences: notifPrefs, updatePreferences: updateNotifPrefs } = useNotificationPreferences(userId)

  const [notifications, setNotifications] = useState([])
  const [notifLoading, setNotifLoading] = useState(false)
  const [activityEvents, setActivityEvents] = useState([])
  const [auditEvents, setAuditEvents] = useState([])
  const [activityLoading, setActivityLoading] = useState(false)

  const [showOnboardModal, setShowOnboardModal] = useState(false)
  const [onboardForm, setOnboardForm] = useState({
    name: '', domain: '', website: '', industry: 'Staffing & Recruiting', subscription_plan: 'Growth',
    candidate_limit: 15000, ai_credit_limit: 1000, owner_name: '', owner_email: '',
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

      {restrictedBanner && (
        <InfoBanner tone="warn" className="mt-4" onClose={() => setRestrictedBanner(false)}>
          You don't have permission to access that settings section. Showing General instead.
        </InfoBanner>
      )}

      <div className="mt-5">
        <Tabs items={visibleTabs} value={activeTab} onChange={tab => { setActiveTab(tab); setRestrictedBanner(false) }} />
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
                canEdit={can.editOrg} isReadOnly={tabAccess['organization'] === 'view'}
                preferences={orgPrefs} updatePreferences={updateOrgPrefs} savePreferences={saveOrgPrefs}
                onRegionalOrgUpdate={(updatedOrg) => {
                  setOrg(prev => ({ ...prev, ...updatedOrg }))
                  setOrgForm(prev => ({ ...prev, timezone: updatedOrg.timezone || prev.timezone }))
                  refreshOrg(updatedOrg)
                }}
                members={members}
              />
            )}
            {activeTab === 'teams' && <TeamsTab members={members} isReadOnly={tabAccess['teams'] === 'view'} />}
            {activeTab === 'users' && (
              <UsersTab
                members={members} invitations={invitations}
                can={can} isReadOnly={tabAccess['users'] === 'view'}
                onRoleChange={handleRoleChange} onToggleActive={handleToggleActive} onRemove={handleRemoveMember}
                onOpenInvite={() => { setCreatedInviteUrl(''); setInviteEmail(''); setShowInviteModal(true) }}
                onRevoke={handleRevokeInvite}
              />
            )}
            {activeTab === 'roles' && <RolesTab isReadOnly={tabAccess['roles'] === 'view'} />}
            {activeTab === 'ai' && <AITab orgId={orgId} org={org} members={members} onNavigate={onNavigate} />}
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
            {activeTab === 'billing' && <BillingTab org={org} canChangePlan={can.changePlan} saving={saving} onPlanChange={handlePlanChange} />}
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
                    // Enterprise's candidate limit is not actually enforced
                    // (see data.routes.js / upload.routes.js — Enterprise is
                    // uncapped); 100,000 here is only a sensible number for
                    // the usage progress bar to show, not a real ceiling.
                    let candLimit = 15000, aiLimit = 1000
                    if (plan === 'Starter') { candLimit = 2500; aiLimit = 250 }
                    if (plan === 'Enterprise') { candLimit = 100000; aiLimit = 5000 }
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
  const [showAll, setShowAll] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const candidateUsagePercent = Math.min(100, Math.round(((org?.stats?.candidates || 0) / (org?.candidate_limit || 15000)) * 100))

  const filteredOrgs = useMemo(() => {
    if (!searchQuery.trim()) return allOrgs
    const q = searchQuery.toLowerCase().trim()
    return allOrgs.filter(o => o.name.toLowerCase().includes(q) || (o.domain || o.email_domain || '').toLowerCase().includes(q))
  }, [allOrgs, searchQuery])

  const displayedOrgs = useMemo(() => {
    if (showAll || searchQuery || filteredOrgs.length <= 6) return filteredOrgs
    return filteredOrgs.slice(0, 6)
  }, [showAll, searchQuery, filteredOrgs])

  const hiddenCount = filteredOrgs.length - displayedOrgs.length

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
        <div className="grid sm:grid-cols-2 gap-x-8 sm:gap-x-12 gap-y-0">
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
            action={
              <div className="flex items-center gap-2">
                {allOrgs.length > 6 && (
                  <SearchBar
                    value={searchQuery}
                    onChange={setSearchQuery}
                    placeholder="Search organizations..."
                    className="w-48"
                  />
                )}
                <Button size="sm" leftIcon="plus" onClick={onOpenOnboard}>Onboard Organization</Button>
              </div>
            }
          />
          {allOrgs.length === 0 ? (
            <EmptyState title="No organizations yet" />
          ) : (
            <div className="flex flex-col gap-3">
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                {displayedOrgs.map(o => {
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

              {allOrgs.length > 6 && !searchQuery && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowAll(prev => !prev)}
                  className="self-center mt-1 text-accent"
                >
                  {showAll ? 'Show Less' : `See More (${hiddenCount} more organizations)`}
                </Button>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

function OrganizationTab({ org, form, setForm, onSave, saving, canEdit, isReadOnly, preferences, updatePreferences, savePreferences, onRegionalOrgUpdate, members }) {
  const { toast } = useToast()
  const [regionalSaving, setRegionalSaving] = useState(false)
  const activeMarket = getMarketConfig(preferences.market)
  const marketTimezoneOptions = useMemo(() => {
    const allowed = activeMarket.timezoneOptions || [activeMarket.defaultTimezone]
    const options = TIMEZONE_OPTIONS.filter(option => allowed.includes(option.value))
    if (preferences.timezone && !options.some(option => option.value === preferences.timezone)) {
      const existing = TIMEZONE_OPTIONS.find(option => option.value === preferences.timezone)
      if (existing) options.push(existing)
    }
    return options
  }, [activeMarket, preferences.timezone])

  const persistRegional = async (partial, successTitle = 'Regional preferences updated') => {
    if (!canEdit) return
    updatePreferences(partial)
    setRegionalSaving(true)
    try {
      const result = await savePreferences(partial)
      if (result?.organization) {
        onRegionalOrgUpdate?.(result.organization)
        if (partial.timezone) setForm(f => ({ ...f, timezone: result.organization.timezone || partial.timezone }))
      }
      toast({ tone: 'success', title: successTitle })
    } catch (err) {
      toast({ tone: 'error', title: 'Failed to save regional preferences', description: err.message })
    } finally {
      setRegionalSaving(false)
    }
  }

  const handleMarketChange = (marketId) => {
    const market = getMarketConfig(marketId)
    persistRegional({
      market: market.id,
      currency: market.currency,
      dateFormat: market.dateFormat,
      timezone: market.defaultTimezone,
      businessHours: market.businessHours,
    }, `${market.label} region applied`)
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title="Company Profile" subtitle={`Real fields stored on the organization record. Tenant ID: ${org?.id || '—'}`} />
        {isReadOnly && (
          <InfoBanner tone="info" className="mb-4">
            You have view-only access to organization settings. Contact an Owner or Admin to make changes.
          </InfoBanner>
        )}
        <form onSubmit={onSave} className="flex flex-col gap-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <FormField label="Company Name" required>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} disabled={!canEdit} required />
            </FormField>
            <FormField label="Primary Domain">
              <Input value={form.domain} onChange={e => setForm(f => ({ ...f, domain: e.target.value }))} disabled={!canEdit} placeholder="company.com" />
            </FormField>
            <FormField label="Website">
              <Input type="url" value={form.website} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} disabled={!canEdit} placeholder="https://www.company.com" />
            </FormField>
            <FormField label="Industry">
              <Input value={form.industry} onChange={e => setForm(f => ({ ...f, industry: e.target.value }))} disabled={!canEdit} />
            </FormField>
            <FormField label="Company Size">
              <Input value={form.company_size} onChange={e => setForm(f => ({ ...f, company_size: e.target.value }))} disabled={!canEdit} placeholder="10-50" />
            </FormField>
            <FormField label="Logo URL">
              <Input type="url" value={form.logo_url} onChange={e => setForm(f => ({ ...f, logo_url: e.target.value }))} disabled={!canEdit} />
            </FormField>
            <FormField label="Timezone">
              <Select value={form.timezone} onChange={v => setForm(f => ({ ...f, timezone: v }))} options={TIMEZONE_OPTIONS} disabled={!canEdit} />
            </FormField>
          </div>
          {canEdit && <Button type="submit" loading={saving} className="self-start">Save changes</Button>}
        </form>
      </Card>

      <AIUsageSection org={org} members={members} orgId={org?.id} />

      {/* ── Org-level: admin-only ───────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Regional &amp; Recruiting Preferences"
          subtitle="Org-wide market configuration — set at onboarding and managed by Owners &amp; Admins."
          action={!canEdit ? (
            <span className="flex items-center gap-1.5 text-xs font-medium text-text3">
              <Icon name="lock" size={13} />
              Admin only
            </span>
          ) : null}
        />
        {!canEdit && (
          <InfoBanner tone="info" className="mb-4">
            These are org-level settings configured by your Owner or Admin. Contact them to request a change.
          </InfoBanner>
        )}
        <InfoBanner tone="info" className="mb-4">
          These settings are saved on the organization record and used across candidate forms, callbacks, interviews, reminders, and exports.
        </InfoBanner>
        <div className={cn('grid grid-cols-1 md:grid-cols-2 gap-3 mb-5', !canEdit && 'pointer-events-none opacity-60 select-none')}>
          {Object.values(MARKET_CONFIGS).map(market => {
            const active = activeMarket.id === market.id
            return (
              <button
                key={market.id}
                type="button"
                disabled={!canEdit}
                onClick={() => canEdit && handleMarketChange(market.id)}
                className={cn(
                  'text-left rounded-[var(--radius-md)] border p-4 transition-all duration-[var(--duration-fast)] bg-surface2/50',
                  canEdit && 'hover:border-accent/40 hover:bg-surface2 focus:outline-none focus:ring-2 focus:ring-accent/20',
                  active ? 'border-accent/60 ring-1 ring-accent/20 shadow-[0_12px_28px_-18px_color-mix(in_srgb,var(--accent)_45%,transparent)]' : 'border-border',
                  !canEdit && 'cursor-not-allowed'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn('w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center shrink-0', active ? 'bg-accent text-white' : 'bg-surface3 text-text2')}>
                        <Icon name="building" size={15} />
                      </span>
                      <div>
                        <div className="text-sm font-bold text-text">{market.label}</div>
                        <div className="text-[11px] text-text3">{market.currency} · {market.dateFormat} · {market.defaultTimezone}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {market.highlights.map(item => (
                        <Badge key={item} tone={active ? 'accent' : 'neutral'} size="sm">{item}</Badge>
                      ))}
                    </div>
                  </div>
                  {active && <Icon name="checkCircle" size={18} className="text-accent shrink-0" />}
                </div>
              </button>
            )
          })}
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <FormField label="Market">
            <Select value={preferences.market} onChange={handleMarketChange} options={MARKET_OPTIONS} disabled={!canEdit || regionalSaving} />
          </FormField>
          <FormField label="Timezone" hint="Stored as an IANA timezone so alerts remain accurate through DST and across devices.">
            <Select
              value={preferences.timezone}
              onChange={v => persistRegional({ timezone: v }, 'Timezone updated')}
              options={marketTimezoneOptions}
              disabled={!canEdit || regionalSaving}
            />
          </FormField>
          <FormField label="Currency">
            <Select value={preferences.currency} onChange={v => persistRegional({ currency: v }, 'Currency updated')} options={CURRENCY_OPTIONS} disabled={!canEdit || regionalSaving} />
          </FormField>
          <FormField label="Date Format">
            <Select value={preferences.dateFormat} onChange={v => persistRegional({ dateFormat: v }, 'Date format updated')} options={DATE_FORMAT_OPTIONS} disabled={!canEdit || regionalSaving} />
          </FormField>
          <FormField label="Language">
            <Select value={preferences.language} onChange={v => persistRegional({ language: v }, 'Language updated')} options={LANGUAGE_OPTIONS} disabled={!canEdit || regionalSaving} />
          </FormField>
          <FormField label="Business Hours">
            <div className="flex items-center gap-2">
              <Input type="time" value={preferences.businessHours.start} onChange={e => persistRegional({ businessHours: { start: e.target.value } }, 'Business hours updated')} disabled={!canEdit || regionalSaving} />
              <span className="text-text3 text-xs">to</span>
              <Input type="time" value={preferences.businessHours.end} onChange={e => persistRegional({ businessHours: { end: e.target.value } }, 'Business hours updated')} disabled={!canEdit || regionalSaving} />
            </div>
          </FormField>
        </div>
      </Card>

      {/* ── Personal defaults: editable by all roles ─────────────────────── */}
      <Card>
        <CardHeader
          title="Personal Defaults"
          subtitle="Your own templates used across recruiting actions — editable by every team member."
        />
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

const DEPT_CONFIG = {
  Healthcare: { icon: 'heart', color: 'var(--red)', bg: 'color-mix(in srgb, var(--red) 15%, var(--surface))' },
  'Healthcare Staffing': { icon: 'heart', color: 'var(--red)', bg: 'color-mix(in srgb, var(--red) 15%, var(--surface))' },
  IT: { icon: 'code', color: 'var(--accent2)', bg: 'color-mix(in srgb, var(--accent2) 15%, var(--surface))' },
  'Technology Staffing': { icon: 'code', color: 'var(--accent2)', bg: 'color-mix(in srgb, var(--accent2) 15%, var(--surface))' },
  PMO: { icon: 'briefcase', color: 'var(--ai)', bg: 'color-mix(in srgb, var(--ai) 15%, var(--surface))' },
  'Client Success': { icon: 'layers', color: 'var(--accent)', bg: 'color-mix(in srgb, var(--accent) 15%, var(--surface))' },
  'BFSI Staffing': { icon: 'briefcase', color: 'var(--ai)', bg: 'color-mix(in srgb, var(--ai) 15%, var(--surface))' },
  'E-care': { icon: 'shield', color: 'var(--accent2)', bg: 'color-mix(in srgb, var(--accent2) 15%, var(--surface))' },
  Onboarding: { icon: 'userCheck', color: 'var(--orange)', bg: 'color-mix(in srgb, var(--orange) 15%, var(--surface))' },
  Helpdesk: { icon: 'headphones', color: 'var(--ai)', bg: 'color-mix(in srgb, var(--ai) 15%, var(--surface))' },
  Operations: { icon: 'cpu', color: 'var(--green)', bg: 'color-mix(in srgb, var(--green) 15%, var(--surface))' },
  Unassigned: { icon: 'helpCircle', color: 'var(--orange)', bg: 'color-mix(in srgb, var(--orange) 15%, var(--surface))' },
}


function TeamsTab({ members, isReadOnly }) {
  const [selectedDept, setSelectedDept] = useState(null)
  const [modalSearch, setModalSearch] = useState('')

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

  // Modal filtered list
  const modalFiltered = useMemo(() => {
    if (!selectedDept) return []
    const q = modalSearch.trim().toLowerCase()
    if (!q) return selectedDept.list
    return selectedDept.list.filter(m =>
      `${m.full_name || ''} ${m.email || ''} ${m.role || ''} ${m.team || ''}`.toLowerCase().includes(q)
    )
  }, [selectedDept, modalSearch])

  // Role breakdown for a dept list
  const getRoleBreakdown = (list) => {
    const counts = {}
    for (const m of list) {
      const label = getRole(m.role)?.label || m.role || 'Unknown'
      counts[label] = (counts[label] || 0) + 1
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3)
  }

  return (
    <div className="flex flex-col gap-6">
      {isReadOnly && (
        <InfoBanner tone="info">
          You have view-only access to team structure. Contact an Owner or Admin to change reporting lines or departments.
        </InfoBanner>
      )}

      {/* ── KPI row ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KPICard label="Departments / Teams" value={groups.length} icon="layers" />
        <KPICard label="Active Members" value={members.filter(m => m.is_active !== false).length} icon="users" tone="accent" />
        <KPICard label="Managers / Leads" value={managers.length} icon="briefcase" />
        <KPICard label="Unassigned" value={unassignedCount} icon="helpCircle" tone={unassignedCount > 0 ? 'yellow' : 'green'} />
      </div>

      {/* ── Department cards ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Departments & Teams"
          subtitle={`${groups.length} group${groups.length === 1 ? '' : 's'} · derived from recruiter profile data`}
        />
        {groups.length === 0 ? (
          <EmptyState
            icon="users"
            title="No team members yet"
            description="Invite recruiters from the Users tab to see team groupings here."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
            {groups.map(([name, list]) => {
              const activeCount = list.filter(m => m.is_active !== false).length
              const percentActive = list.length > 0 ? Math.round((activeCount / list.length) * 100) : 0
              const cfg = DEPT_CONFIG[name] || { icon: 'layers', color: 'var(--accent)', bg: 'color-mix(in srgb, var(--accent) 15%, transparent)' }
              const roleBreakdown = getRoleBreakdown(list)

              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => { setModalSearch(''); setSelectedDept({ name, list }) }}
                  className="group/card text-left relative flex flex-col justify-between p-4 rounded-xl border border-border/70 bg-surface/50 hover:bg-surface2/60 hover:border-accent/40 hover:shadow-md transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-accent/30 gap-3"
                >
                  {/* Top Row: Icon + Name & Count + Active Badge */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-xs group-hover/card:scale-105 transition-transform"
                        style={{ background: cfg.bg, color: cfg.color }}
                      >
                        <Icon name={cfg.icon} size={20} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-text group-hover/card:text-accent transition-colors truncate">
                          {name}
                        </div>
                        <div className="text-xs text-text3 font-medium mt-0.5">
                          {list.length} member{list.length === 1 ? '' : 's'}
                        </div>
                      </div>
                    </div>
                    <Badge
                      tone={percentActive === 100 ? 'green' : percentActive >= 80 ? 'accent' : 'yellow'}
                      size="sm"
                      className="shrink-0 font-semibold tabular-nums"
                    >
                      {percentActive}%
                    </Badge>
                  </div>

                  {/* Progress bar */}
                  <div className="flex flex-col gap-1.5 pt-1">
                    <div className="w-full h-1.5 rounded-full bg-surface3/80 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${percentActive}%`, background: cfg.color }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-text3 font-medium">
                      <span>{activeCount} active</span>
                      {list.length - activeCount > 0 && (
                        <span>{list.length - activeCount} inactive</span>
                      )}
                    </div>
                  </div>

                  {/* Role breakdown pills */}
                  <div className="flex flex-wrap gap-1.5 py-0.5">
                    {roleBreakdown.map(([label, count]) => (
                      <Badge key={label} tone="neutral" size="xs">
                        {label} · {count}
                      </Badge>
                    ))}
                  </div>

                  {/* Footer: Avatar stack + View button */}
                  <div className="flex items-center justify-between gap-3 pt-2.5 border-t border-border/40 mt-auto">
                    <AvatarGroup
                      members={list}
                      max={5}
                      size="sm"
                    />
                    <span className="flex items-center gap-1 text-xs font-semibold text-text3 group-hover/card:text-accent transition-colors shrink-0">
                      View
                      <Icon name="chevronRight" size={14} className="group-hover/card:translate-x-0.5 transition-transform" />
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </Card>

      {/* ── Manager Hierarchy ────────────────────────────────────────────── */}
      <Card>
        <CardHeader
          title="Manager Hierarchy"
          subtitle="Reporting structure from recruiter profiles (manager_id field)."
        />
        {managers.length === 0 ? (
          <EmptyState icon="users" title="No managers on record" description="Managers appear here when recruiter profiles have a manager_id set." />
        ) : (
          <div className="flex flex-col gap-2 pt-1">
            {managers.map(m => {
              const reports = members.filter(r => r.manager_id === m.user_id)
              return (
                <div key={m.id} className="rounded-xl border border-border/50 bg-surface2/20 p-3.5 flex flex-col gap-3">
                  {/* Manager row */}
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar name={m.full_name || m.email} className="shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-text leading-snug truncate" title={m.full_name || 'Unnamed'}>
                        {m.full_name || 'Unnamed'}
                      </div>
                      <div className="text-xs text-text3 truncate leading-snug block w-full" title={m.email}>{m.email}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge tone="accent" size="sm">{getRole(m.role)?.label || m.role}</Badge>
                      <StatusBadge status={m.is_active === false ? 'inactive' : 'active'} />
                    </div>
                  </div>
                  {/* Direct reports */}
                  {reports.length > 0 && (
                    <div className="pl-4 border-l-2 border-border/60 flex flex-col gap-2">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-text3">
                        {reports.length} direct report{reports.length === 1 ? '' : 's'}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {reports.slice(0, 4).map(r => (
                          <div key={r.id} className="flex items-center gap-2 min-w-0 bg-surface2/30 p-2 rounded-lg border border-border/40">
                            <Avatar name={r.full_name || r.email} size="xs" className="shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="text-xs text-text font-medium leading-snug truncate" title={r.full_name || r.email}>
                                {r.full_name || r.email}
                              </div>
                              <div className="text-[11px] text-text3 truncate block w-full" title={r.email}>
                                {r.email}
                              </div>
                            </div>
                            <Badge tone="neutral" size="sm" className="shrink-0">{getRole(r.role)?.label || r.role}</Badge>
                          </div>
                        ))}
                      </div>
                      {reports.length > 4 && (
                        <span className="text-xs text-text3 font-medium">+{reports.length - 4} more direct reports</span>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <InfoBanner tone="warn">
        Office locations, territory assignment rules, and structured recruiter skill tags are not yet part of the data model — they will appear here once that backend support exists.
      </InfoBanner>

      {/* ── Department member modal ───────────────────────────────────────── */}
      <Modal
        open={Boolean(selectedDept)}
        onClose={() => { setSelectedDept(null); setModalSearch('') }}
        title={selectedDept ? selectedDept.name : ''}
        subtitle={selectedDept ? `${selectedDept.list.length} member${selectedDept.list.length === 1 ? '' : 's'}` : ''}
        size="lg"
      >
        {selectedDept && (
          <div className="flex flex-col gap-4">
            {/* Search inside modal */}
            {selectedDept.list.length > 4 && (
              <SearchBar
                value={modalSearch}
                onChange={setModalSearch}
                placeholder="Search members..."
              />
            )}

            {/* Member grid */}
            {modalFiltered.length === 0 ? (
              <div className="py-10 text-center text-sm text-text3">No members match your search.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[60vh] overflow-y-auto pr-1">
                {modalFiltered.map(m => {
                  const roleLabel = getRole(m.role)?.label || m.role
                  const isActive = m.is_active !== false

                  return (
                    <div
                      key={m.id}
                      className="flex items-start gap-3 rounded-xl border border-border/60 bg-surface2/30 p-3.5 hover:bg-surface2/60 hover:border-accent/30 transition-all duration-150 min-w-0"
                    >
                      {/* Avatar */}
                      <Avatar name={m.full_name || m.email} className="shrink-0 mt-0.5" />

                      {/* Info */}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-text leading-snug truncate" title={m.full_name || 'Unnamed User'}>
                          {m.full_name || 'Unnamed User'}
                        </div>
                        <div className="text-xs text-text3 mt-0.5 truncate block w-full leading-snug" title={m.email}>
                          {m.email}
                        </div>
                        {m.team && m.team !== selectedDept.name && (
                          <div className="text-[10px] text-text3 mt-1 font-medium truncate">{m.team}</div>
                        )}
                      </div>

                      {/* Badges */}
                      <div className="flex flex-col items-end gap-1.5 shrink-0 pt-0.5">
                        <Badge tone="accent" size="sm">{roleLabel}</Badge>
                        <span className={cn(
                          'inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full',
                          isActive
                            ? 'bg-green/15 text-green'
                            : 'bg-surface3 text-text3'
                        )}>
                          <span className={cn('w-1.5 h-1.5 rounded-full', isActive ? 'bg-green' : 'bg-text3')} />
                          {isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Footer count */}
            {modalSearch && (
              <div className="text-xs text-text3 text-center pt-1">
                {modalFiltered.length} of {selectedDept.list.length} members
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

function UsersTab({ members, invitations, can, isReadOnly, onRoleChange, onToggleActive, onRemove, onOpenInvite, onRevoke }) {
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
      {isReadOnly && (
        <InfoBanner tone="info">
          You have view-only access to team members. Contact an Owner or Admin to invite, remove, or change roles.
        </InfoBanner>
      )}
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
        {can.inviteMember && <Button size="sm" leftIcon="plus" onClick={onOpenInvite} className="shrink-0">Invite User</Button>}
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
                  {can.changeRole ? (
                    <div className="flex-1 min-w-[140px] max-w-[200px]"><Select size="sm" value={m.role} onChange={v => onRoleChange(m.id, v)} options={ALL_ROLES} /></div>
                  ) : (
                    <Badge tone="accent" size="sm">{m.role}</Badge>
                  )}
                  {can.toggleActive ? (
                    <Switch checked={m.is_active !== false} onChange={v => onToggleActive(m.user_id, v)} label={m.is_active !== false ? 'Active' : 'Inactive'} />
                  ) : (
                    <StatusBadge status={m.is_active !== false ? 'active' : 'inactive'} />
                  )}
                  {can.removeMember && <Button size="sm" variant="ghost" onClick={() => onRemove(m.id, m.full_name)} className="text-red ml-auto">Remove</Button>}
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
                {can.revokeInvite
                  ? <Button size="sm" variant="ghost" className="text-red" onClick={() => onRevoke(inv.id)}>Revoke</Button>
                  : <Badge tone="yellow" size="sm">Pending</Badge>
                }
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

function RolesTab({ isReadOnly }) {
  return (
    <div className="flex flex-col gap-5">
      {isReadOnly && (
        <InfoBanner tone="info">
          You have view-only access to the permission matrix. Role configuration can only be modified by an Owner or Admin.
        </InfoBanner>
      )}
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

function AITab({ orgId, org, members, onNavigate }) {
  const { settings } = useAIGovernance(orgId)
  return (
    <div className="flex flex-col gap-6">
      <AIUsageSection org={org} members={members} orgId={orgId} />

      <Card>
        <CardHeader title="Current AI Governance" action={<Button size="sm" variant="secondary" onClick={() => onNavigate?.('ai_center')}>Open AI Center Settings</Button>} />
        <div className="grid sm:grid-cols-2 gap-x-8 sm:gap-x-12 gap-y-0">
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
        <div className="grid sm:grid-cols-2 gap-x-8 sm:gap-x-12 gap-y-0">
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
        <div className="grid sm:grid-cols-2 gap-x-8 sm:gap-x-12 gap-y-0">
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

function BillingTab({ org, canChangePlan, saving, onPlanChange }) {
  const isOwnerOrAdmin = canChangePlan // kept for the AI usage fetch guard below
  const candidateUsagePercent = Math.min(100, Math.round(((org?.stats?.candidates || 0) / (org?.candidate_limit || 15000)) * 100))
  const currentPlanId = org?.subscription_plan || 'Growth'

  const [aiUsage, setAiUsage] = useState(null)
  useEffect(() => {
    if (!isOwnerOrAdmin || !org?.id) return
    let cancelled = false
    apiRequest('/organization/ai-usage')
      .then(res => { if (!cancelled) setAiUsage(res?.data || null) })
      .catch(() => { if (!cancelled) setAiUsage(null) })
    return () => { cancelled = true }
  }, [isOwnerOrAdmin, org?.id])

  const aiUsagePercent = aiUsage ? Math.min(100, aiUsage.percentUsed) : 0

  return (
    <div className="flex flex-col gap-9">
      {/* Current Subscription Usage */}
      <Card className="overflow-hidden">
        <CardHeader
          title="Subscription & Resource Usage"
          subtitle="Organization-wide SaaS license and active resource utilization."
          action={
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-accent"></span>
              </span>
              <Badge tone="accent" size="md" className="font-semibold px-2.5 py-0.5">
                {currentPlanId} Plan Active
              </Badge>
            </div>
          }
        />
        <div className="grid sm:grid-cols-2 gap-5 p-4 rounded-[var(--radius-md)] bg-surface2/40 border border-border/50">
          <div>
            <div className="flex items-center justify-between text-xs font-semibold mb-2">
              <span className="text-text flex items-center gap-1.5">
                <Icon name="layers" size={15} className="text-accent" />
                Candidate Database Capacity
              </span>
              <span className="text-text font-bold">
                {org?.stats?.candidates || 0} <span className="text-text3 font-normal">/ {currentPlanId === 'Enterprise' ? 'Unlimited' : (org?.candidate_limit || 15000).toLocaleString()}</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-surface3/60 overflow-hidden border border-border/30">
              <div
                className="h-full bg-accent rounded-full transition-all duration-500"
                style={{ width: `${currentPlanId === 'Enterprise' ? 4 : candidateUsagePercent}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-[11px] text-text3 mt-1.5">
              <span>{candidateUsagePercent}% capacity used</span>
              <span>{currentPlanId === 'Enterprise' ? 'Uncapped database' : `${((org?.candidate_limit || 15000) - (org?.stats?.candidates || 0)).toLocaleString()} slots available`}</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs font-semibold mb-2">
              <span className="text-text flex items-center gap-1.5">
                <Icon name="sparkles" size={15} className="text-ai" />
                Monthly AI Credits
              </span>
              <span className="text-text font-bold">
                {aiUsage ? aiUsage.totalCreditsUsed.toLocaleString() : (isOwnerOrAdmin ? 'Loading…' : '—')}
                <span className="text-text3 font-normal"> / {aiUsage ? aiUsage.creditLimit.toLocaleString() : '—'}</span>
              </span>
            </div>
            <div className="h-2 rounded-full bg-surface3/60 overflow-hidden border border-border/30">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  aiUsagePercent >= 80 ? 'bg-gradient-to-r from-orange to-red' : 'bg-gradient-to-r from-accent to-ai'
                )}
                style={{ width: `${aiUsagePercent}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-[11px] text-text3 mt-1.5">
              <span>{aiUsagePercent}% quota consumed</span>
              <span>Resets on the 1st of every month</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Plans */}
      <div>
        <div className="mb-6 text-center max-w-xl mx-auto">
          <h2 className="font-serif text-2xl font-semibold text-text tracking-tight">Plans that grow with your desk</h2>
          <p className="text-sm text-text3 mt-2 leading-relaxed">Every plan includes the full platform — pipeline, tasks, reporting, and AI Copilot. Higher tiers raise your ceilings and unlock deeper AI workflows.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 items-start">
          {PLAN_TIERS.map(plan => {
            const isCurrent = currentPlanId === plan.id
            const isPopular = plan.popular && !isCurrent
            const isEnterprise = plan.id === 'Enterprise'

            return (
              <div
                key={plan.id}
                className={cn(
                  'relative flex flex-col justify-between rounded-[var(--radius-xl)] border p-6 transition-all duration-300 ease-[var(--ease-standard)]',
                  isCurrent
                    ? 'border-accent/60 bg-gradient-to-b from-accent/[0.07] via-surface to-surface shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset,0_16px_40px_-16px_color-mix(in_srgb,var(--accent)_35%,transparent)] ring-1 ring-accent/25'
                    : isPopular
                    ? 'border-ai/40 bg-gradient-to-b from-ai/[0.06] via-surface to-surface shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset,0_20px_48px_-16px_color-mix(in_srgb,var(--ai)_32%,transparent)] lg:-translate-y-2 hover:-translate-y-2.5'
                    : isEnterprise
                    ? 'border-border bg-gradient-to-b from-surface2/60 to-surface shadow-xs hover:border-border-strong hover:shadow-md hover:-translate-y-1'
                    : 'border-border bg-surface shadow-xs hover:border-border-strong hover:shadow-md hover:-translate-y-1'
                )}
              >
                {/* Top accent band */}
                {(isCurrent || isPopular) && (
                  <div className={cn(
                    'absolute top-0 left-0 right-0 h-[3px] rounded-t-[var(--radius-xl)]',
                    isCurrent ? 'bg-accent' : 'bg-gradient-to-r from-accent via-ai to-accent2'
                  )} />
                )}

                <div className="flex flex-col gap-4">
                  {/* Name + badge */}
                  <div className="flex items-center justify-between gap-2 min-h-[24px]">
                    <span className="text-base font-bold text-text">{plan.label}</span>
                    {isCurrent ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-accent text-white">
                        <Icon name="check" size={10} strokeWidth={3} />
                        CURRENT PLAN
                      </span>
                    ) : isPopular ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-gradient-to-r from-accent to-ai text-white">
                        <Icon name="sparkles" size={10} strokeWidth={3} />
                        MOST POPULAR
                      </span>
                    ) : null}
                  </div>

                  {/* Positioning sentence */}
                  <p className="text-xs text-text3 leading-relaxed -mt-2">{plan.tagline}</p>

                  {/* Price */}
                  <div className="flex items-baseline gap-1.5 pt-1">
                    <span className="font-serif text-4xl font-semibold text-text tracking-tight">{plan.price}</span>
                    {plan.period && <span className="text-xs font-medium text-text3">{plan.period}</span>}
                  </div>

                  {/* Value proposition */}
                  <p className="text-[13px] text-text2 leading-relaxed">{plan.valueProp}</p>

                  {/* Resource limits */}
                  <div className="rounded-[var(--radius-md)] bg-surface2/70 border border-border/50 p-3 flex flex-col gap-2.5">
                    <div className="flex items-center gap-2.5 text-xs font-semibold text-text">
                      <div className="p-1.5 rounded-[var(--radius-sm)] bg-accent/12 text-accent shrink-0">
                        <Icon name="layers" size={13} />
                      </div>
                      <span>{plan.candidates}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2.5 text-xs font-semibold text-text">
                        <div className="p-1.5 rounded-[var(--radius-sm)] bg-ai/12 text-ai shrink-0">
                          <Icon name="sparkles" size={13} />
                        </div>
                        <span>{plan.credits}</span>
                      </div>
                      <p className="text-[11px] text-text3 mt-1 ml-[34px] leading-snug">{plan.creditsNote}</p>
                    </div>
                    <div className="flex items-center gap-2.5 text-xs font-semibold text-text">
                      <div className="p-1.5 rounded-[var(--radius-sm)] bg-surface3 text-text2 shrink-0">
                        <Icon name="users" size={13} />
                      </div>
                      <span>{plan.seats}</span>
                    </div>
                  </div>

                  {/* Highlights */}
                  <ul className="flex flex-col gap-2 pt-1">
                    {plan.highlights.map((feat, idx) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <span className="mt-0.5 w-4 h-4 flex items-center justify-center rounded-full bg-green/15 text-green shrink-0">
                          <Icon name="check" size={10} strokeWidth={3} />
                        </span>
                        <span className="leading-snug text-[13px] text-text2">{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* CTA */}
                <div className="pt-6 mt-6 border-t border-border/60">
                  {isCurrent ? (
                    <div className="w-full py-2.5 px-3 text-center rounded-[var(--radius-sm)] bg-accent/10 text-accent font-semibold text-xs border border-accent/20 flex items-center justify-center gap-1.5">
                      <Icon name="checkCircle" size={14} />
                      Current Active Plan
                    </div>
                  ) : canChangePlan ? (
                    <Button
                      size="md"
                      variant={isEnterprise ? 'ai' : isPopular ? 'primary' : 'secondary'}
                      loading={saving}
                      onClick={() => onPlanChange(plan.id)}
                      className="w-full justify-center"
                    >
                      {plan.ctaLabel}
                    </Button>
                  ) : (
                    <div className="w-full py-2.5 text-center text-xs text-text3 font-medium">
                      Contact your Owner to switch plans
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Trust row */}
      <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-3 py-1">
        {TRUST_ROW.map(item => (
          <div key={item.label} className="flex items-center gap-2 text-xs font-medium text-text3">
            <Icon name={item.icon} size={14} className="text-text3" />
            {item.label}
          </div>
        ))}
      </div>

      {/* Plan Comparison Table */}
      <Card className="overflow-hidden">
        <CardHeader
          title="Plan Comparison"
          subtitle="What's actually different between tiers — no aspirational feature list."
        />
        <div className="overflow-x-auto -mx-1 mt-1">
          <table className="w-full text-sm border-collapse min-w-[560px]">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left font-bold text-text3 py-3 px-4 text-[11px] uppercase tracking-wider">
                  Feature
                </th>
                {PLAN_TIERS.map(plan => {
                  const isCurrent = currentPlanId === plan.id
                  return (
                    <th
                      key={plan.id}
                      className={cn(
                        'text-center font-bold py-3 px-4 text-xs tracking-wide',
                        isCurrent ? 'text-accent' : 'text-text'
                      )}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span>{plan.label}</span>
                        {isCurrent && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-accent/12 text-accent uppercase tracking-tighter">
                            Current
                          </span>
                        )}
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            {PLAN_COMPARISON.map(group => (
              <tbody key={group.category}>
                <tr>
                  <td colSpan={PLAN_TIERS.length + 1} className="pt-6 pb-2 px-4 text-[10.5px] font-bold uppercase tracking-wider text-ai">
                    {group.category}
                  </td>
                </tr>
                {group.rows.map(row => (
                  <tr key={row.label} className="border-b border-border/50 hover:bg-surface2/50 transition-colors">
                    <td className="py-3 px-4 text-text2">
                      {row.label}
                    </td>
                    {row.values.map((value, colIdx) => {
                      const planId = PLAN_TIERS[colIdx].id
                      const isCurrentCol = currentPlanId === planId
                      return (
                        <td
                          key={colIdx}
                          className={cn('text-center py-3 px-4', isCurrentCol && 'bg-accent/[0.03]')}
                        >
                          {typeof value === 'boolean' ? (
                            value ? (
                              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green/15 text-green mx-auto">
                                <Icon name="check" size={11} strokeWidth={3} />
                              </span>
                            ) : (
                              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-surface3/50 text-text3/40 mx-auto">
                                <Icon name="x" size={10} strokeWidth={2.5} />
                              </span>
                            )
                          ) : (
                            <span className="font-semibold text-text">{value}</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </Card>
    </div>
  )
}
