import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './design.css'
import './pipeline.css'
import './ai-workbench.css'
import './hiring-tools.css'
import './dashboard.css'
import './job-preview.css'
import './job-detail.css'
import './candidate-detail.css'
import App from './App.jsx'
import { API_BASE } from './lib/api.js'

// Apply the visual system before rendering, including sign-in and onboarding.
document.documentElement.setAttribute('data-theme', localStorage.getItem('td_theme_v2') || 'light')

// Fire-and-forget: wakes the Render free-tier backend as early as possible
// so it's warm by the time the user actually does anything, instead of the
// user's first real request eating the cold-start delay.
fetch(`${API_BASE}/health`).catch(() => {})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
