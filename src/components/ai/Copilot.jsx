import { useState, useRef, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { Button, Textarea, Tabs, Icon, cn } from '../ui'
import { useAIWorkspaceContext } from '../../lib/ai/context'
import { useCopilotChat } from '../../lib/ai/useCopilotChat'
import { SUGGESTED_PROMPTS } from '../../lib/ai/memory'
import { clearRecentPrompts } from '../../lib/ai/memory'
import { useAIGovernance, RESPONSE_STYLE_INSTRUCTIONS, isOverDailyLimit } from '../../lib/ai/governance'
import { getUsageSummary } from '../../lib/ai/usage'
import MessageBubble from './MessageBubble'
import ActionsPanel from './ActionsPanel'

function relativeTime(iso) {
  if (!iso) return ''
  const d = Math.max(0, Math.floor((new Date().getTime() - new Date(iso).getTime()) / 86400000))
  if (d === 0) return 'Today'
  if (d === 1) return 'Yesterday'
  return `${d}d ago`
}

/**
 * The Recruiter Copilot — a persistent, workspace-aware AI assistant
 * mounted once at the app shell (see App.jsx) so it's available from every
 * page. Two modes share one panel: Chat (streaming, multi-turn, memory) and
 * Actions (one-shot Summarize/Rewrite/... via the shared AI Action
 * Framework). Chat state/memory is shared with AI Center via
 * useCopilotChat — a conversation started here shows up there and vice
 * versa. Nothing here duplicates a per-page AI implementation.
 */
export default function Copilot() {
  const { user, profile, organization } = useAuth()
  const { currentPage, pageContext } = useAIWorkspaceContext()
  const orgId = organization?.id || profile?.org_id
  const userId = user?.id
  const userName = profile?.full_name || user?.email

  const { settings: aiSettings } = useAIGovernance(orgId)
  const chatEnabled = aiSettings.features.chat !== false
  const actionsEnabled = aiSettings.features.actions !== false

  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState(chatEnabled ? 'chat' : 'actions')
  const [showHistory, setShowHistory] = useState(false)
  const [input, setInput] = useState('')

  const chat = useCopilotChat({
    orgId, userId,
    orgName: organization?.name, userName, role: profile?.role, currentPage, pageContext,
    streamingEnabled: aiSettings.streamingEnabled,
    behaviorInstruction: RESPONSE_STYLE_INSTRUCTIONS[aiSettings.responseStyle],
    source: currentPage || 'copilot_widget',
  })
  const {
    sortedConversations, activeId, messages, streaming, streamingText, errorMsg, recentPromptsList, setRecentPromptsList,
    sendMessage, regenerate, stopStreaming, newChat, switchConversation, togglePin, deleteConversation,
  } = chat

  const requestsToday = getUsageSummary(orgId, userId).requestsToday
  const overLimit = isOverDailyLimit(aiSettings, requestsToday)
  const handleSend = (text) => {
    if (overLimit) return
    sendMessage(text)
    setInput('')
  }

  const listRef = useRef(null)
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages.length, streamingText, open])

  const [posY, setPosY] = useState(20)
  const isDragging = useRef(false)
  const dragStartY = useRef(0)
  const initialPosY = useRef(20)
  const hasDragged = useRef(false)

  const handlePointerDown = (e) => {
    isDragging.current = true
    hasDragged.current = false
    const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0
    dragStartY.current = clientY
    initialPosY.current = posY

    const handlePointerMove = (moveEv) => {
      const currentY = moveEv.clientY ?? moveEv.touches?.[0]?.clientY ?? 0
      const deltaY = dragStartY.current - currentY
      if (Math.abs(deltaY) > 4) {
        hasDragged.current = true
      }
      const newPos = Math.max(16, Math.min(window.innerHeight - 80, initialPosY.current + deltaY))
      setPosY(newPos)
    }

    const handlePointerUp = () => {
      isDragging.current = false
      window.removeEventListener('mousemove', handlePointerMove)
      window.removeEventListener('mouseup', handlePointerUp)
      window.removeEventListener('touchmove', handlePointerMove)
      window.removeEventListener('touchend', handlePointerUp)
    }

    window.addEventListener('mousemove', handlePointerMove)
    window.addEventListener('mouseup', handlePointerUp)
    window.addEventListener('touchmove', handlePointerMove)
    window.addEventListener('touchend', handlePointerUp)
  }

  if (!orgId && !userId) return null
  if (!chatEnabled && !actionsEnabled) return null
  if (['dashboard', 'ai_center'].includes((currentPage || '').toLowerCase())) return null
  const effectiveMode = mode === 'chat' && !chatEnabled ? 'actions' : mode === 'actions' && !actionsEnabled ? 'chat' : mode

  return (
    <>
      <button
        type="button"
        onMouseDown={handlePointerDown}
        onTouchStart={handlePointerDown}
        onClick={() => {
          if (hasDragged.current) return
          setOpen(o => !o)
        }}
        aria-label={open ? 'Close Copilot' : 'Open Copilot'}
        title="Click to toggle Copilot · Drag up/down to reposition"
        className="fixed right-5 rounded-full flex items-center justify-center shadow-[var(--shadow-lg)] opacity-85 hover:opacity-100 transition-all duration-[var(--duration-fast)] hover:scale-105 cursor-grab active:cursor-grabbing"
        style={{
          bottom: `${posY}px`,
          zIndex: 'var(--z-overlay)',
          background: 'linear-gradient(135deg, var(--accent), var(--ai))',
          width: 46,
          height: 46,
        }}
      >
        <Icon name={open ? 'x' : 'sparkles'} size={20} className="text-white" />
      </button>

      {open && (
        <div
          className="fixed right-5 w-[min(400px,calc(100vw-2.5rem))] h-[min(640px,calc(100vh-140px))] bg-surface border border-border rounded-[var(--radius-lg)] shadow-[var(--shadow-lg)] flex flex-col overflow-hidden"
          style={{
            bottom: `${posY + 58}px`,
            maxHeight: `calc(100vh - ${posY + 76}px)`,
            zIndex: 'var(--z-overlay)',
          }}
        >
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border shrink-0">
            <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, var(--accent), var(--ai))' }}>
              <Icon name="sparkles" size={15} className="text-white" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-text">Copilot</div>
              <div className="text-[10px] text-text3 truncate">{organization?.name || 'TalentDesk'} workspace</div>
            </div>
            <button type="button" onClick={() => setShowHistory(s => !s)} aria-label="Conversation history" className={cn('w-7 h-7 rounded-full flex items-center justify-center shrink-0', showHistory ? 'bg-accent/15 text-accent' : 'text-text3 hover:bg-surface2 hover:text-text')}>
              <Icon name="clock" size={14} />
            </button>
            <button type="button" onClick={newChat} aria-label="New chat" className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-text3 hover:bg-surface2 hover:text-text">
              <Icon name="plus" size={14} />
            </button>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-text3 hover:bg-surface2 hover:text-text">
              <Icon name="x" size={14} />
            </button>
          </div>

          {!showHistory && chatEnabled && actionsEnabled && (
            <div className="px-3 pt-2 shrink-0">
              <Tabs items={[{ id: 'chat', label: 'Chat' }, { id: 'actions', label: 'Actions' }]} value={effectiveMode} onChange={setMode} />
            </div>
          )}

          {showHistory ? (
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1">
              {sortedConversations.length === 0 ? (
                <p className="text-xs text-text3 text-center py-8">No conversations yet</p>
              ) : sortedConversations.map(c => (
                <div
                  key={c.id}
                  onClick={() => switchConversation(c.id)}
                  className={cn('group flex items-center gap-2 rounded-[var(--radius-md)] px-2.5 py-2 cursor-pointer', c.id === activeId ? 'bg-accent/10' : 'hover:bg-surface2')}
                >
                  <Icon name="sparkles" size={12} className="text-text3 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className={cn('text-xs font-semibold truncate', c.id === activeId ? 'text-accent' : 'text-text')}>{c.title || 'New conversation'}</div>
                    <div className="text-[10px] text-text3">{c.messages.length} messages · {relativeTime(c.updatedAt)}</div>
                  </div>
                  <button type="button" onClick={(e) => { e.stopPropagation(); togglePin(c.id) }} aria-label={c.pinned ? 'Unpin' : 'Pin'} className={cn('w-6 h-6 rounded-full flex items-center justify-center shrink-0', c.pinned ? 'text-yellow' : 'text-text3 opacity-0 group-hover:opacity-100 hover:text-yellow')}>
                    <Icon name="pin" size={11} />
                  </button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); deleteConversation(c.id) }} aria-label="Delete conversation" className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-text3 opacity-0 group-hover:opacity-100 hover:text-red">
                    <Icon name="trash" size={11} />
                  </button>
                </div>
              ))}
            </div>
          ) : effectiveMode === 'chat' ? (
            <>
              <div ref={listRef} className="flex-1 overflow-y-auto px-3.5 py-3 flex flex-col gap-3">
                {messages.length === 0 && !streaming ? (
                  <div className="flex flex-col gap-3 py-1">
                    <p className="text-xs text-text3">Ask about your workspace, or try:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {SUGGESTED_PROMPTS.map(p => (
                        <button key={p} type="button" onClick={() => handleSend(p)} className="text-[11px] font-medium text-accent bg-accent/10 hover:bg-accent/15 rounded-full px-2.5 py-1.5 text-left">{p}</button>
                      ))}
                    </div>
                    {recentPromptsList.length > 0 && (
                      <>
                        <div className="flex items-center justify-between mt-1">
                          <p className="text-xs text-text3">Recent</p>
                          <button
                            type="button"
                            onClick={() => { clearRecentPrompts(orgId, userId); setRecentPromptsList([]) }}
                            className="text-[10px] text-text3 hover:text-red transition-colors"
                          >Clear</button>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {recentPromptsList.filter(p => p.length <= 200).map(p => (
                            <button key={p} type="button" onClick={() => handleSend(p)} className="text-[11px] font-medium text-text2 bg-surface2 border border-border hover:text-text rounded-full px-2.5 py-1.5">{p}</button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  messages.map((m, i) => (
                    <MessageBubble key={m.id} message={m} onRegenerate={m.role === 'assistant' && i === messages.length - 1 ? regenerate : undefined} />
                  ))
                )}
                {streaming && <MessageBubble message={{ role: 'assistant', content: streamingText }} thinking={!streamingText} streaming />}
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

              <div className="px-3 py-2.5 border-t border-border shrink-0">
                {overLimit && <p className="text-[10px] text-yellow mb-1.5">Daily AI request limit reached ({aiSettings.dailyRequestLimit}).</p>}
                <div className="flex items-end gap-2">
                  <Textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(input) } }}
                    placeholder="Ask Copilot anything about your workspace..."
                    rows={1}
                    className="flex-1 resize-none max-h-28"
                    disabled={overLimit}
                  />
                  {streaming ? (
                    <Button variant="danger" iconOnly leftIcon="square" onClick={stopStreaming} aria-label="Stop generating" />
                  ) : (
                    <Button variant="primary" iconOnly leftIcon="send" onClick={() => handleSend(input)} disabled={!input.trim() || overLimit} aria-label="Send" />
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 overflow-y-auto p-3.5">
              <ActionsPanel orgId={orgId} userId={userId} source="copilot_widget" streamingEnabled={aiSettings.streamingEnabled} />
            </div>
          )}
        </div>
      )}
    </>
  )
}
