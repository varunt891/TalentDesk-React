-- Row Level Security (RLS) Enablement & Tenant Isolation Policies
-- Enable RLS on core multi-tenant SaaS tables

ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_members" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "organization_invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "candidates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "callbacks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "followups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "postings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "activity_logs" ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS tenant_isolation_candidates ON "candidates";
DROP POLICY IF EXISTS tenant_isolation_jobs ON "jobs";
DROP POLICY IF EXISTS tenant_isolation_callbacks ON "callbacks";
DROP POLICY IF EXISTS tenant_isolation_followups ON "followups";
DROP POLICY IF EXISTS tenant_isolation_postings ON "postings";
DROP POLICY IF EXISTS tenant_isolation_tasks ON "tasks";
DROP POLICY IF EXISTS tenant_isolation_activity_logs ON "activity_logs";
DROP POLICY IF EXISTS tenant_isolation_org_members ON "organization_members";

-- Create RLS Policies based on session app.current_org_id setting
CREATE POLICY tenant_isolation_candidates ON "candidates"
  USING (org_id::text = current_setting('app.current_org_id', true) OR current_setting('app.current_org_id', true) IS NULL);

CREATE POLICY tenant_isolation_jobs ON "jobs"
  USING (org_id::text = current_setting('app.current_org_id', true) OR current_setting('app.current_org_id', true) IS NULL);

CREATE POLICY tenant_isolation_callbacks ON "callbacks"
  USING (org_id::text = current_setting('app.current_org_id', true) OR current_setting('app.current_org_id', true) IS NULL);

CREATE POLICY tenant_isolation_followups ON "followups"
  USING (org_id::text = current_setting('app.current_org_id', true) OR current_setting('app.current_org_id', true) IS NULL);

CREATE POLICY tenant_isolation_postings ON "postings"
  USING (org_id::text = current_setting('app.current_org_id', true) OR current_setting('app.current_org_id', true) IS NULL);

CREATE POLICY tenant_isolation_tasks ON "tasks"
  USING (org_id::text = current_setting('app.current_org_id', true) OR current_setting('app.current_org_id', true) IS NULL);

CREATE POLICY tenant_isolation_activity_logs ON "activity_logs"
  USING (org_id::text = current_setting('app.current_org_id', true) OR current_setting('app.current_org_id', true) IS NULL);

CREATE POLICY tenant_isolation_org_members ON "organization_members"
  USING (organization_id::text = current_setting('app.current_org_id', true) OR current_setting('app.current_org_id', true) IS NULL);
