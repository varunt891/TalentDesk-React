// Periodically fetches a fresh batch of AI-generated playful dialogue for
// the top-bar pixel bots (see server/src/routes/ai.routes.js GET
// /ai/bot-lines). This is pure flavor text, never real workspace data, so a
// failed/slow fetch is silently ignored — PixelRobot always has its static
// line pools to fall back to and just keeps using those.
import { useEffect, useState } from 'react'
import { apiRequest } from '../api'

// The server only actually regenerates this once every 24h (see
// BOT_LINES_CACHE_TTL_MS in ai.routes.js) — polling more often than that
// would just re-fetch the same cached batch, so this stays deliberately
// infrequent. A big static pool in PixelRobot.jsx covers the rest of the
// time, so freshness here isn't time-critical.
const REFRESH_MS = 6 * 60 * 60 * 1000 // 6h

export function useAIBotLines() {
  const [lines, setLines] = useState({ candidateLines: [], robotLines: [], bicker: [] })

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await apiRequest('/ai/bot-lines')
        if (!cancelled && res?.success) {
          setLines({
            candidateLines: Array.isArray(res.candidateLines) ? res.candidateLines : [],
            robotLines: Array.isArray(res.robotLines) ? res.robotLines : [],
            bicker: Array.isArray(res.bicker) ? res.bicker : [],
          })
        }
      } catch {
        // AI hiccup — bots just keep using their static line pools.
      }
    }
    load()
    const interval = setInterval(load, REFRESH_MS)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  return lines
}
