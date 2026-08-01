import { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { PageContainer } from '../components/layout/PageContainer'
import { Button, Card, CardHeader, Icon, EmptyState, Drawer, cn } from '../components/ui'
import { WorkspaceSearch, EntityDrawer } from '../components/workspace'
import MessageBubble from '../components/ai/MessageBubble'
import ActionsPanel from '../components/ai/ActionsPanel'
import SalaryAnalysisPanel from '../components/ai/SalaryAnalysisPanel'
import AnalyticsPanel from '../components/ai/AnalyticsPanel'
import AutomationsPanel from '../components/ai/AutomationsPanel'
import SettingsPanel from '../components/ai/SettingsPanel'
import { useAIWorkspaceContext } from '../lib/ai/context'
import { useCopilotChat } from '../lib/ai/useCopilotChat'
import { runAiAction } from '../lib/ai/aiClient'
import { fetchWorkspaceSnapshot } from '../lib/ai/workspaceSnapshot'
import { SUGGESTED_PROMPTS } from '../lib/ai/memory'
import { getUsageSummary, loadUsageEvents } from '../lib/ai/usage'
import { loadSavedPrompts, savePrompt, deleteSavedPrompt, togglePinSavedPrompt, loadFavoriteTemplates, toggleFavoriteTemplate } from '../lib/ai/promptLibrary'
import { useAIGovernance, RESPONSE_STYLE_INSTRUCTIONS, isOverDailyLimit } from '../lib/ai/governance'
import { AI_CATEGORIES } from '../lib/ai/categories'
import { getAiAction } from '../lib/ai/prompts'

const ACTION_GROUPS = [
  { label: 'Write', ids: ['draft', 'rewrite', 'translate'] },
  { label: 'Analyze', ids: ['analyze', 'summarize', 'score', 'explain'] },
  { label: 'Transform', ids: ['improve', 'compare', 'recommend', 'extract'] },
]

const MODE_TABS_BASE = [
  { id: 'chat', label: 'Chat', gate: 'chat' },
  { id: 'actions', label: 'Actions', gate: 'actions' },
  { id: 'analytics', label: 'Analytics', gate: null },
  { id: 'automations', label: 'Automations', gate: 'automations' },
  { id: 'settings', label: 'Settings', gate: null },
]

// getAiAction() only knows the generic Action Framework ids (Summarize/Draft/
// Compare/...); 'salary' is logged by SalaryAnalysisPanel's purpose-built
// flow, so it needs its own label/icon rather than silently falling back to
// AI_ACTIONS[0] ("Summarize") in the activity feed and usage insights below.
function describeAction(actionId) {
  if (actionId === 'salary') return { label: 'Market Salary & Demand', icon: 'trendUp' }
  return getAiAction(actionId)
}

// Recent Activity previews are raw slices of AI output, which can start
// mid-markdown (a "##" heading, a "**bold**" run, a table pipe) — strip the
// syntax so the feed reads as clean text instead of leaking formatting
// characters.
function stripMarkdown(text) {
  return (text || '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^[-*•]\s+/gm, '')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function relTime(iso) {
  if (!iso) return ''
  const d = Math.max(0, Math.floor((new Date().getTime() - new Date(iso).getTime()) / 86400000))
  if (d === 0) return 'Today'
  if (d === 1) return '1d ago'
  return `${d}d ago`
}

/**
 * The AI Center — a full-bleed conversational canvas (Claude.ai/ChatGPT
 * shaped) rather than a permanent 3-column dashboard: a slim top strip, a
 * centered hero/conversation column with a docked composer, and everything
 * that used to live in fixed side columns (history, categories, saved
 * prompts, workspace context, recent activity) now lives in two on-demand
 * slide-out drawers. Five modes still share this shell — Chat + Actions
 * (the day-to-day workspace), Analytics + Automations + Settings (the
 * platform's measurement, automation, and governance surface). No AI
 * service logic changes here — same useCopilotChat/ActionsPanel/aiClient/
 * workspaceSnapshot/memory/usage foundation, only the presentation shell.
 */
export default function AICenter() {
  const { user, profile, organization } = useAuth()
  const { currentPage, pageContext } = useAIWorkspaceContext()
  const orgId = organization?.id || profile?.org_id
  const userId = user?.id
  const userName = profile?.full_name || user?.email

  const { settings: aiSettings } = useAIGovernance(orgId)

  const chat = useCopilotChat({
    orgId, userId, orgName: organization?.name, userName, role: profile?.role, currentPage, pageContext,
    streamingEnabled: aiSettings.streamingEnabled,
    behaviorInstruction: RESPONSE_STYLE_INSTRUCTIONS[aiSettings.responseStyle],
    source: currentPage || 'ai_center',
  })
  const {
    sortedConversations, activeId, messages, streaming, streamingText, errorMsg, recentPromptsList, setRecentPromptsList,
    sendMessage, regenerate, stopStreaming, newChat, switchConversation, togglePin, renameConversation, deleteConversation,
  } = chat

  const [centerMode, setCenterMode] = useState('chat')
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [input, setInput] = useState('')
  const [convSearch, setConvSearch] = useState('')
  const [historyOpen, setHistoryOpen] = useState(false)
  const [contextOpen, setContextOpen] = useState(false)

  const [savedPrompts, setSavedPrompts] = useState([])
  const [favoriteTemplates, setFavoriteTemplates] = useState([])
  const [usageSummary, setUsageSummary] = useState({ requestsToday: 0, totalRequests: 0, requestsThisWeek: 0, avgResponseMs: null, topAction: null, estimatedMinutesSaved: 0 })
  const [recentEvents, setRecentEvents] = useState([])
  const [snapshotCounts, setSnapshotCounts] = useState(null)
  const [previewPrompt, setPreviewPrompt] = useState(null)
  const [followupSuggestions, setFollowupSuggestions] = useState([])
  const lastProcessedMsgId = useRef(null)
  const prevStreamingRef = useRef(false)
  const listRef = useRef(null)

  const refreshLibrary = () => {
    setSavedPrompts(loadSavedPrompts(orgId, userId))
    setFavoriteTemplates(loadFavoriteTemplates(orgId, userId))
  }
  const refreshUsage = () => {
    setUsageSummary(getUsageSummary(orgId, userId))
    setRecentEvents(loadUsageEvents(orgId, userId).slice(0, 8))
  }

  useEffect(() => {
    if (orgId || userId) { refreshLibrary(); refreshUsage() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, userId])

  useEffect(() => {
    fetchWorkspaceSnapshot().then(snap => {
      setSnapshotCounts({
        candidates: snap.candidates.length,
        activeCandidates: snap.candidates.filter(c => !['Hired', 'Rejected'].includes(c.internal_status)).length,
        jobs: snap.jobs.length,
        openJobs: snap.jobs.filter(j => (j.status || 'Open') === 'Open').length,
        tasksDue: snap.tasks.filter(t => t.status !== 'Completed').length,
      })
    }).catch(() => { /* workspace context is supplementary */ })
  }, [])

  useEffect(() => {
    if (prevStreamingRef.current && !streaming) refreshUsage()
    prevStreamingRef.current = streaming
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages.length, streamingText])

  // Suggested Follow-up Questions — reuses the shared Action Framework
  // ('recommend') rather than inventing a new AI capability.
  useEffect(() => {
    if (streaming) return
    const lastMsg = messages[messages.length - 1]
    if (!lastMsg || lastMsg.role !== 'assistant' || lastMsg.stopped) return
    if (lastProcessedMsgId.current === lastMsg.id) return
    lastProcessedMsgId.current = lastMsg.id
    setFollowupSuggestions([])
    runAiAction({
      action: 'recommend',
      content: lastMsg.content,
      context: 'Suggest exactly 3 short, specific follow-up questions a recruiter might ask next. Return them ONLY as a markdown bullet list (each line starting with "- "), no extra commentary.',
    }).then(res => {
      if (res.success === false || !res.text) return
      const bullets = res.text.split('\n').map(l => l.trim())
        .filter(l => l.startsWith('- ') || l.startsWith('* '))
        .map(l => l.replace(/^[-*]\s*/, '').trim()).filter(Boolean).slice(0, 3)
      setFollowupSuggestions(bullets)
    }).catch(() => { /* follow-up suggestions are a nice-to-have, fail silently */ })
  }, [messages, streaming])

  const overLimit = isOverDailyLimit(aiSettings, usageSummary.requestsToday)
  const handleSend = (text) => {
    if (overLimit) return
    sendMessage(text)
    setInput('')
  }

  const launchCategory = (category) => {
    setSelectedCategory({ ...category, launchedAt: new Date().getTime() })
    if (category.mode === 'chat') {
      setCenterMode('chat')
      setInput(category.examplePrompt)
    } else {
      setCenterMode('actions')
    }
    setHistoryOpen(false)
  }

  const runSavedPrompt = (prompt) => {
    setPreviewPrompt(null)
    setHistoryOpen(false)
    if (!prompt.actionId || prompt.actionId === 'chat') {
      setCenterMode('chat')
      sendMessage(prompt.content)
    } else {
      setCenterMode('actions')
      setSelectedCategory({ id: `saved_${prompt.id}_${new Date().getTime()}`, mode: 'action', actionId: prompt.actionId, presetContent: prompt.content, presetContext: prompt.context })
    }
  }

  const handleSaveFromActions = ({ actionId, content, context }) => {
    savePrompt(orgId, userId, { title: content, actionId, content, context })
    refreshLibrary()
  }

  const handleQuickAction = (actionId) => {
    setCenterMode('actions')
    setSelectedCategory({ id: `qa_${actionId}_${new Date().getTime()}`, mode: 'action', actionId })
    setContextOpen(false)
  }

  const filteredConversations = useMemo(() => {
    const q = convSearch.toLowerCase()
    if (!q) return sortedConversations
    return sortedConversations.filter(c => c.title.toLowerCase().includes(q) || c.messages.some(m => m.content.toLowerCase().includes(q)))
  }, [sortedConversations, convSearch])

  const modeTabs = MODE_TABS_BASE.filter(t => !t.gate || aiSettings.features[t.gate] !== false)
  const effectiveMode = modeTabs.some(t => t.id === centerMode) ? centerMode : (modeTabs[0]?.id || 'settings')
  const showHero = effectiveMode === 'chat' && messages.length === 0 && !streaming

  return (
    <PageContainer variant="flush">
      <div className="relative h-full min-h-0 flex flex-col">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-20 blur-3xl"
          style={{ background: 'radial-gradient(55% 60% at 50% 0%, var(--ai), transparent)' }}
        />

        {/* TOP STRIP */}
        <div className="relative shrink-0 flex items-center justify-between gap-2 sm:gap-3 px-3 sm:px-6 h-14 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              aria-label="Open history and workflows"
              className="focus-ring w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center text-text2 hover:bg-surface2 shrink-0"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" />
              </svg>
            </button>
            <span className="hidden sm:flex items-center gap-2 min-w-0">
              <span className="w-6 h-6 rounded-[var(--radius-sm)] flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, var(--accent), var(--ai))' }}>
                <Icon name="sparkles" size={12} className="text-white" />
              </span>
              <span className="text-[13.5px] font-extrabold text-text tracking-tight truncate">AI Center</span>
            </span>
          </div>

          <div className="flex items-center gap-1 bg-surface2 rounded-full p-1 border border-border overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {modeTabs.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setCenterMode(t.id)}
                className={cn(
                  'px-3 h-7 rounded-full text-[11.5px] font-bold whitespace-nowrap transition-colors duration-[var(--duration-fast)] shrink-0',
                  effectiveMode === t.id ? 'bg-surface text-text shadow-xs' : 'text-text3 hover:text-text2'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {usageSummary.requestsToday > 0 && (
              <span className="hidden lg:inline-flex items-center gap-1 text-[10.5px] font-bold text-text3">
                <Icon name="sparkles" size={10} className="text-ai" /> {usageSummary.requestsToday} today
              </span>
            )}
            {effectiveMode === 'chat' && (
              <Button size="sm" variant="secondary" leftIcon="plus" onClick={() => newChat()} className="hidden sm:inline-flex">New Chat</Button>
            )}
            <button
              type="button"
              onClick={() => setContextOpen(true)}
              aria-label="Open context and activity"
              className="focus-ring w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center text-text2 hover:bg-surface2"
            >
              <Icon name="layers" size={15} />
            </button>
          </div>
        </div>

        {/* CANVAS */}
        <div ref={effectiveMode === 'chat' ? listRef : undefined} className="relative flex-1 min-h-0 overflow-y-auto">
          {effectiveMode === 'chat' && (
            showHero ? (
              <div className="min-h-full flex items-center justify-center px-4 sm:px-6 py-10">
                <HeroEmptyState onPick={handleSend} recent={recentPromptsList.filter(p => p.length <= 200)} onLaunchCategory={launchCategory} />
              </div>
            ) : (
              <div className="max-w-[760px] mx-auto px-4 sm:px-6 py-8 flex flex-col gap-5">
                {messages.map((m, i) => (
                  <MessageBubble key={m.id} message={m} onRegenerate={m.role === 'assistant' && i === messages.length - 1 ? regenerate : undefined} />
                ))}
                {streaming && <MessageBubble message={{ role: 'assistant', content: streamingText }} thinking={!streamingText} streaming />}
                {!streaming && followupSuggestions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pl-9">
                    {followupSuggestions.map(q => (
                      <button key={q} type="button" onClick={() => handleSend(q)} className="text-[11px] font-medium text-accent bg-accent/10 hover:bg-accent/15 rounded-full px-2.5 py-1.5">{q}</button>
                    ))}
                  </div>
                )}
                {errorMsg && (
                  <div className="flex items-start gap-2 rounded-[var(--radius-md)] border border-red/25 bg-red/8 px-3 py-2.5">
                    <Icon name="alertCircle" size={14} className="text-red shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-red">{errorMsg}</p>
                      <button type="button" onClick={regenerate} className="text-[11px] font-bold text-red underline mt-1">Retry</button>
                    </div>
                  </div>
                )}
              </div>
            )
          )}

          {effectiveMode === 'actions' && (
            <div className="max-w-[760px] mx-auto px-4 sm:px-6 py-8">
              <ActionsModeHeader category={selectedCategory} onBrowse={() => setHistoryOpen(true)} />
              {selectedCategory?.mode === 'salary' ? (
                <SalaryAnalysisPanel key={selectedCategory?.id || 'salary'} orgId={orgId} userId={userId} source="ai_center" streamingEnabled={aiSettings.streamingEnabled} />
              ) : (
                <ActionsPanel
                  key={selectedCategory?.id || 'default'}
                  orgId={orgId}
                  userId={userId}
                  source="ai_center"
                  initialActionId={selectedCategory?.actionId || 'summarize'}
                  initialContent={selectedCategory?.presetContent || ''}
                  initialContext={selectedCategory?.actionContext || selectedCategory?.presetContext || ''}
                  placeholder={selectedCategory?.placeholder}
                  dualInputModes={selectedCategory?.dualInputModes}
                  restrictActionsTo={selectedCategory?.restrictActionsTo}
                  streamingEnabled={aiSettings.streamingEnabled}
                  onResult={refreshUsage}
                  onSavePrompt={handleSaveFromActions}
                />
              )}
            </div>
          )}

          {effectiveMode === 'analytics' && (
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
              <AnalyticsPanel orgId={orgId} userId={userId} conversations={sortedConversations} />
            </div>
          )}
          {effectiveMode === 'automations' && (
            <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
              <AutomationsPanel orgId={orgId} userId={userId} />
            </div>
          )}
          {effectiveMode === 'settings' && (
            <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
              <SettingsPanel orgId={orgId} userName={userName} />
            </div>
          )}
        </div>

        {/* DOCKED COMPOSER */}
        {effectiveMode === 'chat' && (
          <div className="relative shrink-0 border-t border-border px-4 sm:px-6 py-3">
            <div className="max-w-[760px] mx-auto">
              {overLimit && (
                <p className="text-[11px] text-yellow mb-2 text-center">Daily AI request limit reached ({aiSettings.dailyRequestLimit}). Raise it in Settings, or try again tomorrow.</p>
              )}
              <ComposerBar
                value={input}
                onChange={setInput}
                onSend={() => handleSend(input)}
                streaming={streaming}
                onStop={stopStreaming}
                disabled={overLimit}
              />
            </div>
          </div>
        )}
      </div>

      {/* LEFT DRAWER — history, categories, saved prompts */}
      <Drawer open={historyOpen} onClose={() => setHistoryOpen(false)} side="left" size="sm" title="History & Workflows" subtitle="Conversations, saved prompts, and every AI workflow">
        <HistoryDrawerBody
          onNewChat={() => { newChat(); setCenterMode('chat'); setHistoryOpen(false) }}
          convSearch={convSearch}
          setConvSearch={setConvSearch}
          filteredConversations={filteredConversations}
          activeId={activeId}
          onSelectConversation={(id) => { switchConversation(id); setCenterMode('chat'); setHistoryOpen(false) }}
          onPin={togglePin}
          onDelete={deleteConversation}
          onRename={renameConversation}
          favoriteTemplates={favoriteTemplates}
          onToggleFavorite={(id) => { toggleFavoriteTemplate(orgId, userId, id); refreshLibrary() }}
          onLaunchCategory={launchCategory}
          selectedCategory={selectedCategory}
          savedPrompts={savedPrompts}
          onPreviewPrompt={setPreviewPrompt}
          onRunPrompt={runSavedPrompt}
          onPinPrompt={(id) => { togglePinSavedPrompt(orgId, userId, id); refreshLibrary() }}
          onDeletePrompt={(id) => { deleteSavedPrompt(orgId, userId, id); refreshLibrary() }}
        />
      </Drawer>

      {/* RIGHT DRAWER — quick actions, recent activity, workspace context, insights */}
      <Drawer open={contextOpen} onClose={() => setContextOpen(false)} side="right" size="sm" title="Context & Activity" subtitle="Live workspace snapshot and recent AI usage">
        <ContextDrawerBody
          isChatMode={effectiveMode === 'chat'}
          onQuickAction={handleQuickAction}
          recentEvents={recentEvents}
          userName={userName}
          organization={organization}
          snapshotCounts={snapshotCounts}
          usageSummary={usageSummary}
        />
      </Drawer>

      {previewPrompt && (
        <EntityDrawer
          open={!!previewPrompt}
          onClose={() => setPreviewPrompt(null)}
          eyebrow="Saved Prompt"
          title={previewPrompt.title}
          subtitle={getAiAction(previewPrompt.actionId).label}
          size="md"
          actions={<Button variant="primary" leftIcon="send" onClick={() => runSavedPrompt(previewPrompt)}>Run</Button>}
        >
          <div className="flex flex-col gap-3">
            <Card><CardHeader title="Prompt" /><p className="text-sm text-text2 whitespace-pre-wrap">{previewPrompt.content}</p></Card>
            {previewPrompt.context && <Card><CardHeader title="Instructions" /><p className="text-sm text-text2 whitespace-pre-wrap">{previewPrompt.context}</p></Card>}
          </div>
        </EntityDrawer>
      )}
    </PageContainer>
  )
}

// The docked message composer — pill-shaped, gradient send button. Built on
// native elements (not the shared Input/Textarea primitives) since their
// baked-in border/background classes can't be reliably stripped through
// className overrides (this app's `cn()` is a plain joiner, not a
// conflict-resolving merge) and this bar needs a fully custom look.
function ComposerBar({ value, onChange, onSend, streaming, onStop, disabled }) {
  return (
    <div className="group flex items-end gap-2 rounded-[var(--radius-xl)] border border-border bg-surface shadow-xs transition-shadow duration-[var(--duration-fast)] focus-within:shadow-md focus-within:border-ai/50 p-2">
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend() } }}
        placeholder="Ask Copilot anything about your workspace..."
        rows={1}
        disabled={disabled}
        className="flex-1 resize-none bg-transparent outline-none text-text placeholder:text-text3 leading-relaxed px-2 py-1.5 text-[13.5px] disabled:opacity-50"
      />
      {streaming ? (
        <button type="button" onClick={onStop} aria-label="Stop generating" className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center bg-red text-white hover:brightness-110 transition-[filter] duration-[var(--duration-fast)]">
          <Icon name="square" size={13} />
        </button>
      ) : (
        <button
          type="button"
          onClick={onSend}
          disabled={!value.trim() || disabled}
          aria-label="Send"
          className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white transition-[filter,opacity] duration-[var(--duration-fast)] disabled:opacity-40 disabled:pointer-events-none hover:brightness-110"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--ai))' }}
        >
          <Icon name="send" size={13} />
        </button>
      )}
    </div>
  )
}

function ActionsModeHeader({ category, onBrowse }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-5">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center shrink-0 bg-ai-soft text-ai">
          <Icon name={category?.icon || 'sparkles'} size={15} />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-extrabold text-text tracking-tight truncate">{category?.label || 'Actions'}</p>
          {category?.description && <p className="text-[11.5px] text-text3 truncate">{category.description}</p>}
        </div>
      </div>
      <button type="button" onClick={onBrowse} className="shrink-0 text-[11px] font-bold text-ai hover:brightness-110 flex items-center gap-1">
        Browse workflows <Icon name="chevronRight" size={11} />
      </button>
    </div>
  )
}

