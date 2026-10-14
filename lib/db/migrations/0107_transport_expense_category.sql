-- Add transport as a spending category. Existing expense rows and categories are unchanged.
ALTER TYPE "public"."expense_category" ADD VALUE IF NOT EXISTS 'Doprava';
