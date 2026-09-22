ALTER TYPE "public"."receipt_status" ADD VALUE 'uploaded';--> statement-breakpoint
ALTER TYPE "public"."receipt_status" ADD VALUE 'ocr_processing';--> statement-breakpoint
ALTER TYPE "public"."receipt_status" ADD VALUE 'ocr_completed';--> statement-breakpoint
ALTER TYPE "public"."receipt_status" ADD VALUE 'ocr_failed';--> statement-breakpoint
ALTER TYPE "public"."receipt_status" ADD VALUE 'parsing';--> statement-breakpoint
ALTER TYPE "public"."receipt_status" ADD VALUE 'parsed';--> statement-breakpoint
ALTER TYPE "public"."receipt_status" ADD VALUE 'parsing_failed';--> statement-breakpoint
ALTER TYPE "public"."receipt_status" ADD VALUE 'validating';--> statement-breakpoint
ALTER TYPE "public"."receipt_status" ADD VALUE 'review_required';--> statement-breakpoint
ALTER TYPE "public"."receipt_status" ADD VALUE 'duplicate_review';--> statement-breakpoint
ALTER TYPE "public"."receipt_status" ADD VALUE 'completed';--> statement-breakpoint
ALTER TYPE "public"."receipt_status" ADD VALUE 'cancelled';--> statement-breakpoint
ALTER TABLE "receipt_imports" ALTER COLUMN "date" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "receipt_imports" ALTER COLUMN "items" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "receipt_imports" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "receipt_imports" ADD COLUMN "receipt_time" text;--> statement-breakpoint
ALTER TABLE "receipt_imports" ADD COLUMN "receipt_number" text;--> statement-breakpoint
ALTER TABLE "receipt_imports" ADD COLUMN "currency" text DEFAULT 'CZK' NOT NULL;--> statement-breakpoint
ALTER TABLE "receipt_imports" ADD COLUMN "subtotal" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "receipt_imports" ADD COLUMN "discount_total" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "receipt_imports" ADD COLUMN "total" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "receipt_imports" ADD COLUMN "confidence" numeric(4, 3);--> statement-breakpoint
ALTER TABLE "receipt_imports" ADD COLUMN "parser_result" text;--> statement-breakpoint
ALTER TABLE "receipt_imports" ADD COLUMN "error_message" text;--> statement-breakpoint
ALTER TABLE "receipt_imports" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;