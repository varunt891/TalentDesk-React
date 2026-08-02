// Shared categorical chart palette — single source of truth for the
// previously-duplicated hardcoded arrays in Dashboard.jsx, Reports.jsx, and
// Directory.jsx. Values are CSS custom properties (see --chart-1..7 in
// index.css) so they resolve per-theme automatically, the same way every
// other token-driven color in the app does — no JS theme detection needed.
export const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
  'var(--chart-7)',
]
