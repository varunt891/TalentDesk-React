const API_BASE = import.meta.env.VITE_API_URL || '/api'

export async function apiRequest(path, options = {}) {
  const url = `${API_BASE}${path}`
  console.log('[apiRequest] Fetching:', url, 'Method:', options.method || 'GET')
  
  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })

    console.log('[apiRequest] Response status:', response.status, 'for', path)
    
    const payload = await response.json().catch(() => ({}))
    
    if (!response.ok) {
      console.error('[apiRequest] Error response:', response.status, payload)
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
    return apiRequest('/auth/signup', {
      method: 'POST',
      body: { email, password, full_name: fullName },
    })
  },
  async signIn(email, password) {
    return apiRequest('/auth/login', {
      method: 'POST',
      body: { email, password },
    })
  },
  async signOut() {
    return apiRequest('/auth/logout', { method: 'POST' })
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
  }

  select() {
    return this
  }

  eq(column, value) {
    this.filters.push({ op: 'eq', column, value })
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