function SectionLabel({ children }) {
  return <p className="text-[10px] font-bold text-text3 uppercase tracking-wider mb-2">{children}</p>
}

function HistoryDrawerBody({
  onNewChat, convSearch, setConvSearch, filteredConversations, activeId,
  onSelectConversation, onPin, onDelete, onRename,
  favoriteTemplates, onToggleFavorite, onLaunchCategory, selectedCategory,
  savedPrompts, onPreviewPrompt, onRunPrompt, onPinPrompt, onDeletePrompt,
}) {
  return (
    <div className="flex flex-col gap-6">
      <Button variant="primary" leftIcon="plus" onClick={onNewChat} className="w-full">New Chat</Button>

      <div>
        <SectionLabel>Conversations</SectionLabel>
        <WorkspaceSearch value={convSearch} onChange={setConvSearch} storageKey="td_ai_center_conv" placeholder="Search conversations..." />
        <div className="flex flex-col gap-0.5 mt-2">
          {filteredConversations.length === 0 ? (
            <p className="text-xs text-text3 text-center py-4">No conversations found</p>
          ) : filteredConversations.map(c => (
            <ConversationRow
              key={c.id}
              conversation={c}
              active={c.id === activeId}
              onSelect={() => onSelectConversation(c.id)}
              onPin={() => onPin(c.id)}
              onDelete={() => onDelete(c.id)}
              onRename={(title) => onRename(c.id, title)}
            />
          ))}
        </div>
      </div>

      <div>
        <SectionLabel>Categories</SectionLabel>
        <div className="flex flex-col gap-0.5">
          {AI_CATEGORIES.map(cat => (
            <CategoryRow
              key={cat.id}
              category={cat}
              active={selectedCategory?.id === cat.id}
              favorite={favoriteTemplates.includes(cat.id)}
              onClick={() => onLaunchCategory(cat)}
              onToggleFavorite={() => onToggleFavorite(cat.id)}
            />
          ))}
        </div>
      </div>

      {savedPrompts.length > 0 && (
        <div>
          <SectionLabel>Saved Prompts</SectionLabel>
          <div className="flex flex-col gap-0.5">
            {savedPrompts.map(p => (
              <SavedPromptRow
                key={p.id}
                prompt={p}
                onPreview={() => onPreviewPrompt(p)}
                onRun={() => onRunPrompt(p)}
                onPin={() => onPinPrompt(p.id)}
                onDelete={() => onDeletePrompt(p.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ContextDrawerBody({ isChatMode, onQuickAction, recentEvents, userName, organization, snapshotCounts, usageSummary }) {
  return (
    <div className="flex flex-col gap-6">
      {isChatMode && (
        <div>
          <SectionLabel>Quick Actions</SectionLabel>
          <div className="flex flex-col gap-3">
            {ACTION_GROUPS.map(group => (
              <div key={group.label}>
                <div className="text-[10px] font-bold text-text3 uppercase tracking-wide mb-1.5">{group.label}</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {group.ids.map(id => {
                    const a = getAiAction(id)
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => onQuickAction(a.id)}
                        className="flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-border bg-surface2 hover:border-ai/40 hover:text-ai px-2 py-2 text-left transition-colors duration-[var(--duration-fast)]"
                      >
                        <Icon name={a.icon} size={12} className="text-ai shrink-0" />
                        <span className="text-[11px] font-semibold text-text2 truncate">{a.label}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <SectionLabel>Recent Activity</SectionLabel>
        {recentEvents.length === 0 ? (
          <EmptyState icon="clock" title="No activity yet" description="Chat or run an action to see it here." />
        ) : (
          <div className="flex flex-col gap-2.5">
            {recentEvents.map((e, i) => (
              <div key={i} className="flex items-start gap-2">
                <Icon name={e.type === 'chat' ? 'sparkles' : describeAction(e.action).icon} size={11} className={e.success === false ? 'text-red shrink-0 mt-0.5' : 'text-accent shrink-0 mt-0.5'} />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-text2 truncate">{e.type === 'chat' ? 'Copilot reply' : describeAction(e.action).label}{e.success === false ? ' (failed)' : ''}</p>
                  {e.preview && <p className="text-[10px] text-text3 truncate">{stripMarkdown(e.preview)}</p>}
                </div>
                <span className="text-[10px] text-text3 shrink-0">{relTime(e.at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <SectionLabel>Workspace Context</SectionLabel>
        <div className="flex flex-col gap-2 text-xs">
          <ContextRow label="Recruiter" value={userName} />
          <ContextRow label="Organization" value={organization?.name} />
          <ContextRow label="Candidates" value={snapshotCounts ? `${snapshotCounts.activeCandidates} active / ${snapshotCounts.candidates} total` : 'Loading...'} />
          <ContextRow label="Jobs" value={snapshotCounts ? `${snapshotCounts.openJobs} open / ${snapshotCounts.jobs} total` : 'Loading...'} />
          <ContextRow label="Tasks Due" value={snapshotCounts ? snapshotCounts.tasksDue : 'Loading...'} />
        </div>
      </div>

      {usageSummary.totalRequests > 0 && (
        <div>
          <SectionLabel>AI Insights</SectionLabel>
          <div className="flex flex-col gap-1.5 text-xs text-text2">
            <p>{usageSummary.requestsThisWeek} AI request{usageSummary.requestsThisWeek === 1 ? '' : 's'} this week.</p>
            {usageSummary.topAction && <p>Most used action: <b className="text-text">{describeAction(usageSummary.topAction.action).label}</b> ({usageSummary.topAction.count}×).</p>}
            {usageSummary.avgResponseMs && <p>Average response time: <b className="text-text">{(usageSummary.avgResponseMs / 1000).toFixed(1)}s</b>.</p>}
          </div>
        </div>
      )}
    </div>
  )
}

function ConversationRow({ conversation, active, onSelect, onPin, onDelete, onRename }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(conversation.title)
  const commit = () => { onRename(value); setEditing(false) }
  return (
    <div onClick={!editing ? onSelect : undefined} className={cn('group flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1.5 cursor-pointer', active ? 'bg-ai-soft' : 'hover:bg-surface2')}>
      {editing ? (
        <input
          autoFocus value={value} onChange={e => setValue(e.target.value)} onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false) }}
          onClick={e => e.stopPropagation()}
          className="flex-1 text-xs bg-surface2 border border-ai rounded px-1.5 py-1 outline-none min-w-0"
        />
      ) : (
        <span className={cn('text-xs font-semibold truncate flex-1', active ? 'text-ai' : 'text-text2')}>{conversation.title || 'New conversation'}</span>
      )}
      {!editing && (
        <>
          <button type="button" onClick={(e) => { e.stopPropagation(); setEditing(true) }} aria-label="Rename" className="opacity-40 group-hover:opacity-100 text-text3 hover:text-text shrink-0 transition-opacity duration-[var(--duration-fast)]"><Icon name="edit" size={10} /></button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onPin() }} aria-label={conversation.pinned ? 'Unpin' : 'Pin'} className={cn('shrink-0 transition-opacity duration-[var(--duration-fast)]', conversation.pinned ? 'text-yellow' : 'opacity-40 group-hover:opacity-100 text-text3 hover:text-yellow')}><Icon name="pin" size={10} /></button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onDelete() }} aria-label="Delete" className="opacity-40 group-hover:opacity-100 text-text3 hover:text-red shrink-0 transition-opacity duration-[var(--duration-fast)]"><Icon name="trash" size={10} /></button>
        </>
      )}
    </div>
  )
}

function CategoryRow({ category, active, favorite, onClick, onToggleFavorite }) {
  return (
    // A <div role="button"> wrapper, not a <button> — the favorite toggle inside is itself a
    // real <button>, and nesting <button> in <button> is invalid HTML (React warns "cannot be
    // a descendant of" and browsers mishandle the nested click target).
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
      className={cn(
        'group relative flex items-center gap-2.5 rounded-[var(--radius-sm)] pl-2.5 pr-2 py-1.5 text-left cursor-pointer transition-colors duration-[var(--duration-fast)]',
        active ? 'bg-ai-soft text-text' : 'hover:bg-surface2 text-text2'
      )}
    >
      {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[2.5px] rounded-full bg-ai" />}
      <span className={cn('w-6 h-6 rounded-[var(--radius-sm)] flex items-center justify-center shrink-0 transition-colors duration-[var(--duration-fast)]', active ? 'bg-ai text-white' : 'bg-surface2 text-text3 group-hover:text-text2')}>
        <Icon name={category.icon} size={12} />
      </span>
      <div className="min-w-0 flex-1">
        <span className="text-xs font-semibold truncate block">{category.label}</span>
      </div>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleFavorite() }}
        aria-label={favorite ? 'Unfavorite' : 'Favorite'}
        className={cn('shrink-0', favorite ? 'text-yellow' : 'text-text3/40 opacity-40 group-hover:opacity-100 hover:text-yellow')}
      >
        <Icon name="pin" size={10} />
      </button>
    </div>
  )
}

function SavedPromptRow({ prompt, onPreview, onRun, onPin, onDelete }) {
  return (
    <div className="group flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1.5 hover:bg-surface2 cursor-pointer" onClick={onPreview}>
      <Icon name={getAiAction(prompt.actionId).icon} size={11} className="text-accent shrink-0" />
      <span className="text-xs font-medium text-text2 truncate flex-1">{prompt.title}</span>
      <button type="button" onClick={(e) => { e.stopPropagation(); onRun() }} aria-label="Run" className="opacity-40 group-hover:opacity-100 text-text3 hover:text-accent shrink-0 transition-opacity duration-[var(--duration-fast)]"><Icon name="send" size={10} /></button>
      <button type="button" onClick={(e) => { e.stopPropagation(); onPin() }} aria-label={prompt.pinned ? 'Unpin' : 'Pin'} className={cn('shrink-0 transition-opacity duration-[var(--duration-fast)]', prompt.pinned ? 'text-yellow' : 'opacity-40 group-hover:opacity-100 text-text3 hover:text-yellow')}><Icon name="pin" size={10} /></button>
      <button type="button" onClick={(e) => { e.stopPropagation(); onDelete() }} aria-label="Delete" className="opacity-40 group-hover:opacity-100 text-text3 hover:text-red shrink-0 transition-opacity duration-[var(--duration-fast)]"><Icon name="trash" size={10} /></button>
    </div>
  )
}

function ContextRow({ label, value, muted }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-text3">{label}</span>
      <span className={cn('font-semibold text-right truncate max-w-[60%]', muted ? 'text-text3 italic font-normal' : 'text-text')}>{value ?? '—'}</span>
    </div>
  )
}

function HeroEmptyState({ onPick, recent, onLaunchCategory }) {
  const featured = AI_CATEGORIES.slice(0, 6)
  return (
    <div className="w-full max-w-xl mx-auto flex flex-col items-center text-center gap-6">
      <span className="relative">
        <span className="absolute inset-0 rounded-full blur-xl opacity-50 animate-pulse" style={{ background: 'linear-gradient(135deg, var(--accent), var(--ai))' }} />
        <span
          className="relative w-16 h-16 rounded-3xl flex items-center justify-center shadow-[var(--shadow-lg)]"
          style={{ background: 'linear-gradient(135deg, var(--accent), var(--ai))' }}
        >
          <Icon name="sparkles" size={28} className="text-white" />
        </span>
      </span>
      <div>
        <p className="text-[26px] font-extrabold text-text tracking-tight">Ask Copilot anything</p>
        <p className="text-[13.5px] text-text3 mt-2 max-w-sm mx-auto leading-relaxed">Workspace-aware — it can see your live candidates, jobs, and tasks.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-1.5 max-w-lg">
        {SUGGESTED_PROMPTS.map(p => <button key={p} type="button" onClick={() => onPick(p)} className="text-[11.5px] font-semibold text-accent bg-accent/10 border border-accent/15 hover:bg-accent/15 hover:border-accent/30 transition-colors duration-[var(--duration-fast)] rounded-full px-3 py-1.5">{p}</button>)}
      </div>
      {recent.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1.5 max-w-lg">
          {recent.map(p => <button key={p} type="button" onClick={() => onPick(p)} className="text-[11.5px] font-medium text-text2 bg-surface2 border border-border shadow-xs hover:text-text hover:border-border-strong transition-colors duration-[var(--duration-fast)] rounded-full px-3 py-1.5">{p}</button>)}
        </div>
      )}
      <div className="w-full pt-5 border-t border-border">
        <p className="text-[10.5px] font-bold text-text3 uppercase tracking-wider mb-3">Or launch a workflow</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {featured.map(cat => (
            <button key={cat.id} type="button" onClick={() => onLaunchCategory(cat)} className="flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-surface shadow-xs hover:border-ai/30 hover:shadow-sm hover:-translate-y-px px-3 py-2.5 text-left transition-all duration-[var(--duration-fast)] ease-[var(--ease-standard)]">
              <span className="w-6 h-6 rounded-[var(--radius-sm)] bg-ai-soft text-ai flex items-center justify-center shrink-0"><Icon name={cat.icon} size={12} /></span>
              <span className="text-[11.5px] font-semibold text-text2 truncate">{cat.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
