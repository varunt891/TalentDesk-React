ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "market" TEXT NOT NULL DEFAULT 'US';
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "date_format" TEXT NOT NULL DEFAULT 'MM/DD/YYYY';
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "language" TEXT NOT NULL DEFAULT 'en';
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "business_hours_start" TEXT NOT NULL DEFAULT '09:00';
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "business_hours_end" TEXT NOT NULL DEFAULT '18:00';
ALTER TABLE "callbacks" ADD COLUMN IF NOT EXISTS "scheduled_at_utc" TIMESTAMP(3);

UPDATE "organizations"
SET
  "market" = 'IN',
  "currency" = 'INR',
  "date_format" = 'DD/MM/YYYY',
  "timezone" = 'Asia/Kolkata',
  "business_hours_start" = '09:30',
  "business_hours_end" = '18:30'
WHERE "timezone" IN ('Asia/Kolkata', 'Asia/Calcutta');
