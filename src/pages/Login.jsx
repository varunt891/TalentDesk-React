import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Button, FormField, Input } from '../components/ui'
import { Icon } from '../components/ui/icons'

const SIGNAL_HEIGHTS = [42, 68, 54, 86, 62, 74, 48]

export default function Login() {
  const { signIn, user, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!authLoading && user) navigate('/', { replace: true })
  }, [authLoading, navigate, user])

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

    navigate('/')
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
            <h1 className="text-[32px] leading-[1.15] font-extrabold text-text tracking-[-0.02em]">
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

            <FormField label="Password" htmlFor="login-password">
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

          <p className="text-center text-[13px] text-text3 mt-6">
            Don't have an account?{' '}
            <Link to="/signup" className="text-accent font-semibold hover:underline">
              Create one
            </Link>
          </p>
        </div>
      </section>
    </main>
  )
}
