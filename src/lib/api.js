const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')
const TOKEN_KEY = 'td_session_token'

export function getAuthToken() {
  try {
    return window.localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setAuthToken(token) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token)
    else window.localStorage.removeItem(TOKEN_KEY)
  } catch {
    // localStorage can be unavailable in private modes; cookies still work.
  }
}

export async function apiRequest(path, options = {}) {
  const url = `${API_BASE}${path}`
  console.log('[apiRequest] Fetching:', url, 'Method:', options.method || 'GET')
  const token = getAuthToken()
  
  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })

    console.log('[apiRequest] Response status:', response.status, 'for', path)
    
    const payload = await response.json().catch(() => ({}))
    
    if (!response.ok) {
      console.error('[apiRequest] Error response:', response.status, payload)
      if (response.status === 401) setAuthToken(null)
      throw new Error(payload.error || `Request failed with status ${response.status}`)
    }
    
    console.log('[apiRequest] Success response:', path, 'Data items:', Array.isArray(payload.data) ? payload.data.length : 'N/A')
    return payload
  } catch (err) {
    console.error('[apiRequest] Exception on', path, ':', err.message)
    throw err
  }
}

export const authApi = {
  async session() {
    return apiRequest('/auth/session')
  },
  async signUp(email, password, metadata = {}) {
    const fullName = metadata.full_name || metadata.data?.full_name || metadata.name
    const session = await apiRequest('/auth/signup', {
      method: 'POST',
      body: { email, password, full_name: fullName },
    })
    setAuthToken(session.token)
    return session
  },
  async signIn(email, password) {
    const session = await apiRequest('/auth/login', {
      method: 'POST',
      body: { email, password },
    })
    setAuthToken(session.token)
    return session
  },
  async signOut() {
    try {
      return await apiRequest('/auth/logout', { method: 'POST' })
    } finally {
      setAuthToken(null)
    }
  },
}

class QueryBuilder {
  constructor(table) {
    this.table = table
    this.action = 'select'
    this.filters = []
    this.orderBy = null
    this.payload = undefined
    this.singleMode = false
    this.extraParams = {}
  }

  select() {
    return this
  }

  eq(column, value) {
    this.filters.push({ op: 'eq', column, value })
    return this
  }

  param(key, value) {
    this.extraParams[key] = value
    return this
  }

  order(column, options = {}) {
    this.orderBy = { column, ascending: options.ascending !== false }
    return this
  }

  single() {
    this.singleMode = true
    return this
  }

  maybeSingle() {
    this.singleMode = true
    return this
  }

  insert(payload) {
    this.action = 'insert'
    this.payload = payload
    return this
  }

  update(payload) {
    this.action = 'update'
    this.payload = payload
    return this
  }

  delete() {
    this.action = 'delete'
    return this
  }

  async execute() {
    try {
      const params = new URLSearchParams()
      if (this.filters.length) params.set('filter', JSON.stringify(this.filters))
      if (this.orderBy) params.set('order', JSON.stringify(this.orderBy))
      for (const [k, v] of Object.entries(this.extraParams)) params.set(k, v)
      const query = params.toString() ? `?${params.toString()}` : ''

      if (this.action === 'select') {
        const response = await apiRequest(`/data/${this.table}${query}`)
        const data = this.singleMode ? response.data?.[0] ?? null : response.data
        return { data, error: null }
      }

      if (this.action === 'insert') {
        return await this.mutate(`/data/${this.table}`, 'POST')
      }

      const id = this.filters.find(filter => filter.column === 'id')?.value
      if (!id) throw new Error(`${this.action} requires an id filter`)

      if (this.action === 'update') {
        return await this.mutate(`/data/${this.table}/${id}`, 'PUT')
      }

      await apiRequest(`/data/${this.table}/${id}`, { method: 'DELETE' })
      return { data: null, error: null }
    } catch (error) {
      return { data: null, error }
    }
  }

  async mutate(path, method) {
    const response = await apiRequest(path, {
      method,
      body: this.payload,
    })
    const data = this.singleMode ? response.data?.[0] ?? null : response.data
    return { data, error: null }
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject)
  }
}

export const db = {
  from(table) {
    return new QueryBuilder(table)
  },
}
