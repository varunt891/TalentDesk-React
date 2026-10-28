import { useEffect, useRef } from 'react'

// Scroll once per generation, within the panel that owns the output. Token
// updates leave the reader in control of their position.
export function useAiOutputScroll(generating) {
  const outputRef = useRef(null)

  useEffect(() => {
    const output = outputRef.current
    if (!generating || !output?.getClientRects().length) return
    let scroller = output.parentElement
    while (scroller && scroller !== document.body && scroller !== document.documentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) {
        const top = scroller.scrollTop + output.getBoundingClientRect().top - scroller.getBoundingClientRect().top - scroller.clientTop - 16
        scroller.scrollTo({ top: Math.max(0, top), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
        break
      }
      scroller = scroller.parentElement
    }
  }, [generating])

  return outputRef
}
