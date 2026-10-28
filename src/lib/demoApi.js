import { createDemoData } from './demoData'
import { DEMO_STORAGE_KEY, DEMO_UNAVAILABLE } from './demoMode'
import { mergeAiPolicy } from '../../shared/aiPolicy.js'

let memory
function state() {
  if (memory) return memory
  try {
    const saved = JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY))
    if (saved?.version === 1 && Array.isArray(saved.tables?.candidates) && saved.organization?.id) memory = saved
  } catch { /* Start fresh if this browser has no usable demo data. */ }
  memory ||= createDemoData()
  return memory
}
function save(next) {
  try { localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(next)) }
  catch { throw new Error('Demo changes could not be saved. Enable browser storage or free some space and retry.') }
  memory = next
}
export function resetDemo() {
  save(createDemoData())
  window.location.reload()
}
function blocked() { throw Object.assign(new Error(DEMO_UNAVAILABLE), { status: 503 }) }
export function demoSession() {
  const s = state(), profile = s.tables.profiles[0]
  return structuredClone({ user: { id: profile.id, email: profile.email }, profile, organization: s.organization, membership: { id: profile.id, user_id: profile.id, organization_id: s.organization.id, role: 'OWNER', status: 'ACTIVE' } })
}
function usage() {
  return { creditLimit: 1000, totalCreditsUsed: 0, remainingCredits: 1000, percentUsed: 0, totalRequests: 0, totalChat: 0, totalAction: 0, activeStaffCount: 0, totalStaffCount: state().tables.profiles.length, staffList: [] }
}
function select(rows, url) {
  const filters = JSON.parse(url.searchParams.get('filter') || '[]')
  let result = rows.filter(row => filters.every(filter => filter.op === 'eq' && row[filter.column] === filter.value))
  const order = JSON.parse(url.searchParams.get('order') || 'null')
  if (order) result = [...result].sort((a, b) => String(a[order.column] ?? '').localeCompare(String(b[order.column] ?? '')) * (order.ascending === false ? -1 : 1))
  return result
}

// Deliberately has no network fallback: demo requests never reach live services.
export async function demoRequest(path, options = {}) {
  const url = new URL(path, 'https://browser-demo.invalid')
  const route = url.pathname, method = options.method || 'GET', body = options.body || {}
  const s = structuredClone(state())
  if (route === '/auth/session' || route === '/auth/login') return demoSession()
  if (route === '/auth/logout') return { ok: true }
  if (route.startsWith('/auth/') || route.startsWith('/upload/')) return blocked()
  if (route === '/ai/bot-lines') return { data: [], lines: [] }
  if (route.startsWith('/ai/')) return blocked()
  if (route === '/organization/ai-usage') return { data: usage() }
  if (route === '/admin/platform/ai-usage') return { data: { summary: { totalCreditsUsed: 0, totalTokens: 0, totalRequests: 0, successfulRequests: 0, failedRequests: 0, successRate: 100, avgLatencyMs: null, totalOrgsCount: 1, activeOrgsCount: 0, activeUsersCount: 0 }, orgs: [], providers: [], tools: [], recentEvents: [], daily: [] } }
  if (route === '/organization/ai-policy') {
    if (method === 'PUT') { s.policy = mergeAiPolicy(s.policy, body); save(s) }
    else if (method !== 'GET') return blocked()
    return { organization_id: s.organization.id, data: s.policy }
  }
  if (route === '/organization') {
    if (method === 'PUT') {
      const fields = ['name', 'website', 'industry', 'company_size', 'timezone', 'market', 'currency', 'date_format', 'language', 'business_hours_start', 'business_hours_end']
      Object.assign(s.organization, Object.fromEntries(Object.entries(body).filter(([key]) => fields.includes(key))))
      s.tables.organizations = [s.organization]; save(s)
    } else if (method !== 'GET') return blocked()
    return { data: s.organization }
  }
  if (route === '/organization/all' && method === 'GET') return { data: [s.organization] }
  if (route === '/organization/members' && method === 'GET') return { data: s.tables.profiles.map(profile => ({ ...profile, user_id: profile.id, status: 'ACTIVE' })) }
  if (route === '/organization/invitations' && method === 'GET') return { data: [] }
  if (route.startsWith('/organization/') || route.startsWith('/admin/')) return blocked()
  const [, base, table, id, action] = route.split('/')
  if (base !== 'data' || !Object.hasOwn(s.tables, table)) throw Object.assign(new Error('This feature is unavailable in browser demo.'), { status: 404 })
  const rows = s.tables[table]
  if (method === 'GET') return { data: select(id ? rows.filter(row => row.id === id) : rows, url) }
  const writable = ['candidates', 'jobs', 'callbacks', 'followups', 'postings', 'tasks', 'task_comments', 'notifications']
  if (!writable.includes(table)) return blocked()
  if (method === 'POST' && !id) {
    const created = (Array.isArray(body) ? body : [body]).map(row => ({ ...row, id: crypto.randomUUID(), org_id: s.organization.id, user_id: s.tables.profiles[0].id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }))
    rows.push(...created); save(s); return { data: created, collisions: [] }
  }
  const row = rows.find(item => item.id === id)
  if (!row) throw Object.assign(new Error('Demo record not found'), { status: 404 })
  if (method === 'POST' && action === 'notes' && ['candidates', 'jobs'].includes(table)) {
    row.notes = [row.notes, `## ${body.title || 'Reviewed draft'}\n${body.content || ''}`].filter(Boolean).join('\n\n')
    save(s); return { data: [row] }
  }
  if (['PUT', 'PATCH'].includes(method) && (!action || action === 'remarks')) {
    const immutable = ['id', 'org_id', 'user_id', 'created_at']
    Object.assign(row, Object.fromEntries(Object.entries(body).filter(([key]) => !immutable.includes(key))), { updated_at: new Date().toISOString() })
    save(s); return { data: action === 'remarks' ? row : [row], collisions: [] }
  }
  if (method === 'DELETE' && !action) { s.tables[table] = rows.filter(item => item.id !== id); save(s); return { data: null } }
  return blocked()
}
