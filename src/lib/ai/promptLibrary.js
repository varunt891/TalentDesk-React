// Prompt Library — saved prompts + favorite category templates. Purely
// additive to Phase 5.1's memory.js (which only covers recent-prompts and
// conversation history); this is the missing "save/favorite" half needed
// by AI Center. Same localStorage, org+user-scoped convention.
function libraryKey(orgId, userId) { return `td_ai_saved_prompts_${orgId || 'na'}_${userId || 'na'}` }
function favoritesKey(orgId, userId) { return `td_ai_favorite_templates_${orgId || 'na'}_${userId || 'na'}` }

export function loadSavedPrompts(orgId, userId) {
  try {
    const raw = localStorage.getItem(libraryKey(orgId, userId))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function persistSavedPrompts(orgId, userId, list) {
  try { localStorage.setItem(libraryKey(orgId, userId), JSON.stringify(list)) } catch { /* quota exceeded */ }
}

export function savePrompt(orgId, userId, { title, actionId, content, context }) {
  const entry = {
    id: `sp_${new Date().getTime()}`,
    title: (title || content || '').slice(0, 48) || 'Saved prompt',
    actionId, content, context: context || '',
    pinned: false,
    createdAt: new Date().toISOString(),
  }
  const next = [entry, ...loadSavedPrompts(orgId, userId)]
  persistSavedPrompts(orgId, userId, next)
  return entry
}

export function deleteSavedPrompt(orgId, userId, id) {
  persistSavedPrompts(orgId, userId, loadSavedPrompts(orgId, userId).filter(p => p.id !== id))
}

export function togglePinSavedPrompt(orgId, userId, id) {
  const next = loadSavedPrompts(orgId, userId).map(p => p.id === id ? { ...p, pinned: !p.pinned } : p)
  persistSavedPrompts(orgId, userId, next)
  return next
}

export function loadFavoriteTemplates(orgId, userId) {
  try {
    const raw = localStorage.getItem(favoritesKey(orgId, userId))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

export function toggleFavoriteTemplate(orgId, userId, categoryId) {
  const current = loadFavoriteTemplates(orgId, userId)
  const next = current.includes(categoryId) ? current.filter(id => id !== categoryId) : [...current, categoryId]
  try { localStorage.setItem(favoritesKey(orgId, userId), JSON.stringify(next)) } catch { /* quota exceeded */ }
  return next
}

// Part 5 — Team AI / Organization Prompt Library. Scoped by org only (not
// per-user), matching the interface a future backend-synced version would
// use. Honest limitation: without a backend table, this is real storage
// but only shared within one browser — the AI Center UI discloses this
// rather than implying cross-device team sync that doesn't exist yet.
function orgLibraryKey(orgId) { return `td_ai_org_prompts_${orgId || 'na'}` }

export function loadOrgPrompts(orgId) {
  try {
    const raw = localStorage.getItem(orgLibraryKey(orgId))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function persistOrgPrompts(orgId, list) {
  try { localStorage.setItem(orgLibraryKey(orgId), JSON.stringify(list)) } catch { /* quota exceeded */ }
}

export function saveOrgPrompt(orgId, { title, actionId, content, context, addedBy }) {
  const entry = {
    id: `op_${new Date().getTime()}`,
    title: (title || content || '').slice(0, 48) || 'Team prompt',
    actionId, content, context: context || '',
    addedBy: addedBy || 'Unknown',
    createdAt: new Date().toISOString(),
  }
  const next = [entry, ...loadOrgPrompts(orgId)]
  persistOrgPrompts(orgId, next)
  return entry
}

export function deleteOrgPrompt(orgId, id) {
  persistOrgPrompts(orgId, loadOrgPrompts(orgId).filter(p => p.id !== id))
}
