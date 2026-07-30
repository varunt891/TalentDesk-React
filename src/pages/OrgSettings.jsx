import { useState, useEffect } from 'react'
import { organizationApi } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import Select from '../components/Select'

const SUBSCRIPTION_PLAN_OPTIONS = [
  { value: 'Starter', label: 'Starter', desc: '250 Candidates | 250 AI Credits' },
  { value: 'Growth', label: 'Growth', desc: '500 Candidates | 1,000 AI Credits' },
  { value: 'Enterprise', label: 'Enterprise', desc: '2,500 Candidates | 5,000 AI Credits' },
]

export default function OrgSettings() {
  const { profile, organization: cachedOrg, refreshOrg, switchOrganization } = useAuth()
  const [org, setOrg] = useState(null)
  const [allOrgs, setAllOrgs] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [switchingId, setSwitchingId] = useState(null)
  const [msg, setMsg] = useState({ type: '', text: '' })

  // Superadmin Onboard Modal State
  const [showOnboardModal, setShowOnboardModal] = useState(false)
  const [onboardForm, setOnboardForm] = useState({
    name: '',
    domain: '',
    website: '',
    industry: 'Staffing & Recruiting',
    subscription_plan: 'Growth',
    candidate_limit: 500,
    ai_credit_limit: 1000,
    owner_name: '',
    owner_email: '',
  })
  const [createdInviteUrl, setCreatedInviteUrl] = useState('')
  const [onboarding, setOnboarding] = useState(false)

  const [form, setForm] = useState({
    name: '',
    domain: '',
    website: '',
    logo_url: '',
    industry: '',
    company_size: '',
    timezone: 'Asia/Calcutta',
  })

  const isSuperAdmin = profile?.role === 'superadmin' || profile?.role === 'SUPERADMIN'
  const isOwnerOrAdmin = isSuperAdmin || ['ADMIN', 'OWNER', 'admin', 'owner'].includes(profile?.role)

  useEffect(() => {
    loadOrgDetails()
    if (isSuperAdmin) {
      loadAllOrgs()
    }
  }, [isSuperAdmin])

  const loadOrgDetails = async () => {
    setLoading(true)
    try {
      const res = await organizationApi.getOrg()
      if (res.data) {
        setOrg(res.data)
        setForm({
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
      setMsg({ type: 'error', text: err.message || 'Failed to load organization settings' })
    } finally {
      setLoading(false)
    }
  }

  const loadAllOrgs = async () => {
    try {
      const res = await organizationApi.getAllOrgs()
      if (res.data) setAllOrgs(res.data)
    } catch {
      /* ignore */
    }
  }

  const handleSwitchWorkspace = async (targetOrgId, targetName) => {
    setSwitchingId(targetOrgId)
    setMsg({ type: '', text: '' })
    try {
      const res = await switchOrganization(targetOrgId)
      if (res?.data) {
        setMsg({ type: 'success', text: `Switched active workspace to "${targetName}"!` })
        await loadOrgDetails()
        await loadAllOrgs()
      }
    } catch (err) {
      setMsg({ type: 'error', text: err?.message || 'Failed to switch workspace' })
    } finally {
      setSwitchingId(null)
    }
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMsg({ type: '', text: '' })
    try {
      const res = await organizationApi.updateOrg(form)
      if (res.data) {
        setOrg(prev => ({ ...prev, ...res.data }))
        refreshOrg(res.data)
        setMsg({ type: 'success', text: 'Organization profile updated successfully!' })
      }
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Failed to update organization' })
    } finally {
      setSaving(false)
    }
  }

  const handleOnboardSubmit = async (e) => {
    e.preventDefault()
    setOnboarding(true)
    setMsg({ type: '', text: '' })
    try {
      const res = await organizationApi.onboardOrg(onboardForm)
      if (res.data) {
        setMsg({ type: 'success', text: `Organization "${res.data.name}" onboarded successfully!` })
        if (res.invite_url) {
          setCreatedInviteUrl(res.invite_url)
        } else {
          setShowOnboardModal(false)
        }
        loadAllOrgs()
      }
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Failed to onboard organization' })
    } finally {
      setOnboarding(false)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '32px', color: 'var(--text3)' }}>
        Loading organization settings...
      </div>
    )
  }

  const candidateUsagePercent = Math.min(100, Math.round(((org?.stats?.candidates || 0) / (org?.candidate_limit || 500)) * 100))
  const aiCreditUsagePercent = Math.min(100, Math.round((45 / (org?.ai_credit_limit || 1000)) * 100))

  const handlePlanChange = async (targetPlan) => {
    setSaving(true)
    setMsg({ type: '', text: '' })
    try {
      const res = await organizationApi.updateOrg({ subscription_plan: targetPlan })
      setMsg({ type: 'success', text: `Subscription plan updated to ${targetPlan}!` })
      if (res.data) {
        setOrg(prev => ({ ...prev, ...res.data }))
        refreshOrg(res.data)
      }
    } catch (err) {
      setMsg({ type: 'error', text: err.message || 'Failed to update subscription plan' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="org-settings-page" style={{ width: '100%', maxWidth: '1100px', margin: '0 auto', boxSizing: 'border-box' }}>

      {/* Title & Header Toolbar */}
      <div className="workspace-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '26px', fontWeight: '800', color: 'var(--text)', letterSpacing: '-0.5px' }}>Organization Settings</h1>
          <p style={{ fontSize: '14px', color: 'var(--text3)', marginTop: '4px' }}>Manage company profile, domain isolation, limits, and subscription details.</p>
        </div>

        {isSuperAdmin && (
          <button
            className="td-btn-accent"
            onClick={() => {
              setShowOnboardModal(true)
              setCreatedInviteUrl('')
              setOnboardForm({
                name: '',
                domain: '',
                website: '',
                industry: 'Staffing & Recruiting',
                subscription_plan: 'Growth',
                candidate_limit: 500,
                ai_credit_limit: 1000,
                owner_name: '',
                owner_email: '',
              })
            }}
            style={{
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              padding: '12px 20px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              flexShrink: 0
            }}
          >
            <span>✨</span> Onboard New Organization
          </button>
        )}
      </div>

      {msg.text && (
        <div style={{
          padding: '12px 16px',
          borderRadius: '10px',
          marginBottom: '24px',
          fontSize: '14px',
          background: msg.type === 'error' ? 'rgba(255,77,106,0.12)' : 'rgba(34,197,94,0.12)',
          color: msg.type === 'error' ? '#ff4d6a' : '#22c55e',
          border: `1px solid ${msg.type === 'error' ? 'rgba(255,77,106,0.3)' : 'rgba(34,197,94,0.3)'}`
        }}>
          {msg.type === 'error' ? '⚠️ ' : '✅ '}{msg.text}
        </div>
      )}

      {/* Superadmin Platform Organizations Overview */}
      {isSuperAdmin && allOrgs.length > 0 && (
        <div className="workspace-card" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px', marginBottom: '32px' }}>
          <div className="org-settings-superadmin-heading" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', gap: '10px', flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text)' }}>
              All Platform Organizations ({allOrgs.length})
            </h2>
            <span style={{ fontSize: '12px', background: 'rgba(168,85,247,0.15)', color: '#a855f7', padding: '4px 10px', borderRadius: '12px', fontWeight: '700' }}>
              SUPERADMIN PRIVILEGED VIEW
            </span>
          </div>

          <div className="org-settings-superadmin-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
            {allOrgs.map(o => {
              const isActive = o.id === org?.id
              const isSwitching = switchingId === o.id
              return (
                <div
                  key={o.id}
                  className="org-settings-superadmin-card"
                  style={{
                    background: isActive ? 'rgba(79, 124, 255, 0.08)' : 'var(--surface2)',
                    border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: '14px',
                    padding: '18px',
                    display: 'flex',
                    flexDirection: 'column',
                    justify: 'space-between',
                    boxShadow: isActive ? '0 0 16px rgba(79,124,255,0.15)' : 'none',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text)' }}>{o.name}</div>
                      {isActive && (
                        <span style={{ fontSize: '10px', background: 'var(--accent)', color: '#fff', padding: '3px 8px', borderRadius: '12px', fontWeight: '700', textTransform: 'uppercase' }}>
                          Active
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '12px' }}>Domain: {o.domain || o.email_domain || '—'}</div>
                    <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: 'var(--text2)', borderTop: '1px solid var(--border)', paddingTop: '10px', marginBottom: '14px' }}>
                      <span>👥 {o.stats?.members || 0} members</span>
                      <span>📄 {o.stats?.candidates || 0} candidates</span>
                    </div>
                  </div>

                  {isActive ? (
                    <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>✓ Current Active Workspace</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleSwitchWorkspace(o.id, o.name)}
                      disabled={isSwitching}
                      style={{
                        width: '100%',
                        background: 'var(--surface)',
                        color: 'var(--accent)',
                        border: '1px solid var(--accent)',
                        borderRadius: '8px',
                        padding: '8px 12px',
                        fontSize: '13px',
                        fontWeight: '600',
                        cursor: isSwitching ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}
                    >
                      {isSwitching ? 'Switching...' : 'Switch Workspace →'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="org-settings-main-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px' }}>

        {/* Left Column: Active Organization Profile Form */}
        <div className="workspace-card" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '28px' }}>
          <div className="org-settings-profile-head" style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
            <div style={{
              width: '60px',
              height: '60px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, var(--accent), #7928CA)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              color: '#fff',
              fontWeight: '700'
            }}>
              {form.name ? form.name.charAt(0).toUpperCase() : '🏢'}
            </div>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--text)' }}>{org?.name || 'Company Profile'}</h2>
              <div style={{ fontSize: '13px', color: 'var(--text3)' }}>Tenant ID: <code style={{ color: 'var(--accent)', background: 'var(--surface2)', padding: '2px 6px', borderRadius: '4px' }}>{org?.id}</code></div>
            </div>
          </div>

          <form onSubmit={handleSave}>
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text2)', marginBottom: '6px' }}>Company Name</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                disabled={!isOwnerOrAdmin}
                required
                style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 14px', color: 'var(--text)', fontSize: '14px', outline: 'none' }}
              />
            </div>

            <div className="modal-grid-2" style={{ gap: '14px', marginBottom: '18px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text2)', marginBottom: '6px' }}>Primary Domain</label>
                <input
                  type="text"
                  value={form.domain}
                  onChange={e => setForm({ ...form, domain: e.target.value })}
                  disabled={!isOwnerOrAdmin}
                  placeholder="company.com"
                  style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 14px', color: 'var(--text)', fontSize: '14px', outline: 'none' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text2)', marginBottom: '6px' }}>Industry</label>
                <input
                  type="text"
                  value={form.industry}
                  onChange={e => setForm({ ...form, industry: e.target.value })}
                  disabled={!isOwnerOrAdmin}
                  style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 14px', color: 'var(--text)', fontSize: '14px', outline: 'none' }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text2)', marginBottom: '6px' }}>Website</label>
              <input
                type="url"
                value={form.website}
                onChange={e => setForm({ ...form, website: e.target.value })}
                disabled={!isOwnerOrAdmin}
                placeholder="https://www.company.com"
                style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 14px', color: 'var(--text)', fontSize: '14px', outline: 'none' }}
              />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text2)', marginBottom: '6px' }}>Logo URL</label>
              <input
                type="url"
                value={form.logo_url}
                onChange={e => setForm({ ...form, logo_url: e.target.value })}
                disabled={!isOwnerOrAdmin}
                placeholder="https://example.com/logo.png"
                style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 14px', color: 'var(--text)', fontSize: '14px', outline: 'none' }}
              />
            </div>

            {isOwnerOrAdmin && (
              <button
                type="submit"
                disabled={saving}
                style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px', padding: '11px 24px', fontSize: '14px', fontWeight: '600', cursor: saving ? 'not-allowed' : 'pointer' }}
              >
                {saving ? 'Saving changes...' : 'Save Changes'}
              </button>
            )}
          </form>
        </div>

        {/* Right Column: Plan & Meter Stats */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* Subscription Card */}
          <div className="workspace-card" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '16px', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text)' }}>Subscription</h3>
              <span style={{ background: 'rgba(79, 124, 255, 0.15)', color: 'var(--accent)', padding: '4px 10px', borderRadius: '20px', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase' }}>
                {org?.subscription_plan || 'Growth'}
              </span>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '20px' }}>Organization-wide SaaS license with centralized billing.</p>

            {/* Meter 1: Candidates */}
            <div style={{ marginBottom: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: '600', marginBottom: '6px' }}>
                <span style={{ color: 'var(--text2)' }}>Candidate Database Limit</span>
                <span style={{ color: 'var(--text)' }}>{org?.stats?.candidates || 0} / {org?.candidate_limit || 500}</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'var(--surface2)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${candidateUsagePercent}%`, height: '100%', background: candidateUsagePercent > 90 ? '#ff4d6a' : 'var(--accent)', transition: 'width 0.3s' }}></div>
              </div>
            </div>

            {/* Meter 2: AI Credits */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: '600', marginBottom: '6px' }}>
                <span style={{ color: 'var(--text2)' }}>AI Copilot Monthly Credits</span>
                <span style={{ color: 'var(--text)' }}>45 / {org?.ai_credit_limit || 1000}</span>
              </div>
              <div style={{ width: '100%', height: '8px', background: 'var(--surface2)', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${aiCreditUsagePercent}%`, height: '100%', background: '#10b981', transition: 'width 0.3s' }}></div>
              </div>
            </div>
          </div>

          {/* Security & RLS Badge */}
          <div className="workspace-card" style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '16px', padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#10b981', fontWeight: '700', fontSize: '14px', marginBottom: '6px' }}>
              <span>🛡️ Data Isolation Enforced</span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text3)', lineHeight: '1.5' }}>
              Database Row Level Security (RLS) policies isolate candidate profiles, jobs, pipelines, and AI logs exclusively to {org?.name}.
            </p>
          </div>

        </div>

      </div>

      {/* Interactive SaaS Subscription Plans & Feature Matrix */}
      <div className="workspace-card" style={{ marginTop: '40px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '20px', padding: '32px' }}>
        <div style={{ textAlign: 'center', maxWidth: '650px', margin: '0 auto 32px' }}>
          <span style={{ background: 'rgba(79,124,255,0.12)', color: 'var(--accent)', padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Flexible SaaS Licensing
          </span>
          <h2 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--text)', marginTop: '10px', letterSpacing: '-0.5px' }}>
            Subscription Plans & Feature Matrix
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--text3)', marginTop: '6px' }}>
            Scale your staffing agency with candidate storage, team seats, and AI copilot quotas tailored to your hiring volume.
          </p>
        </div>

        {/* 3-Column Plan Tier Cards */}
        <div className="org-settings-plan-cards" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '36px' }}>
          {[
            {
              id: 'Starter',
              title: '🚀 Starter Plan',
              price: '$49',
              period: '/ mo',
              annualNote: '$39/mo billed annually',
              desc: 'Best for solo recruiters & early-stage staffing boutiques.',
              candidates: '250 Candidates',
              credits: '250 AI Credits/mo',
              seats: 'Up to 3 Users',
              badge: 'Entry Level',
              accent: '#64748b'
            },
            {
              id: 'Growth',
              title: '⚡ Growth Plan',
              price: '$149',
              period: '/ mo',
              annualNote: '$119/mo billed annually',
              desc: 'Best for active staffing firms leveraging AI copilot automation.',
              candidates: '500 Candidates',
              credits: '1,000 AI Credits/mo',
              seats: 'Up to 15 Users',
              badge: 'MOST POPULAR',
              accent: '#2563eb'
            },
            {
              id: 'Enterprise',
              title: '🏢 Enterprise Plan',
              price: '$399',
              period: '/ mo',
              annualNote: '$319/mo billed annually',
              desc: 'Best for high-volume recruitment firms & multi-branch agencies.',
              candidates: '2,500 Candidates',
              credits: '5,000 AI Credits/mo',
              seats: 'Unlimited Users',
              badge: 'MAX POWER',
              accent: '#7c5cff'
            }
          ].map(plan => {
            const isCurrent = (org?.subscription_plan || 'Growth') === plan.id
            return (
              <div
                key={plan.id}
                className="org-settings-plan-card"
                style={{
                  background: isCurrent ? 'linear-gradient(180deg, rgba(37,99,235,0.06), var(--surface2))' : 'var(--surface2)',
                  border: isCurrent ? `2px solid ${plan.accent}` : '1px solid var(--border)',
                  borderRadius: '16px',
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  justify: 'space-between',
                  position: 'relative'
                }}
              >
                {isCurrent && (
                  <span style={{ position: 'absolute', top: -12, right: 16, background: plan.accent, color: '#fff', padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '800', textTransform: 'uppercase' }}>
                    Current Plan
                  </span>
                )}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '800', color: 'var(--text)' }}>{plan.title}</h3>
                    {!isCurrent && <span style={{ fontSize: '10px', background: 'var(--surface3)', color: 'var(--text3)', padding: '2px 8px', borderRadius: '10px', fontWeight: '700' }}>{plan.badge}</span>}
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <span style={{ fontSize: '32px', fontWeight: '900', color: 'var(--text)', letterSpacing: '-1px' }}>{plan.price}</span>
                    <span style={{ fontSize: '13px', color: 'var(--text3)', fontWeight: '600', marginLeft: '4px' }}>{plan.period}</span>
                    <div style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: '600', marginTop: '2px' }}>{plan.annualNote}</div>
                  </div>

                  <p style={{ fontSize: '12.5px', color: 'var(--text3)', lineHeight: '1.4', marginBottom: '16px' }}>{plan.desc}</p>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px 14px', background: 'var(--surface)', borderRadius: '10px', border: '1px solid var(--border)', marginBottom: '18px', fontSize: '13px', color: 'var(--text)' }}>
                    <div>📂 <b>{plan.candidates}</b></div>
                    <div>⚡ <b>{plan.credits}</b></div>
                    <div>👥 <b>{plan.seats}</b></div>
                  </div>
                </div>

                {isOwnerOrAdmin ? (
                  <button
                    type="button"
                    disabled={saving || isCurrent}
                    onClick={() => handlePlanChange(plan.id)}
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      borderRadius: '10px',
                      border: 'none',
                      background: isCurrent ? 'var(--surface3)' : plan.accent,
                      color: isCurrent ? 'var(--text2)' : '#ffffff',
                      fontWeight: '700',
                      fontSize: '13px',
                      cursor: isCurrent || saving ? 'default' : 'pointer',
                      transition: 'all 0.2s'
                    }}
                  >
                    {isCurrent ? 'Active Plan' : `Switch to ${plan.id}`}
                  </button>
                ) : (
                  <span style={{ fontSize: '12px', color: 'var(--text3)', textAlign: 'center', display: 'block' }}>
                    Contact Owner to change plan
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* Detailed Comparison Table with Ticks (✅) and Crosses (❌) */}
        <div className="org-settings-scroll-hint" style={{ display: 'none', fontSize: '11.5px', color: 'var(--text3)', marginBottom: '8px', textAlign: 'center' }}>
          ← Swipe to compare plans →
        </div>
        <div style={{ border: '1px solid var(--border)', borderRadius: '14px', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <table style={{ width: '100%', minWidth: '600px', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)', color: 'var(--text)' }}>
                <th style={{ padding: '14px 18px', fontWeight: '700' }}>Feature / Capability</th>
                <th style={{ padding: '14px 18px', fontWeight: '700', textAlign: 'center', width: '22%' }}>
                  🚀 Starter
                  <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 'normal', marginTop: '2px' }}>$49 / month</div>
                </th>
                <th style={{ padding: '14px 18px', fontWeight: '700', textAlign: 'center', width: '24%', background: 'rgba(37,99,235,0.08)', color: 'var(--accent)' }}>
                  ⚡ Growth
                  <div style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: '700', marginTop: '2px' }}>$149 / month</div>
                </th>
                <th style={{ padding: '14px 18px', fontWeight: '700', textAlign: 'center', width: '24%' }}>
                  🏢 Enterprise
                  <div style={{ fontSize: '11px', color: 'var(--text3)', fontWeight: 'normal', marginTop: '2px' }}>$399 / month</div>
                </th>
              </tr>
            </thead>
            <tbody>
              {[
                { feature: 'Monthly SaaS Price (Billed Monthly)', starter: '$49 / mo', growth: '$149 / mo', enterprise: '$399 / mo', isQuota: true },
                { feature: 'Annual Discounted Price', starter: '$39 / mo', growth: '$119 / mo', enterprise: '$319 / mo', isQuota: true },
                { feature: 'Candidate Capacity Limit', starter: '250 Candidates', growth: '500 Candidates', enterprise: '2,500 Candidates', isQuota: true },
                { feature: 'Monthly AI Copilot Credits', starter: '250 Credits', growth: '1,000 Credits', enterprise: '5,000 Credits', isQuota: true },
                { feature: 'User Seats / Team Members', starter: 'Up to 3 Users', growth: 'Up to 15 Users', enterprise: 'Unlimited Users', isQuota: true },
                { feature: 'Candidate Database & Pipeline Kanban', starter: '✅', growth: '✅', enterprise: '✅' },
                { feature: 'Job Requisitions & Client Tracking', starter: '✅', growth: '✅', enterprise: '✅' },
                { feature: 'Recruiter Mission Board & Daily Tasks', starter: '✅', growth: '✅', enterprise: '✅' },
                { feature: 'Basic AI Resume Parsing & Email Drafts', starter: '✅', growth: '✅', enterprise: '✅' },
                { feature: 'TalentDesk AI Action Copilot (CRM Controller)', starter: '❌', growth: '✅', enterprise: '✅' },
                { feature: '1-Click AI Client Submission Packets', starter: '❌', growth: '✅', enterprise: '✅' },
                { feature: 'Deep AI Candidate Fit Radar & Skill Matrix', starter: '❌', growth: '✅', enterprise: '✅' },
                { feature: 'Recruiter Yield Leaderboard & Analytics', starter: '❌', growth: '✅', enterprise: '✅' },
                { feature: 'Granular Team Roles & Org Chart Hierarchy', starter: 'Basic Roles', growth: '✅ Full Access', enterprise: '✅ Custom Roles' },
                { feature: '1-Click Multi-Workspace Switcher', starter: '❌', growth: '❌', enterprise: '✅' },
                { feature: 'White-Labeling & Custom Packet Branding', starter: '❌', growth: '❌', enterprise: '✅' },
                { feature: 'Admin Audit Logs & Compliance Export', starter: '❌', growth: '❌', enterprise: '✅' },
                { feature: 'Priority AI Processing Queue', starter: '❌', growth: '❌', enterprise: '✅' },
                { feature: 'Dedicated Support SLA & Account Manager', starter: '❌', growth: '❌', enterprise: '✅' },
              ].map((row, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid var(--border)', background: idx % 2 === 0 ? 'var(--surface)' : 'var(--surface2)' }}>
                  <td style={{ padding: '12px 18px', color: 'var(--text)', fontWeight: '600' }}>{row.feature}</td>
                  <td style={{ padding: '12px 18px', textAlign: 'center', color: row.starter === '❌' ? '#ef4444' : row.starter === '✅' ? '#10b981' : 'var(--text)', fontWeight: row.isQuota ? '700' : 'normal' }}>
                    {row.starter}
                  </td>
                  <td style={{ padding: '12px 18px', textAlign: 'center', background: 'rgba(37,99,235,0.04)', color: row.growth === '❌' ? '#ef4444' : row.growth === '✅' ? '#10b981' : 'var(--accent)', fontWeight: row.isQuota ? '700' : 'normal' }}>
                    {row.growth}
                  </td>
                  <td style={{ padding: '12px 18px', textAlign: 'center', color: row.enterprise === '❌' ? '#ef4444' : row.enterprise === '✅' ? '#10b981' : 'var(--text)', fontWeight: row.isQuota ? '700' : 'normal' }}>
                    {row.enterprise}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* SUPERADMIN ONBOARD ORGANIZATION MODAL */}
      {showOnboardModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }} onClick={e => e.target === e.currentTarget && setShowOnboardModal(false)}>
          <div className="modal-card-responsive" style={{ width: '100%', maxWidth: '520px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '20px', boxShadow: '0 20px 40px rgba(0,0,0,0.5)', animation: 'slideIn 0.25s ease-out', maxHeight: '90vh', overflowY: 'auto', boxSizing: 'border-box' }}>

            <div className="modal-header-responsive" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 32px 0' }}>
              <h2 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text)' }}>Onboard New Organization</h2>
              <button onClick={() => setShowOnboardModal(false)} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: '20px', cursor: 'pointer' }}>✕</button>
            </div>

            <div className="modal-body-responsive" style={{ padding: '20px 32px 32px' }}>
              {!createdInviteUrl ? (
                <form onSubmit={handleOnboardSubmit}>
                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text2)', marginBottom: '6px' }}>Organization Name *</label>
                    <input
                      type="text"
                      value={onboardForm.name}
                      onChange={e => setOnboardForm({ ...onboardForm, name: e.target.value })}
                      placeholder="Acme Staffing Inc"
                      required
                      style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 14px', color: 'var(--text)', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>

                  <div className="modal-grid-2" style={{ gap: '12px', marginBottom: '16px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text2)', marginBottom: '6px' }}>Domain</label>
                      <input
                        type="text"
                        value={onboardForm.domain}
                        onChange={e => setOnboardForm({ ...onboardForm, domain: e.target.value })}
                        placeholder="acme.com"
                        style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '8px', padding: '10px 14px', color: 'var(--text)', fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text2)', marginBottom: '6px' }}>Subscription Plan</label>
                      <Select
                        value={onboardForm.subscription_plan}
                        options={SUBSCRIPTION_PLAN_OPTIONS}
                        onChange={plan => {
                          let candLimit = 500
                          let aiLimit = 1000
                          if (plan === 'Starter') { candLimit = 250; aiLimit = 250 }
                          if (plan === 'Growth') { candLimit = 500; aiLimit = 1000 }
                          if (plan === 'Enterprise') { candLimit = 2500; aiLimit = 5000 }
                          setOnboardForm({ ...onboardForm, subscription_plan: plan, candidate_limit: candLimit, ai_credit_limit: aiLimit })
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text)', marginBottom: '10px' }}>Initial Company Owner</div>

                    <div style={{ marginBottom: '10px' }}>
                      <input
                        type="text"
                        value={onboardForm.owner_name}
                        onChange={e => setOnboardForm({ ...onboardForm, owner_name: e.target.value })}
                        placeholder="Owner Name (e.g. Sarah Connor)"
                        style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px 12px', color: 'var(--text)', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>

                    <div>
                      <input
                        type="email"
                        value={onboardForm.owner_email}
                        onChange={e => setOnboardForm({ ...onboardForm, owner_email: e.target.value })}
                        placeholder="owner@acme.com"
                        style={{ width: '100%', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '8px 12px', color: 'var(--text)', fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '12px' }}>
                    <button
                      type="button"
                      onClick={() => setShowOnboardModal(false)}
                      style={{ flex: 1, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={onboarding}
                      style={{ flex: 2, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '10px', padding: '12px', fontSize: '14px', fontWeight: '600', cursor: onboarding ? 'not-allowed' : 'pointer' }}
                    >
                      {onboarding ? 'Creating Organization...' : 'Onboard Organization ✨'}
                    </button>
                  </div>
                </form>
              ) : (
                <div>
                  <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                    <div style={{ fontSize: '36px', marginBottom: '8px' }}>🎉</div>
                    <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--text)' }}>Organization Onboarded!</h3>
                    <p style={{ fontSize: '13px', color: 'var(--text3)', marginTop: '4px' }}>Send this invitation link to the company Owner to set up their account:</p>
                  </div>

                  <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px', fontSize: '13px', wordBreak: 'break-all', color: 'var(--accent)', marginBottom: '20px' }}>
                    {createdInviteUrl}
                  </div>

                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(createdInviteUrl)
                      alert('Invitation link copied to clipboard!')
                      setShowOnboardModal(false)
                    }}
                    style={{ width: '100%', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '10px', padding: '12px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
                  >
                    📋 Copy Owner Invite Link
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

    </div>
  )
}
