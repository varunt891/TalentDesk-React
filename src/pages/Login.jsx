import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

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
    <main className="login-page">
      <div className="login-bg" aria-hidden="true">
        <div className="login-grid" />
        <div className="login-band login-band-one" />
        <div className="login-band login-band-two" />
      </div>

      <section className="login-shell">
        <div className="login-brand-panel">
          <Link className="login-brand" to="/" aria-label="TalentDesk home">
            <span className="login-brand-mark">TD</span>
            <span>
              <span className="login-brand-name">TalentDesk</span>
              <span className="login-brand-subtitle">Recruiter CRM</span>
            </span>
          </Link>

          <div className="login-copy">
            <p className="login-eyebrow">Secure recruiting workspace</p>
            <h1>Sign in and get back to your hiring pipeline.</h1>
            <p>
              Manage candidates, callbacks, jobs, and team handoffs from one
              focused dashboard.
            </p>
          </div>

          <div className="login-insight" aria-label="Pipeline activity preview">
            <div className="login-insight-header">
              <span>Today</span>
              <strong>Pipeline health</strong>
            </div>
            <div className="login-signal">
              <span style={{ '--height': '42%' }} />
              <span style={{ '--height': '68%' }} />
              <span style={{ '--height': '54%' }} />
              <span style={{ '--height': '86%' }} />
              <span style={{ '--height': '62%' }} />
              <span style={{ '--height': '74%' }} />
              <span style={{ '--height': '48%' }} />
            </div>
            <div className="login-metrics">
              <div>
                <strong>42</strong>
                <span>Active candidates</span>
              </div>
              <div>
                <strong>12</strong>
                <span>Follow-ups due</span>
              </div>
            </div>
          </div>
        </div>

        <div className="login-card" aria-busy={loading}>
          <div className="login-card-header">
            <p className="login-kicker">Welcome back</p>
            <h2>Sign in to TalentDesk</h2>
            <p>Use your workspace email and password to continue.</p>
          </div>

          {error && (
            <div className="login-error" role="alert" aria-live="polite">
              {error}
            </div>
          )}

          <form className="login-form" onSubmit={handleLogin}>
            <div className="login-field">
              <label htmlFor="login-email">Email</label>
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="name@company.com"
                autoComplete="email"
                required
              />
            </div>

            <div className="login-field">
              <label htmlFor="login-password">Password</label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
              />
            </div>

            <button className="login-submit" type="submit" disabled={loading}>
              {loading && <span className="login-spinner" aria-hidden="true" />}
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="login-switch">
            Don't have an account? <Link to="/signup">Create one</Link>
          </p>
        </div>
      </section>
    </main>
  )
}
