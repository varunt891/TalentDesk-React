import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { API_BASE } from './lib/api.js'

// Fire-and-forget: wakes the Render free-tier backend as early as possible
// so it's warm by the time the user actually does anything, instead of the
// user's first real request eating the cold-start delay.
fetch(`${API_BASE}/health`).catch(() => {})

// Temporary on-device debug console for tracking down the mobile-only resume
// upload failure — fetch() only ever reports "Failed to fetch" to JS, the
// real net::ERR_* reason only shows up in DevTools, which isn't reachable on
// a phone without a USB-connected computer. Visit the site with ?debug=1 to
// get a floating console/network panel. Remove once the mobile bug is fixed.
if (new URLSearchParams(window.location.search).has('debug')) {
  const script = document.createElement('script')
  script.src = 'https://cdn.jsdelivr.net/npm/eruda'
  script.onload = () => window.eruda && window.eruda.init()
  document.head.appendChild(script)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)