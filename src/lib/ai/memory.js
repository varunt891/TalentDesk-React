// AI conversation memory — persisted to localStorage (no schema change),
// scoped per organization + user, same storage-key convention already used
// by WorkspaceSearch/FilterWorkspace (see src/components/workspace).
function convKey(orgId, userId) { return `td_ai_conversations_${orgId || 'na'}_${userId || 'na'}` }
function promptsKey(orgId, userId) { return `td_ai_recent_prompts_${orgId || 'na'}_${userId || 'na'}` }

export function loadConversations(orgId, userId) {
  try {
    const raw = localStorage.getItem(convKey(orgId, userId))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

export function saveConversations(orgId, userId, conversations) {
  try { localStorage.setItem(convKey(orgId, userId), JSON.stringify(conversations)) } catch { /* quota exceeded */ }
}

export function createConversation() {
  const now = new Date().toISOString()
  const rand = Math.floor(Math.random() * 1e6)
  return { id: `conv_${new Date().getTime()}_${rand}`, title: 'New conversation', pinned: false, messages: [], createdAt: now, updatedAt: now }
}

export function recentPrompts(orgId, userId) {
  try {
    const raw = localStorage.getItem(promptsKey(orgId, userId))
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

export function addRecentPrompt(orgId, userId, prompt) {
  const trimmed = (prompt || '').trim()
  // Skip saving long pastes (JDs, resumes, etc.) — only short natural-language prompts belong here.
  if (!trimmed || trimmed.length > 200) return
  const current = recentPrompts(orgId, userId)
  const next = [trimmed, ...current.filter(p => p.toLowerCase() !== trimmed.toLowerCase())].slice(0, 8)
  try { localStorage.setItem(promptsKey(orgId, userId), JSON.stringify(next)) } catch { /* quota exceeded */ }
}

export function clearRecentPrompts(orgId, userId) {
  try { localStorage.removeItem(promptsKey(orgId, userId)) } catch { /* ignore */ }
}

export const SUGGESTED_PROMPTS = [
  'Show jobs needing attention',
  "Summarize today's recruiter activity",
  'Find candidates inactive for 30 days',
  'Which candidates best match my open jobs?',
  'Write a follow-up email for a candidate',
  'Generate interview questions for a role',
]
