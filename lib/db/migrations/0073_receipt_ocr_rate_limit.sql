-- Security hardening: atomically rate-limit OCR processing attempts, including retries, per household.
-- Uploads remain separately capped by receipt_imports; this table protects the paid OCR pipeline itself.
CREATE TABLE IF NOT EXISTS "receipt_ocr_rate_limits" (
  "household_id" uuid PRIMARY KEY REFERENCES "households"("id") ON DELETE CASCADE,
  "window_started_at" timestamp NOT NULL DEFAULT now(),
  "attempts" integer NOT NULL DEFAULT 0 CHECK ("attempts" >= 0)
);
