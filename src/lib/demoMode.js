// Live authentication is the default in development and production.
// Browser-only demos require /demo or an explicit VITE_DEMO_MODE=true build.
const explicitDemo = typeof window !== 'undefined' && /^\/demo(?:\/|$)/.test(window.location.pathname)
export function isDemoMode() {
  if (typeof window === 'undefined') return false
  if (explicitDemo) return true
  const configured = import.meta.env.VITE_DEMO_MODE
  if (configured === 'false') return false
  return configured === 'true'
}

export const DEMO_STORAGE_KEY = 'td_browser_demo_v1'
export const DEMO_UNAVAILABLE = 'Unavailable in browser demo. Live AI, file uploads, invitations and account security require the hosted service.'
