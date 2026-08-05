-- Applied directly via `prisma db execute` due to pre-existing drift between
-- migration history and the live database (unrelated to this change).
ALTER TABLE "jobs" ADD COLUMN "contact_name" TEXT;
ALTER TABLE "jobs" ADD COLUMN "optional_ref" TEXT;
ALTER TABLE "jobs" ADD COLUMN "bill_rate" TEXT;
ALTER TABLE "jobs" ADD COLUMN "pay_rate" TEXT;
ALTER TABLE "jobs" ADD COLUMN "end_date" TEXT;
ALTER TABLE "jobs" ADD COLUMN "submittal_due" TEXT;
ALTER TABLE "jobs" ADD COLUMN "workers_comp_code" TEXT;
ALTER TABLE "jobs" ADD COLUMN "openings" INTEGER;
ALTER TABLE "jobs" ADD COLUMN "max_submittals" INTEGER;
ALTER TABLE "jobs" ADD COLUMN "experience_level" TEXT;
ALTER TABLE "jobs" ADD COLUMN "work_mode" TEXT;
