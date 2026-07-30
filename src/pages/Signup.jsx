import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { organizationApi } from '../lib/api'

export default function Signup() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const inviteToken = searchParams.get('invite_token')

  const [step, setStep] = useState(inviteToken ? 2 : 1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [inviteDetails, setInviteDetails] = useState(null)

  // Step 1: Company Profile Form
  const [companyName, setCompanyName] = useState('')
  const [website, setWebsite] = useState('')
  const [domain, setDomain] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [industry, setIndustry] = useState('Staffing & Recruiting')

  // Step 2: Account Credentials Form
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  useEffect(() => {
    if (inviteToken) {
      organizationApi.verifyInvitation(inviteToken)
        .then(res => {
          if (res.data) {
            setInviteDetails(res.data)
            setEmail(res.data.email || '')
          }
        })
        .catch(err => {
          setError(err.message || 'Invalid invitation token')
        })
    }
  }, [inviteToken])

  const handleStep1Next = (e) => {
    e.preventDefault()
    if (!companyName.trim()) {
      setError('Company name is required')
      return
    }
    setError('')
    setStep(2)
  }

  const handleFinalSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const payload = {
      full_name: name,
      ...(inviteToken
        ? { invite_token: inviteToken }
        : {
            company: {
              name: companyName,
              website,
              domain,
              logo_url: logoUrl,
              industry,
            },
          }),
    }

    const { error: signUpError } = await signUp(email, password, payload)
    if (signUpError) {
      setError(signUpError.message || 'Signup failed')
      setLoading(false)
    } else {
      navigate('/dashboard')
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '520px' }}>
        {/* Header Branding */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '32px', fontWeight: '700', color: 'var(--accent)', letterSpacing: '-1px' }}>TalentDesk</div>
          <div style={{ fontSize: '12px', color: 'var(--text3)', letterSpacing: '2px', textTransform: 'uppercase', marginTop: '6px' }}>Multi-Tenant Recruiter Platform</div>
        </div>

        {/* Card */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '20px', padding: '36px', boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }}>

          {/* Invitation Banner */}
          {inviteDetails && (
            <div style={{ background: 'rgba(79, 124, 255, 0.1)', border: '1px solid var(--accent)', borderRadius: '12px', padding: '14px 18px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ fontSize: '24px' }}>🏢</div>
              <div>
                <div style={{ fontSize: '13px', color: 'var(--text3)' }}>You were invited to join</div>
                <div style={{ fontSize: '15px', fontWeight: '700', color: 'var(--text)' }}>{inviteDetails.organization?.name}</div>
                <div style={{ fontSize: '12px', color: 'var(--accent)', marginTop: '2px' }}>Role: {inviteDetails.role}</div>
              </div>
            </div>
          )}

          {/* Stepper Progress Bar */}
          {!inviteToken && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: step >= 1 ? 'var(--accent)' : 'var(--surface2)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '700' }}>1</div>
                <span style={{ fontSize: '13px', fontWeight: '600', color: step >= 1 ? 'var(--text)' : 'var(--text3)' }}>Company Details</span>
              </div>
              <div style={{ width: '40px', height: '2px', background: step === 2 ? 'var(--accent)' : 'var(--border)' }}></div>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: step === 2 ? 'var(--accent)' : 'var(--surface2)', color: step === 2 ? '#fff' : 'var(--text3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '700' }}>2</div>
                <span style={{ fontSize: '13px', fontWeight: '600', color: step === 2 ? 'var(--text)' : 'var(--text3)' }}>Admin User</span>
              </div>
            </div>
          )}

          {error && (
            <div style={{ background: 'rgba(255,77,106,0.12)', border: '1px solid rgba(255,77,106,0.3)', borderRadius: '10px', padding: '12px 16px', marginBottom: '20px', fontSize: '13px', color: '#ff4d6a' }}>
              ⚠️ {error}
            </div>
          )}

          {/* STEP 1: Company Profile Setup */}
          {step === 1 && !inviteToken && (
            <form onSubmit={handleStep1Next}>
              <h2 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text)', marginBottom: '6px' }}>Set up your Organization</h2>
              <p style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '24px' }}>Create your company workspace for data isolation and team management.</p>

              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text2)', marginBottom: '6px' }}>Company Name *</label>
                <input
                  type="text"
                  value={companyName}
                  onChange={e => setCompanyName(e.target.value)}
                  placeholder="e.g. ABC Staffing Corp"
                  required
                  style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 16px', color: 'var(--text)', fontSize: '14px', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '18px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text2)', marginBottom: '6px' }}>Domain (Optional)</label>
                  <input
                    type="text"
                    value={domain}
                    onChange={e => setDomain(e.target.value)}
                    placeholder="abcstaffing.com"
                    style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 16px', color: 'var(--text)', fontSize: '14px', outline: 'none' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text2)', marginBottom: '6px' }}>Industry</label>
                  <select
                    value={industry}
                    onChange={e => setIndustry(e.target.value)}
                    style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 16px', color: 'var(--text)', fontSize: '14px', outline: 'none' }}
                  >
                    <option value="Staffing & Recruiting">Staffing & Recruiting</option>
                    <option value="IT Services">IT Services</option>
                    <option value="Healthcare">Healthcare</option>
                    <option value="Corporate HR">Corporate HR</option>
                    <option value="Consulting">Consulting</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text2)', marginBottom: '6px' }}>Website URL (Optional)</label>
                <input
                  type="url"
                  value={website}
                  onChange={e => setWebsite(e.target.value)}
                  placeholder="https://www.abcstaffing.com"
                  style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 16px', color: 'var(--text)', fontSize: '14px', outline: 'none' }}
                />
              </div>

              <button
                type="submit"
                style={{ width: '100%', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '10px', padding: '13px', fontSize: '15px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Continue to Account Setup →
              </button>
            </form>
          )}

          {/* STEP 2: First User Credentials */}
          {step === 2 && (
            <form onSubmit={handleFinalSubmit}>
              <h2 style={{ fontSize: '20px', fontWeight: '700', color: 'var(--text)', marginBottom: '6px' }}>
                {inviteToken ? 'Create Account' : 'Create Owner Account'}
              </h2>
              <p style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '24px' }}>
                {inviteToken ? 'Set up your credentials to join your team.' : `You will be the primary OWNER of ${companyName || 'your company'}.`}
              </p>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text2)', marginBottom: '6px' }}>Full Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Jane Doe"
                  required
                  style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 16px', color: 'var(--text)', fontSize: '14px', outline: 'none' }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text2)', marginBottom: '6px' }}>Work Email *</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="jane@company.com"
                  required
                  disabled={!!inviteToken}
                  style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 16px', color: 'var(--text)', fontSize: '14px', outline: 'none' }}
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: 'var(--text2)', marginBottom: '6px' }}>Password *</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  required
                  style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px 16px', color: 'var(--text)', fontSize: '14px', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                {!inviteToken && (
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    style={{ flex: 1, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '10px', padding: '13px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
                  >
                    ← Back
                  </button>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  style={{ flex: 2, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '10px', padding: '13px', fontSize: '15px', fontWeight: '600', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}
                >
                  {loading ? 'Creating Organization...' : 'Complete Registration 🚀'}
                </button>
              </div>
            </form>
          )}

          <p style={{ textAlign: 'center', marginTop: '24px', fontSize: '13px', color: 'var(--text3)' }}>
            Already have an account?{' '}
            <Link to="/login" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: '600' }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
