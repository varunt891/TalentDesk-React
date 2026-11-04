# Temporary no-login hosted demo

The temporary default demo was disabled on November 4, 2026 after Neon recovered. Hosted production builds now use normal login and the configured backend by default. No backend authorization, live account or database configuration was changed. The optional demo contains fictional recruiting data and is not a copy of production data.

The preview includes 30 candidate records across ten statuses, three separate sourced candidates, ten jobs, a small team, task, callback and follow-up. Supported CRM edits persist under `td_browser_demo_v1` in the current browser. A new browser starts with its own copy. Reset demo restores these sample records. Do not enter real personal information into a public demo.

Live AI, resume uploads, invitations, account/password administration, billing changes and platform operations are unavailable. They report a clear error and never call live services. Existing live session tokens and cached identities remain separate from demo identities. The API still requires authentication for real data.

## Activation and restoration

- Production and development: normal login/API access is the default when `VITE_DEMO_MODE` is unset or `false`.
- Set `VITE_DEMO_MODE=true` only to explicitly deploy a browser-demo build. Set it back to `false` or remove it and rebuild/redeploy to restore normal authentication.
- Development: normal API login is retained when the variable is unset. Visit `/demo` for the browser preview, or set `VITE_DEMO_MODE=true` to preview it at the root.
- The explicit `/demo` route remains available regardless of the build flag.
- The local PGlite database and local Superadmin account are not copied into public demo data.

`node --test tests/browser-demo.test.mjs` verifies no-login entry, separate candidate pools, browser-only create/update persistence, isolation between browsers and live sessions, blocked live AI/uploads/security requests, mobile navigation and reset behavior. API network requests are intercepted and must remain zero.
