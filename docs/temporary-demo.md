# Temporary no-login hosted demo

Hosted production builds currently open a browser-only demo by default while Neon is unavailable. No backend authorization, live account or database configuration was changed. The demo contains fictional recruiting data and is not a copy of production data.

The preview includes 30 candidate records across ten statuses, three separate sourced candidates, ten jobs, a small team, task, callback and follow-up. Supported CRM edits persist under `td_browser_demo_v1` in the current browser. A new browser starts with its own copy. Reset demo restores these sample records. Do not enter real personal information into a public demo.

Live AI, resume uploads, invitations, account/password administration, billing changes and platform operations are unavailable. They report a clear error and never call live services. Existing live session tokens and cached identities remain separate from demo identities. The API still requires authentication for real data.

## Activation and restoration

- Production builds: demo is on when `VITE_DEMO_MODE` is unset or `true`.
- To restore hosted login and normal API access: set `VITE_DEMO_MODE=false` in Vercel, then rebuild/redeploy. No automatic calendar cutoff is used: confirm Neon is working first.
- Development: normal API login is retained when the variable is unset. Visit `/demo` for the browser preview, or set `VITE_DEMO_MODE=true` to preview it at the root.
- The explicit `/demo` route remains available regardless of the build flag.
- The local PGlite database and local Superadmin account are not copied into public demo data.

`node --test tests/browser-demo.test.mjs` verifies no-login entry, separate candidate pools, browser-only create/update persistence, isolation between browsers and live sessions, blocked live AI/uploads/security requests, mobile navigation and reset behavior. API network requests are intercepted and must remain zero.
