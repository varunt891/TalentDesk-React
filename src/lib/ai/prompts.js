// Centralized AI Action registry — the client-side half of the shared AI
// Action Framework (server-side prompt building lives in
// server/src/services/promptService.js's buildActionPrompt/ACTION_TOOL_MAP,
// which this list's `id`s map onto 1:1). Any page/component that wants an
// AI action button describes it once here instead of re-declaring labels
// and icons inline.
export const AI_ACTIONS = [
  { id: 'summarize', label: 'Summarize', icon: 'summarize', placeholder: 'Paste the content to summarize...' },
  { id: 'rewrite', label: 'Rewrite', icon: 'edit', placeholder: 'Paste the content to rewrite...' },
  { id: 'improve', label: 'Improve', icon: 'sparkles', placeholder: 'Paste the content to improve...' },
  { id: 'compare', label: 'Compare', icon: 'compare', placeholder: 'Paste two or more items to compare...' },
  { id: 'explain', label: 'Explain', icon: 'info', placeholder: 'Paste the content or concept to explain...' },
  { id: 'score', label: 'Score', icon: 'checkCircle', placeholder: 'Paste the content to score...' },
  { id: 'analyze', label: 'Analyze', icon: 'reports', placeholder: 'Paste the content to analyze...' },
  { id: 'recommend', label: 'Recommend', icon: 'trendUp', placeholder: 'Describe the situation for a recommendation...' },
  { id: 'draft', label: 'Draft', icon: 'mail', placeholder: 'Describe what to draft (email, message, doc)...' },
  { id: 'translate', label: 'Translate', icon: 'search', placeholder: 'Paste the content to translate...' },
  { id: 'extract', label: 'Extract', icon: 'filter', placeholder: 'Paste the content to extract data from...' },
]

export function getAiAction(id) {
  return AI_ACTIONS.find(a => a.id === id) || AI_ACTIONS[0]
}
