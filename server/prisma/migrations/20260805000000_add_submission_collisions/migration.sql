-- Applied directly via `prisma db execute` due to pre-existing drift between
-- migration history and the live database (unrelated to this change).
-- Purely additive: new table only, no changes to existing tables/data.
CREATE TABLE "submission_collisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID,
    "type" TEXT NOT NULL,
    "match_field" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "candidate_id" UUID NOT NULL,
    "candidate_name" TEXT,
    "candidate_email" TEXT,
    "candidate_phone" TEXT,
    "job_id" TEXT,
    "job_title" TEXT,
    "client" TEXT,
    "submitting_user_id" UUID,
    "submitting_recruiter_name" TEXT,
    "matched_candidate_id" UUID NOT NULL,
    "matched_recruiter_id" UUID,
    "matched_recruiter_name" TEXT,
    "matched_job_id" TEXT,
    "matched_job_title" TEXT,
    "matched_client" TEXT,
    "resolved_by" UUID,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "submission_collisions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "submission_collisions" ADD CONSTRAINT "submission_collisions_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "submission_collisions_org_id_status_idx" ON "submission_collisions"("org_id", "status");
CREATE INDEX "submission_collisions_candidate_id_idx" ON "submission_collisions"("candidate_id");
CREATE INDEX "submission_collisions_matched_candidate_id_idx" ON "submission_collisions"("matched_candidate_id");
