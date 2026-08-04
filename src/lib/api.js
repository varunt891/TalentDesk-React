const DEFAULT_PROD_API = 'https://talentdesk-react.onrender.com'
// vercel.json proxies /api/* to the Render backend, so on the Vercel deployment
// we stay same-origin (relative '/api') instead of calling onrender.com directly
// from the browser. That matters on mobile: cross-site fetch() calls with
// credentials get killed by mobile browsers' cross-site tracking protections
// (Safari ITP, Samsung Internet, etc.) far more aggressively than desktop
// browsers, which is why this only ever broke on phones, never laptops.
const isProxiedHost = typeof window !== 'undefined' && /\.vercel\.app$/i.test(window.location.hostname)
let rawUrl = (
  import.meta.env.VITE_API_URL
  || (import.meta.env.PROD ? (isProxiedHost ? '' : DEFAULT_PROD_API) : '/api')
).replace(/\/$/, '')
if (!rawUrl.endsWith('/api')) {
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const COLD_START_RETRY_DELAYS_MS = [1500, 4000]

// Chrome keeps a live binding to the picked File on disk and aborts with
// net::ERR_UPLOAD_FILE_CHANGED if the file's mtime/size shifts even slightly
// between selection and the moment it actually streams the bytes — common on
// Android when the picked file comes from a cloud-synced folder (Drive,
// WhatsApp downloads, etc) that the OS touches in the background. Reading the
// File into memory once up front and uploading a Blob instead means later
// retries re-send in-memory bytes with no live filesystem binding to break.
async function stabilizeFormData(formData) {
  if (typeof window === 'undefined' || !window.FormData || !(formData instanceof window.FormData)) {
    return formData
  }
  const stable = new FormData()
  for (const [key, value] of formData.entries()) {
    if (typeof File !== 'undefined' && value instanceof File) {
      const buffer = await value.arrayBuffer()
      stable.append(key, new Blob([buffer], { type: value.type }), value.name)
    } else {
      stable.append(key, value)
    }
  }
  return stable
}

function cloneBody(body) {
  if (typeof window !== 'undefined' && window.FormData && body instanceof window.FormData) {
    const copy = new FormData()
    for (const [key, value] of body.entries()) {
      copy.append(key, value)
    }
    return copy
  }
  return body
}

async function fetchWithColdStartRetry(url, init, timeoutMs = 60000) {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const body = attempt === 0 ? init.body : cloneBody(init.body)
      const response = await fetch(url, { ...init, body, signal: controller.signal })
      clearTimeout(timer)
      return response
    } catch (err) {
      clearTimeout(timer)
      const isTimeout = err.name === 'AbortError'
      if (attempt >= COLD_START_RETRY_DELAYS_MS.length) {
        if (isTimeout) {
          throw new Error('Request timed out — the server took too long to respond. Please try again.')
        }
        throw err
      }
      // A timed-out first attempt is usually just Render's free-tier instance
      // waking up from spin-down (can take 50s+) — retrying rather than
      // giving up immediately means the 2nd attempt hits an already-warm
      // server instead of forcing the user to manually tap retry.
      await sleep(COLD_START_RETRY_DELAYS_MS[attempt])
    }
  }
}

function formatError(err) {
  if (!err) return err
  const msg = (err.message || '').toLowerCase()
  if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('load failed')) {
    const friendlyErr = new Error('Connection failed — server took too long to respond or mobile connection dropped. Please try again.')
    friendlyErr.status = err.status || 0
    return friendlyErr
  }
  return err
}

export async function apiRequest(path, options = {}) {
  const url = `${API_BASE}${path}`
  const token = getAuthToken()

  try {
    const response = await fetchWithColdStartRetry(url, {
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
    const formatted = formatError(err)
    console.error('[apiRequest] Exception on', path, ':', formatted.message)
    throw formatted
  }
}

// Like apiRequest, but for multipart/form-data uploads — passes the FormData
// straight through instead of JSON.stringify-ing it, and lets the browser set
// its own Content-Type (with multipart boundary) rather than forcing JSON.
export async function apiUpload(path, formData) {
  const url = `${API_BASE}${path}`
  const token = getAuthToken()

  try {
    const stableBody = await stabilizeFormData(formData)
    const response = await fetchWithColdStartRetry(url, {
      method: 'POST',
      credentials: 'include',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: stableBody,
    }, 60000)

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
    const formatted = formatError(err)
    console.error('[apiUpload] Exception on', path, ':', formatted.message)
    throw formatted
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
