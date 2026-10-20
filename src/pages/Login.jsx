import { useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { authApi } from '../lib/api'
import { Button, FormField, Input, Modal, useToast } from '../components/ui'
import { Icon } from '../components/ui/icons'

const SIGNAL_HEIGHTS = [42, 68, 54, 86, 62, 74, 48]

export default function Login() {
  const { signIn, user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const returnPath = location.state?.from === '/sourced-candidates' ? '/sourced-candidates' : '/'
  const { toast } = useToast()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Forgot password state
  const [showForgotModal, setShowForgotModal] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [resetToken, setResetToken] = useState('')
  const [manualToken, setManualToken] = useState('') // for "already have a token" path
  const [newPassword, setNewPassword] = useState('')
  // resetStep: 'email' | 'set-password' | 'manual-token'
  const [resetStep, setResetStep] = useState('email')
  const [tokenGenerated, setTokenGenerated] = useState(false)

  const closeForgotModal = () => {
    setShowForgotModal(false)
    setForgotEmail('')
    setResetToken('')
    setManualToken('')
    setNewPassword('')
    setResetStep('email')
    setTokenGenerated(false)
  }

  useEffect(() => {
    window.scrollTo(0, 0)
    if (!authLoading && user) navigate(returnPath, { replace: true })
  }, [authLoading, navigate, user, returnPath])

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await signIn(email.trim(), password)

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    window.scrollTo(0, 0)
    navigate(returnPath)
  }

  const handleRequestReset = async (e) => {
    e.preventDefault()
    if (!forgotEmail.trim()) return
    setForgotLoading(true)
    try {
      const res = await authApi.requestPasswordReset(forgotEmail.trim())
      if (res.token) {
        // Token returned from server — store it and go straight to set-password step
        setResetToken(res.token)
        setTokenGenerated(true)
        setResetStep('set-password')
        toast({ tone: 'success', title: 'Token Generated!', description: 'Now enter your new password below.' })
      } else {
        // No email service configured — show manual token entry step
        toast({ tone: 'info', title: 'Check with Admin', description: res.message || 'Contact your admin for a reset token.' })
        setResetStep('manual-token')
      }
    } catch (err) {
      toast({ tone: 'error', title: 'Failed to request reset', description: err.message })
    } finally {
      setForgotLoading(false)
    }
  }

  const handleCompleteReset = async (e) => {
    e.preventDefault()
    const tokenToUse = resetToken || manualToken
    if (!tokenToUse) {
      toast({ tone: 'warn', title: 'Token required', description: 'Please enter your reset token.' })
      return
    }
    if (!newPassword || newPassword.length < 6) {
      toast({ tone: 'warn', title: 'Weak Password', description: 'Password must be at least 6 characters long.' })
      return
    }
    setForgotLoading(true)
    try {
      await authApi.resetPasswordWithToken(tokenToUse, newPassword)
      toast({ tone: 'success', title: 'Password Reset Successful!', description: 'You can now sign in with your new password.' })
      setPassword(newPassword)
      setEmail(forgotEmail)
      closeForgotModal()
    } catch (err) {
      toast({ tone: 'error', title: 'Reset Failed', description: err.message })
    } finally {
      setForgotLoading(false)
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

      <section className="relative w-full max-w-5xl grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
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
              Secure recruiting workspace
            </span>
            <h1 className="font-serif text-[36px] leading-[1.15] font-medium text-text tracking-[-0.01em]">
              Sign in and get back to your hiring pipeline.
            </h1>
            <p className="text-[14px] text-text2 leading-relaxed">
              Manage candidates, callbacks, jobs, and team handoffs from one focused dashboard.
            </p>
          </div>

          <div className="bg-surface border border-border rounded-[var(--radius-lg)] shadow-xs p-5 max-w-md">
            <div className="flex items-center justify-between text-[11px] font-bold text-text3 uppercase tracking-wider mb-4">
              <span>Today</span>
              <span className="text-text2">Pipeline health</span>
            </div>
            <div className="flex items-end gap-2 h-24">
              {SIGNAL_HEIGHTS.map((h, i) => (
                <span
                  key={i}
                  className="flex-1 rounded-t-[3px] bg-gradient-to-t from-accent2 to-accent"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
            <div className="flex items-center gap-6 mt-4 pt-4 border-t border-border">
              <div>
                <strong className="block text-lg font-extrabold text-text font-[var(--mono)] tabular-nums">42</strong>
                <span className="text-[11px] text-text3">Active candidates</span>
              </div>
              <div>
                <strong className="block text-lg font-extrabold text-text font-[var(--mono)] tabular-nums">12</strong>
                <span className="text-[11px] text-text3">Follow-ups due</span>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] p-7 sm:p-8 w-full max-w-md mx-auto lg:mx-0" aria-busy={loading}>
          <div className="flex lg:hidden items-center gap-2.5 mb-6">
            <span className="w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center text-sm font-extrabold bg-gradient-to-br from-accent to-accent2 text-white shrink-0">
              TD
            </span>
            <span className="text-[15px] font-extrabold text-text tracking-tight">TalentDesk</span>
          </div>

          <p className="text-[10px] font-extrabold uppercase tracking-widest text-accent mb-2">Welcome back</p>
          <h2 className="text-xl font-extrabold text-text tracking-tight">Sign in to TalentDesk</h2>
          <p className="text-[13px] text-text3 mt-1.5 mb-6">Use your workspace email and password to continue.</p>

          {error && (
            <div role="alert" aria-live="polite" className="flex items-start gap-2 bg-red/10 border border-red/25 text-red text-[13px] rounded-[var(--radius-sm)] px-3 py-2.5 mb-5">
              <Icon name="alertCircle" size={14} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <form className="flex flex-col gap-4" onSubmit={handleLogin}>
            <FormField label="Email" htmlFor="login-email">
              <Input
                id="login-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="name@company.com"
                autoComplete="email"
                required
              />
            </FormField>

            <FormField
              label={
                <div className="flex items-center justify-between w-full">
                  <span>Password</span>
                  <button
                    type="button"
                    onClick={() => { setForgotEmail(email); setShowForgotModal(true) }}
                    className="text-xs text-accent hover:underline font-normal focus:outline-none"
                  >
                    Forgot password?
                  </button>
                </div>
              }
              htmlFor="login-password"
            >
              <Input
                id="login-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
              />
            </FormField>

            <Button type="submit" size="lg" loading={loading} className="w-full mt-1.5">
              {loading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>

          <p className="text-center text-[12px] text-text3 mt-6 leading-relaxed">
            Personnel onboarding is by invitation only. Contact your platform administrator or organization manager for access.
          </p>
        </div>
      </section>

      {/* ── Forgot Password Modal ────────────────────────────────────────────── */}
      <Modal
        open={showForgotModal}
        onClose={closeForgotModal}
        title="Reset Your Password"
        subtitle={
          resetStep === 'email'
            ? 'Enter your account email to generate a secure reset token.'
            : resetStep === 'set-password'
            ? 'Token generated! Enter your new password below.'
            : 'Paste your reset token and enter a new password.'
        }
      >
        {/* ── Step 1: Enter email ─────────────────── */}
        {resetStep === 'email' && (
          <form onSubmit={handleRequestReset} className="flex flex-col gap-4">
            <FormField label="Account Email" htmlFor="forgot-email">
              <Input
                id="forgot-email"
                type="email"
                value={forgotEmail}
                onChange={e => setForgotEmail(e.target.value)}
                placeholder="name@company.com"
                required
                autoFocus
              />
            </FormField>
            <div className="flex justify-between items-center pt-2">
              <button
                type="button"
                onClick={() => setResetStep('manual-token')}
                className="text-xs text-text3 hover:text-text underline"
              >
                Already have a token?
              </button>
              <Button type="submit" loading={forgotLoading}>
                Generate Reset Token
              </Button>
            </div>
          </form>
        )}

        {/* ── Step 2: Token generated — just enter new password ─────── */}
        {resetStep === 'set-password' && (
          <form onSubmit={handleCompleteReset} className="flex flex-col gap-4">
            {/* Success banner */}
            <div className="flex items-start gap-2.5 bg-green/10 border border-green/25 text-green rounded-[var(--radius-sm)] px-3 py-2.5 text-[13px]">
              <Icon name="check" size={15} className="shrink-0 mt-0.5" />
              <span>Reset token generated for <strong>{forgotEmail}</strong>. Enter your new password below.</span>
            </div>

            <FormField label="New Password (min 6 characters)" htmlFor="fp-new-password">
              <Input
                id="fp-new-password"
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                required
                autoFocus
              />
            </FormField>

            <div className="flex justify-between items-center pt-2">
              <button
                type="button"
                onClick={() => setResetStep('email')}
                className="text-xs text-text3 hover:text-text underline"
              >
                ← Use different email
              </button>
              <Button type="submit" loading={forgotLoading} disabled={!newPassword}>
                Set New Password
              </Button>
            </div>
          </form>
        )}

        {/* ── Step 3: Manual token entry (admin-provided token path) ── */}
        {resetStep === 'manual-token' && (
          <form onSubmit={handleCompleteReset} className="flex flex-col gap-4">
            <FormField label="Reset Token" htmlFor="manual-reset-token">
              <Input
                id="manual-reset-token"
                type="text"
                value={manualToken}
                onChange={e => setManualToken(e.target.value)}
                placeholder="Paste reset token here"
                required
                autoFocus
              />
            </FormField>
            <FormField label="New Password (min 6 characters)" htmlFor="manual-new-password">
              <Input
                id="manual-new-password"
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                required
              />
            </FormField>
            <div className="flex justify-between items-center pt-2">
              <button
                type="button"
                onClick={() => setResetStep('email')}
                className="text-xs text-text3 hover:text-text underline"
              >
                ← Generate a new token
              </button>
              <Button type="submit" loading={forgotLoading} disabled={!manualToken || !newPassword}>
                Reset Password
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </main>
  )
}
