ALTER TABLE "organizations" ADD COLUMN "subdomain" TEXT;
ALTER TABLE "organizations" ADD COLUMN "email_domain" TEXT;
ALTER TABLE "profiles" ADD COLUMN "extension" TEXT;
ALTER TABLE "profiles" ADD COLUMN "department" TEXT;

CREATE UNIQUE INDEX "organizations_subdomain_key" ON "organizations"("subdomain");
CREATE UNIQUE INDEX "organizations_email_domain_key" ON "organizations"("email_domain");

CREATE TABLE "activity_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID,
    "actor_id" UUID,
    "actor_name" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "summary" TEXT,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
