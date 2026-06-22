# TalentDesk PostgreSQL Setup

TalentDesk now uses a Node/Express API with PostgreSQL through Prisma.

## 1. Create a PostgreSQL database

Use Neon, Railway, Render, local PostgreSQL, or any managed Postgres provider.

## 2. Configure environment variables

Copy `.env.example` to `.env` and fill in:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/talentdesk?schema=public"
JWT_SECRET="use-a-long-random-secret"
CLIENT_ORIGIN="http://localhost:5173"
PORT=4000
```

## 3. Create database tables

```bash
npm run prisma:migrate
```

## 4. Run the app locally

```bash
npm run dev:all
```

The API runs on `http://localhost:4000`, and Vite proxies `/api` from the React app.

## Notes

- The first signed-up user becomes `superadmin`.
- Invites are currently stored in `user_invitations`; email delivery can be added with Resend, SendGrid, or another provider.
- Supabase client code, the Supabase npm dependency, and the local `supabase/` folder have been removed.
