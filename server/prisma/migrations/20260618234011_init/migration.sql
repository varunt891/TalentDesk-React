-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT,
    "industry" TEXT,
    "company_size" TEXT,
    "primary_color" TEXT NOT NULL DEFAULT '#4f7cff',
    "logo_url" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "plan" TEXT NOT NULL DEFAULT 'starter',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "email" TEXT,
    "passwordHash" TEXT,
    "full_name" TEXT,
    "phone" TEXT,
    "role" TEXT NOT NULL DEFAULT 'recruiter',
    "team" TEXT,
    "manager_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidates" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "user_id" UUID,
    "first_name" TEXT,
    "last_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "location" TEXT,
    "work_auth" TEXT,
    "experience" TEXT,
    "linkedin" TEXT,
    "submission_date" TEXT,
    "job_id" TEXT,
    "job_title" TEXT,
    "client" TEXT,
    "rate" TEXT,
    "relocation" TEXT,
    "internal_status" TEXT,
    "external_status" TEXT,
    "feedback_status" TEXT,
    "priority" TEXT,
    "interview_date" TEXT,
    "interview_type" TEXT,
    "fe_name" TEXT,
    "fe_extension" TEXT,
    "account_manager" TEXT,
    "recruiter_name" TEXT,
    "recruiter_id" UUID,
    "skills" JSONB,
    "notes" TEXT,
    "followup_date" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "user_id" UUID,
    "job_id" TEXT,
    "title" TEXT,
    "client" TEXT,
    "location" TEXT,
    "type" TEXT,
    "status" TEXT,
    "rate" TEXT,
    "open_date" TEXT,
    "priority" TEXT,
    "fe" TEXT,
    "skills" JSONB,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "callbacks" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "user_id" UUID,
    "candidate_name" TEXT,
    "phone" TEXT,
    "job" TEXT,
    "date" TEXT,
    "time" TEXT,
    "timezone" TEXT,
    "interest" TEXT,
    "notes" TEXT,
    "status" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "callbacks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "followups" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "user_id" UUID,
    "candidate_name" TEXT,
    "date" TEXT,
    "type" TEXT,
    "status" TEXT,
    "priority" TEXT,
    "notes" TEXT,
    "next_action" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "followups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "postings" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "user_id" UUID,
    "portal" TEXT,
    "date" TEXT,
    "job_id" TEXT,
    "job_title" TEXT,
    "location" TEXT,
    "manager" TEXT,
    "recruiter" TEXT,
    "link" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "postings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_invitations" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'recruiter',
    "team" TEXT,
    "manager_id" UUID,
    "invited_by" UUID,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_log" (
    "id" UUID NOT NULL,
    "org_id" UUID,
    "actor_id" UUID,
    "action" TEXT NOT NULL,
    "target_email" TEXT,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_email_key" ON "profiles"("email");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "callbacks" ADD CONSTRAINT "callbacks_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "followups" ADD CONSTRAINT "followups_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postings" ADD CONSTRAINT "postings_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
