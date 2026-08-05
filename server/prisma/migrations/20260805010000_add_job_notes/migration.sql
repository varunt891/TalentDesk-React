-- Applied directly via `prisma db execute` due to pre-existing drift between
-- migration history and the live database (unrelated to this change).
ALTER TABLE "jobs" ADD COLUMN "notes" TEXT;
