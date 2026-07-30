import { createContext, useContext, useEffect, useState } from 'react'
import { authApi, organizationApi } from '../lib/api'

const AuthContext = createContext({})

const CACHE_KEY = 'talentdesk_session'

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return { user: null, profile: null, organization: null }
    return JSON.parse(raw)
  } catch {
    return { user: null, profile: null, organization: null }
  }
}

function writeCache(user, profile, organization) {
  try {
    if (user && profile) {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ user, profile, organization }))
    } else {
      localStorage.removeItem(CACHE_KEY)
    }
  } catch { /* ignore */ }
}

export function AuthProvider({ children }) {
  const cached = readCache()
  const [user, setUser] = useState(cached.user)
  const [profile, setProfile] = useState(cached.profile)
  const [organization, setOrganization] = useState(cached.organization)
  const [membership, setMembership] = useState(null)
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
        setOrganization(session.organization)
        setMembership(session.membership)
        setProfileError('')
        writeCache(session.user, session.profile, session.organization)
      } catch (err) {
        if (!mounted) return
        const isAuthError = err?.status === 401 || err?.message?.toLowerCase().includes('unauthorized') || err?.message?.toLowerCase().includes('not authenticated')
        if (isAuthError) {
          setUser(null)
          setProfile(null)
          setOrganization(null)
          setMembership(null)
          writeCache(null, null, null)
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
      setOrganization(session.organization)
      setMembership(session.membership)
      setProfileError('')
      writeCache(session.user, session.profile, session.organization)
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
      setOrganization(session.organization)
      setMembership(session.membership)
      setProfileError('')
      writeCache(session.user, session.profile, session.organization)
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
      setOrganization(null)
      setMembership(null)
      writeCache(null, null, null)
    }
  }

  const switchOrganization = async (orgId) => {
    try {
      const res = await organizationApi.switchOrg(orgId)
      if (res.data) {
        setProfile(res.data.profile)
        setOrganization(res.data.organization)
        setMembership(res.data.membership)
        writeCache(user, res.data.profile, res.data.organization)
        return { data: res.data, error: null }
      }
    } catch (error) {
      return { data: null, error }
    }
  }

  const refreshOrg = (newOrg) => {
    setOrganization(newOrg)
    writeCache(user, profile, newOrg)
  }

  return (
    <AuthContext.Provider value={{ user, profile, organization, membership, profileError, loading, signUp, signIn, signOut, switchOrganization, refreshOrg }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
