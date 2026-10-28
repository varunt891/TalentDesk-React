# TalentDesk access-control repair verification

Date: 2026-10-28. Status: **Confirmed audit findings repaired in local source. Not deployed.**

## Evidence

`node tests/access-audit.mjs` passes **90/90 checks**, with zero failures. The initial audit passed 42/71 checks; repeated failures represented overlapping defects. The suite covers all 12 declared roles, positive behavior and denial checks. Any failed access assertion now causes an unsuccessful exit.

The suite starts disposable in-memory PostgreSQL and invokes the actual Express routes through Prisma with fictional companies, accounts, memberships, records and invitations. AI uses a stub provider. It never accesses Neon or existing local workspace records. Results are written to `.talentdesk-local/access-audit.json`.

## Repairs

- Authentication requires active company membership and an active company. Tenant hostname selection cannot grant membership. Removed memberships stay revoked and are never automatically recreated by authentication.
- Session and reset tokens use distinct purposes and signing material. Reset tokens are single-use, password changes invalidate sessions, and public recovery never returns a token. Invitation claims verify email, company, expiry and one-time use.
- Platform authority comes from the account's platform role. Owners cannot grant Superadmin; company Admins cannot administer Owners or invoke platform operations. Account administration validates target membership. Account-global operations on another multi-company account require platform authority.
- Resumes, tasks, task comments, notifications and profiles enforce tenant and record scope. Candidate writes cannot attach another company's resume key. Audit records cannot be forged through the generic API.
- API and UI module permissions share one matrix. Viewer, Employee and HR Manager candidate access is read-only. Viewer AI generation is denied. Existing job-creation restrictions remain enforced. Candidate/job list and full-view mutation controls respect permissions.
- Manager scope normalizes role casing and queries active memberships. Team candidates/tasks remain visible. Member lists include people whose selected workspace is elsewhere.
- Role changes take effect on the next request. Membership updates serialize on the company row and preserve an active Owner. Switching organization remounts page state to avoid carrying loaded records between companies.
- AI feature/workspace policy and daily per-user request limits persist per company and are enforced by the API. Request reservations serialize in the database, including requests that later fail at the provider. Owners/Admins may change policy; other members may read it.
- CORS accepts explicit configured/known origins rather than arbitrary Vercel/Render subdomains.

Sources: `server/src/auth.js`, `server/src/access.js`, affected route modules, `server/src/services/memberAccess.js`, `recordAccess.js`, `passwordReset.js`, `aiPolicyService.js`, `shared/permissions.js` and `shared/aiPolicy.js`.

## Settings behavior and limits

Company profile and regional settings remain database-backed. Full job/candidate pages now use the saved date format; this does not prove that every older screen follows every regional preference.

AI policy is shared across browsers and members. It refreshes on view mount or window focus; the API enforces policy even when a browser has stale cache. Policy snapshots and request reservations use the existing audit-log model, with no schema migration.

Table density, default list view, signature defaults, notification presentation preferences and prompt shortcuts remain personal browser preferences and are labeled accordingly. They are not company security policies.

No password-recovery email service is configured. Public recovery directs users to their administrator instead of exposing a secret. Scoped administrator password reset remains available. Multi-company credentials/session counters are account-global, so administration of those accounts requires platform authority.

## Deployment considerations

Only local source was changed. No deployment, Neon configuration, production migration or production record mutation was performed. Before deploying, ensure legacy accounts have reviewed active `OrganizationMember` records: `Profile.org_id` alone no longer grants access. Never recreate revoked memberships as a migration shortcut.

The suite is focused evidence for the listed behavior, not exhaustive verification of every route, integration, legacy UI or deployment setting. Live AI-provider behavior is outside these access tests.
