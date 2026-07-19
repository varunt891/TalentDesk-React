import { createContext, useContext, useEffect, useState } from 'react'
import { authApi } from '../lib/api'

const AuthContext = createContext({})

const CACHE_KEY = 'talentdesk_session'

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return { user: null, profile: null }
    return JSON.parse(raw)
  } catch {
    return { user: null, profile: null }
  }
}

function writeCache(user, profile) {
  try {
    if (user && profile) {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ user, profile }))
    } else {
      localStorage.removeItem(CACHE_KEY)
    }
  } catch { /* ignore */ }
}

export function AuthProvider({ children }) {
  const cached = readCache()
  const [user, setUser] = useState(cached.user)
  const [profile, setProfile] = useState(cached.profile)
  // If we have a cached session, start with loading=false so there's no flash
  const [loading, setLoading] = useState(!cached.user)
  const [profileError, setProfileError] = useState('')

  useEffect(() => {
    let mounted = true

    const initAuth = async () => {
      try {
        const session = await authApi.session()
        if (!mounted) return
        setUser(session.user)
        setProfile(session.profile)
        setProfileError('')
        writeCache(session.user, session.profile)
      } catch (err) {
        if (!mounted) return
        // Only clear if we get an explicit auth error (not a network blip)
        const isAuthError = err?.status === 401 || err?.message?.toLowerCase().includes('unauthorized') || err?.message?.toLowerCase().includes('not authenticated')
        if (isAuthError) {
          setUser(null)
          setProfile(null)
          writeCache(null, null)
        }
        setProfileError(err.message || '')
      } finally {
        if (mounted) setLoading(false)
      }
    }

    initAuth()

    return () => {
      mounted = false
    }
  }, [])

  const signUp = async (email, password, metadata = {}) => {
    try {
      const session = await authApi.signUp(email, password, metadata)
      setUser(session.user)
      setProfile(session.profile)
      setProfileError('')
      writeCache(session.user, session.profile)
      return { data: session, error: null }
    } catch (error) {
      return { data: null, error }
    }
  }

  const signIn = async (email, password) => {
    try {
      const session = await authApi.signIn(email, password)
      setUser(session.user)
      setProfile(session.profile)
      setProfileError('')
      writeCache(session.user, session.profile)
      return { data: session, error: null }
    } catch (error) {
      return { data: null, error }
    }
  }

  const signOut = async () => {
    try {
      await authApi.signOut()
    } finally {
      setUser(null)
      setProfile(null)
      writeCache(null, null)
    }
  }

  return (
    <AuthContext.Provider value={{ user, profile, profileError, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
