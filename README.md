# TalentDesk CRM

A modern, AI-powered Applicant Tracking System (ATS) and Recruitment CRM built with React, Vite, Express, and Prisma PostgreSQL.

---

## 🔒 Copyright & Proprietary Rights

Copyright (c) 2026 Varun / TalentDesk. All Rights Reserved.

This software codebase, database schemas, UI designs, and custom AI integration workflows are proprietary and confidential. Unauthorized copying, distribution, or reproduction of any portion of this repository is strictly prohibited.

---

## 🚀 Key Modules & Capabilities

- **Talent & Candidate Database**: Bulk resume upload, AI resume parsing, candidate search, and match radar.
- **Job Requisition Management**: Pipeline tracking, submittals, and posting management.
- **AI Recruiting Desk**: Copilot actions, job description analysis, candidate fit scoring, and automated candidate summaries.
- **Multi-Device Security & Admin**: Role-Based Access Control (RBAC), multi-device session revocation, password policy management, and audit logs.

---

## ⚙️ Local Setup

### Temporary hosted preview

Production builds currently open a no-login browser demo while Neon is unavailable.
It uses fictional data, with supported CRM edits saved only in the current browser.
To restore hosted login, set `VITE_DEMO_MODE=false` in Vercel and redeploy.
Local development continues using normal authentication; `/demo` opens the preview.
See [temporary demo details](docs/temporary-demo.md) for limits and restoration.

### Work locally without Neon

```bash
npm install
npm run dev:local
```

Open **http://localhost:5174**. Sign in with `local@talentdesk.test` and the
random password printed in the terminal. You can also find it in
`.talentdesk-local/credentials.json`. This is a separate local owner account;
your hosted login credentials do not apply to this workspace.

This command starts an embedded PostgreSQL-compatible database (PGlite), creates
the schema and local owner account, and starts the API on port 4001 and frontend
on port 5174. Docker and a separate PostgreSQL installation are not required.
The database and credentials persist in `.talentdesk-local/`, which is excluded
from Git. Stop with Ctrl+C and run the same command to resume. Stop an existing
local workspace before starting another instance. After schema changes, stop
the API processes and run `npm run prisma:generate` before restarting.

The workspace starts empty; hosted records are not copied or synchronized.
With local mode running, use `npm run seed:local` to add 30 fictional candidate
profiles across 10 active stages and 10 linked demo jobs. The seed only targets
the local API and skips existing demo records when rerun.
It always overrides the hosted database URL and session secret for these local
processes, and binds the local services to loopback. Normal hosted authentication
is still required for deployed versions. AI tools and resume file storage still
use the external services configured in `.env` and need their API credentials.
If you change your local password in Settings, use the new password thereafter;
the credentials file contains only the initial password.

### AI Center recruiting workbench

AI Center opens a workbench with eight workflows: candidate fit review, candidate
briefs, client submissions, outreach, interview kits, sourcing searches, job
descriptions, and pipeline priorities. Select existing CRM records; each run
refreshes the permission-scoped database data before generating a draft.
Candidates and the sourced pool remain separate. Recorded skill overlap counts
exact normalized matches; it is not a hiring probability.

Review and edit a generated draft before appending it to candidate/job notes or
creating a task assigned to yourself. Saving a draft does not send email, change
candidate stages, or replace a requisition. Existing notes are preserved and
concurrent note edits are retried. Copilot, hiring tools, briefings, usage, and
preferences remain available alongside the workbench. AI provider credentials
are still required. No database schema migration is needed for this workbench.

Run the recruiting checks with:

```bash
node --test tests/recruiting-workflows.test.mjs tests/ai-workbench.test.mjs tests/ai-workbench-api.test.mjs
```

The API integration test uses a disposable in-memory PGlite database and a test
AI provider; it does not connect to the configured hosted database.

### Hiring tools and workflow browser

Hiring tools separates the eleven text actions from purpose-specific workflows.
Switching tools restores that tool's own inputs, instructions, and completed
draft for the current visit; a workflow's instructions never carry into another
action. Switching during generation cancels that request. Resume/job and
candidate/candidate comparisons have separate sessions and labeled inputs.
Saved comparison prompts retain both documents and their workflow identity.

The browser includes searchable workflows, favorites, and five scenarios:

1. **Open a Java requisition:** select the job, generate a job description, review
   it, and append it to that job's existing notes.
2. **Prepare a React client submission:** select candidate and job, review the
   evidence and missing information, and create a skills-verification task.
3. **Follow up after an interview:** use the candidate's recorded stage to draft
   a follow-up and create an outreach task assigned to yourself.
4. **Source a data engineer:** generate a Boolean query from the selected
   requisition's requirements, then save the reviewed query to job notes.
5. **Prepare a technical screen:** select the job and optionally a candidate to
   generate questions, a timed agenda, and an unfilled evaluation scorecard.

Each workflow accepts pasted text or accessible CRM records. CRM runs refresh
their source records first. Candidate pools stay separate; no candidate stage,
job requirement, or outbound message changes automatically. Saving a note or
creating a task requires an explicit review and confirmation. AI outputs still
require recruiter verification. Saved prompts are browser-local, scoped to the
current organization and user.

The save confirmation names the record and includes an **Open saved record**
button. Job drafts appear in **Jobs → Full Details → Remarks**; candidate drafts
appear in **Recruiter Notes**. Requesting LinkedIn search in a Boolean workflow's
additional instructions includes a LinkedIn keyword query, a Google X-ray query,
and search links. Links are encoded from the displayed queries; no search runs
automatically.

```bash
node --test tests/hiring-tools-state.test.mjs tests/hiring-tools.test.mjs
```

### Develop against your configured PostgreSQL database

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Run Dev Environment:**
   ```bash
   npm run dev:all
   ```
   *(Starts both Express API server and Vite frontend dev server simultaneously)*

3. **Build for Production:**
   ```bash
   npm run build
   ```
