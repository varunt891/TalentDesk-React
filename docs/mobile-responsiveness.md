# Mobile responsiveness verification

Verified locally on 2026-10-28 using Chromium phone/touch emulation and tablet/desktop viewports. No production or Neon changes were made.

## Results

`node --test tests/responsive.test.mjs` passes 195 layout checks at 320, 390, 768 and 1440 pixels, with zero detected page overflow, clipped controls or uncaught runtime errors.

Coverage includes all 17 sidebar workspaces; candidate/job creation forms, preview drawers and full-detail pages; all AI Center sections; Settings tabs; Reports tabs; Pipeline focus/expand and stage scrolling; sign-in, recovery and invitation onboarding. Fixtures contain candidates across stages, a requisition, task, callback, follow-up and posting. This test mocks API responses and does not submit forms or change database records.

The live local application was also checked at 390px with its existing data and Superadmin account: Candidates, Pipeline, Reports and AI Center showed no page overflow or uncaught errors. Touch navigation worked.

Existing Pipeline interaction and fixed-document/internal-scroll regression tests pass. Vite production compilation passes. Reports, PageHeader and the new responsive test pass targeted lint. Admin retains pre-existing unused-variable lint errors outside the changed layout row.

## Corrections

- Constrained Pipeline's overview grid to the viewport, keeping its metrics, insights and stage strips independently scrollable instead of expanding to their content width.
- Stacked Pipeline title/actions on phones so controls remain visible.
- Allowed shared page-header actions to wrap within available width, fixing the Reports toolbar at tablet sizes.
- Wrapped the Admin manager-group summary row on narrow phones.
- Fixed Reports referencing an undefined date helper when follow-up records exist; overdue comparisons now use the organization's timezone.

## Limits

These are browser-emulation checks, not physical iOS Safari or Android device certification. Native file picking, onscreen keyboards, safe-area behavior and every touch interaction have not been exhaustively tested. Wide tables, charts, tab strips and Pipeline lanes may intentionally scroll within their own containers. Passing layout checks does not establish that every application function works on every mobile browser.

Screenshots and machine-readable observations are saved under `.talentdesk-local/responsive/` (git-ignored).
