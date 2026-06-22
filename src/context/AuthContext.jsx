import { createContext, useContext, useEffect, useState } from 'react'
import { authApi } from '../lib/api'

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
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
      } catch (err) {
        if (!mounted) return
        setUser(null)
        setProfile(null)
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
    }
  }

  return (
    <AuthContext.Provider value={{ user, profile, profileError, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
