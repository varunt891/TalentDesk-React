let rawUrl = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')
if (rawUrl.startsWith('http') && !rawUrl.endsWith('/api')) {
  rawUrl = `${rawUrl}/api`
}
const API_BASE = rawUrl
export { API_BASE }
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

    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      console.error('[apiRequest] Error response:', response.status, payload)
      if (response.status === 401) setAuthToken(null)
      if (response.status === 400 && payload.error === 'User does not belong to any organization') {
        window.dispatchEvent(new Event('td:org-lost'))
      }
      const error = new Error(payload.error || `Request failed with status ${response.status}`)
      error.status = response.status
      throw error
    }

    return payload
  } catch (err) {
    console.error('[apiRequest] Exception on', path, ':', err.message)
    throw err
  }
}

// Like apiRequest, but for multipart/form-data uploads — passes the FormData
// straight through instead of JSON.stringify-ing it, and lets the browser set
// its own Content-Type (with multipart boundary) rather than forcing JSON.
export async function apiUpload(path, formData) {
  const url = `${API_BASE}${path}`
  const token = getAuthToken()

  try {
    const response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    })

    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      console.error('[apiUpload] Error response:', response.status, payload)
      if (response.status === 401) setAuthToken(null)
      const error = new Error(payload.error || `Request failed with status ${response.status}`)
      error.status = response.status
      throw error
    }

    return payload
  } catch (err) {
    console.error('[apiUpload] Exception on', path, ':', err.message)
    throw err
  }
}

export const authApi = {
  async session() {
    return apiRequest('/auth/session')
  },
  async signUp(email, password, metadata = {}) {
    const fullName = metadata.full_name || metadata.data?.full_name || metadata.name
    const company = metadata.company || metadata.data?.company
    const invite_token = metadata.invite_token || metadata.data?.invite_token

    const session = await apiRequest('/auth/signup', {
      method: 'POST',
      body: { email, password, full_name: fullName, company, invite_token },
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

export const organizationApi = {
  async getOrg() {
    return apiRequest('/organization')
  },
  async getAllOrgs() {
    return apiRequest('/organization/all')
  },
  async switchOrg(organization_id) {
    return apiRequest('/organization/switch', { method: 'POST', body: { organization_id } })
  },
  async onboardOrg(payload) {
    return apiRequest('/organization/onboard', { method: 'POST', body: payload })
  },
  async deleteOrg(organization_id) {
    return apiRequest(`/organization/platform/${organization_id}`, { method: 'DELETE' })
  },
  async purgeMembers(organization_id) {
    return apiRequest('/organization/platform/purge-members', { method: 'POST', body: { organization_id } })
  },
  async purgeCandidates(organization_id) {
    return apiRequest('/organization/platform/purge-candidates', { method: 'POST', body: { organization_id } })
  },
  async updateOrg(payload) {
    return apiRequest('/organization', { method: 'PUT', body: payload })
  },
  async getMembers() {
    return apiRequest('/organization/members')
  },
  async updateMemberRole(memberId, role) {
    return apiRequest(`/organization/members/${memberId}/role`, { method: 'PUT', body: { role } })
  },
  async removeMember(memberId) {
    return apiRequest(`/organization/members/${memberId}`, { method: 'DELETE' })
  },
  async createInvitation(email, role) {
    return apiRequest('/organization/invitations', { method: 'POST', body: { email, role } })
  },
  async getInvitations() {
    return apiRequest('/organization/invitations')
  },
  async revokeInvitation(invitationId) {
    return apiRequest(`/organization/invitations/${invitationId}`, { method: 'DELETE' })
  },
  async verifyInvitation(token) {
    return apiRequest(`/organization/invitations/verify/${token}`)
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

  catch(onRejected) {
    return this.execute().then(undefined, onRejected)
  }
}

export const db = {
  from(table) {
    return new QueryBuilder(table)
  },
}
