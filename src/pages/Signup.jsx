import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { organizationApi } from '../lib/api'
import { Button, FormField, Input, Select } from '../components/ui'
import { Icon } from '../components/ui/icons'

const INDUSTRY_OPTIONS = ['Staffing & Recruiting', 'IT Services', 'Healthcare', 'Corporate HR', 'Consulting'].map(v => ({ value: v, label: v }))

const HIGHLIGHTS = [
  { icon: 'layers', title: 'Unified pipeline', body: 'Candidates, jobs, callbacks, and follow-ups in one focused workspace.' },
  { icon: 'sparkles', title: 'AI copilot built in', body: 'Draft, summarize, and score candidates without leaving your flow.' },
  { icon: 'lock', title: 'Isolated by design', body: 'Your organization\'s data stays yours — private by default, team-ready from day one.' },
]

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
        .catch(err => setError(err.message || 'Invalid invitation token'))
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
        : { company: { name: companyName, website, domain, industry } }),
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
    <main className="relative min-h-dvh w-full bg-bg text-text overflow-hidden flex items-center justify-center p-6">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div
          className="absolute -top-40 -left-32 w-[560px] h-[560px] rounded-full opacity-[0.12] blur-[120px]"
          style={{ background: 'var(--accent)' }}
        />
        <div
          className="absolute -bottom-48 -right-32 w-[560px] h-[560px] rounded-full opacity-[0.10] blur-[120px]"
          style={{ background: 'var(--ai)' }}
        />
      </div>

      <section className="relative w-full max-w-5xl grid lg:grid-cols-2 gap-10 lg:gap-16 items-center py-10">
        <div className="hidden lg:flex flex-col gap-10">
          <Link to="/" aria-label="TalentDesk home" className="focus-ring inline-flex items-center gap-2.5 w-fit rounded-[var(--radius-sm)]">
            <span className="w-9 h-9 rounded-[var(--radius-sm)] flex items-center justify-center text-sm font-extrabold bg-gradient-to-br from-accent to-accent2 text-white shrink-0">
              TD
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-[15px] font-extrabold text-text tracking-tight">TalentDesk</span>
              <span className="text-[10px] font-semibold text-text3 uppercase tracking-wider">Recruiter CRM</span>
            </span>
          </Link>

          <div className="flex flex-col gap-4 max-w-md">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-widest text-accent bg-accent/10 rounded-full px-2.5 py-1 w-fit">
              {inviteToken ? "You're invited" : 'Start hiring smarter'}
            </span>
            <h1 className="text-[32px] leading-[1.15] font-extrabold text-text tracking-[-0.02em]">
              {inviteToken ? 'Join your team on TalentDesk.' : 'Set up your recruiting workspace.'}
            </h1>
            <p className="text-[14px] text-text2 leading-relaxed">
              {inviteToken
                ? 'Create your credentials to start collaborating with your team.'
                : 'A focused, AI-assisted CRM for staffing teams — candidates, jobs, and pipeline in one place.'}
            </p>
          </div>

          <div className="flex flex-col gap-4 max-w-md" aria-label="What you get with TalentDesk">
            {HIGHLIGHTS.map(h => (
              <div className="flex items-start gap-3" key={h.title}>
                <span className="w-9 h-9 rounded-[var(--radius-sm)] bg-surface border border-border shadow-xs flex items-center justify-center text-accent shrink-0">
                  <Icon name={h.icon} size={16} />
                </span>
                <div className="min-w-0">
                  <strong className="block text-[13px] font-bold text-text">{h.title}</strong>
                  <span className="block text-[12.5px] text-text3 leading-relaxed mt-0.5">{h.body}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-surface border border-border rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] p-7 sm:p-8 w-full max-w-md mx-auto lg:mx-0" aria-busy={loading}>
          <div className="flex lg:hidden items-center gap-2.5 mb-6">
            <span className="w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center text-sm font-extrabold bg-gradient-to-br from-accent to-accent2 text-white shrink-0">
              TD
            </span>
            <span className="text-[15px] font-extrabold text-text tracking-tight">TalentDesk</span>
          </div>

          {inviteDetails && (
            <div className="flex items-start gap-3 bg-accent/8 border border-accent/25 rounded-[var(--radius-md)] px-3.5 py-3 mb-5">
              <span className="w-8 h-8 rounded-[var(--radius-sm)] bg-surface border border-border flex items-center justify-center text-accent shrink-0">
                <Icon name="building" size={15} />
              </span>
              <div className="min-w-0">
                <div className="text-[11px] text-text3">You were invited to join</div>
                <strong className="block text-sm font-bold text-text">{inviteDetails.organization?.name}</strong>
                <span className="block text-xs text-text3">Role: {inviteDetails.role}</span>
              </div>
            </div>
          )}

          {!inviteToken && (
            <div className="flex items-center gap-2.5 mb-6" aria-label="Signup progress">
              <StepDot active={step >= 1} done={step > 1}>1</StepDot>
              <span className="text-xs font-semibold text-text3">Company details</span>
              <span className={cnStepLine(step > 1)} aria-hidden="true" />
              <StepDot active={step === 2} done={false}>2</StepDot>
              <span className="text-xs font-semibold text-text3">Admin account</span>
            </div>
          )}

          {error && (
            <div role="alert" aria-live="polite" className="flex items-start gap-2 bg-red/10 border border-red/25 text-red text-[13px] rounded-[var(--radius-sm)] px-3 py-2.5 mb-5">
              <Icon name="alertCircle" size={14} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {step === 1 && !inviteToken && (
            <form className="flex flex-col gap-4" onSubmit={handleStep1Next}>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-accent mb-2">Step 1 of 2</p>
                <h2 className="text-xl font-extrabold text-text tracking-tight">Set up your organization</h2>
                <p className="text-[13px] text-text3 mt-1.5">Create your company workspace for data isolation and team management.</p>
              </div>

              <FormField label="Company name" htmlFor="signup-company">
                <Input id="signup-company" type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="e.g. ABC Staffing Corp" autoComplete="organization" required />
              </FormField>

              <div className="grid grid-cols-2 gap-3">
                <FormField label="Domain (optional)" htmlFor="signup-domain">
                  <Input id="signup-domain" type="text" value={domain} onChange={e => setDomain(e.target.value)} placeholder="abcstaffing.com" />
                </FormField>
                <FormField label="Industry" htmlFor="signup-industry">
                  <Select value={industry} onChange={setIndustry} options={INDUSTRY_OPTIONS} />
                </FormField>
              </div>

              <FormField label="Website (optional)" htmlFor="signup-website">
                <Input id="signup-website" type="url" value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://www.abcstaffing.com" autoComplete="url" />
              </FormField>

              <Button type="submit" size="lg" className="w-full mt-1.5">Continue to account setup</Button>
            </form>
          )}

          {step === 2 && (
            <form className="flex flex-col gap-4" onSubmit={handleFinalSubmit}>
              <div>
                {!inviteToken && <p className="text-[10px] font-extrabold uppercase tracking-widest text-accent mb-2">Step 2 of 2</p>}
                <h2 className="text-xl font-extrabold text-text tracking-tight">{inviteToken ? 'Create your account' : 'Create the owner account'}</h2>
                <p className="text-[13px] text-text3 mt-1.5">{inviteToken ? 'Set up your credentials to join your team.' : `You'll be the primary owner of ${companyName || 'your company'}.`}</p>
              </div>

              <FormField label="Full name" htmlFor="signup-name">
                <Input id="signup-name" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Jane Doe" autoComplete="name" required />
              </FormField>

              <FormField label="Work email" htmlFor="signup-email">
                <Input id="signup-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jane@company.com" autoComplete="email" required disabled={!!inviteToken} />
              </FormField>

              <FormField label="Password" htmlFor="signup-password">
                <Input id="signup-password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 6 characters" autoComplete="new-password" minLength={6} required />
              </FormField>

              <div className="flex items-center gap-2 mt-1.5">
                {!inviteToken && (
                  <Button type="button" variant="secondary" size="lg" onClick={() => setStep(1)}>Back</Button>
                )}
                <Button type="submit" size="lg" loading={loading} className="flex-1">
                  {loading ? 'Creating organization...' : 'Complete registration'}
                </Button>
              </div>
            </form>
          )}

          <p className="text-center text-[13px] text-text3 mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-accent font-semibold hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </section>
    </main>
  )
}

function cnStepLine(done) {
  return `flex-1 h-px min-w-6 ${done ? 'bg-accent' : 'bg-border'}`
}

function StepDot({ active, done, children }) {
  return (
    <span
      className={
        'w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold ' +
        (active || done ? 'bg-accent text-white' : 'bg-surface2 border border-border text-text3')
      }
    >
      {done ? <Icon name="check" size={11} /> : children}
    </span>
  )
}
