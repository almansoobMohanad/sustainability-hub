-- Trigram matching for the emission source search index (ships with Postgres; available on RDS).
-- Added by hand: drizzle-kit doesn't generate extensions.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
DROP INDEX "emission_sources_scope_order_idx";--> statement-breakpoint
ALTER TABLE "emission_sources" ADD COLUMN "search_text" text GENERATED ALWAYS AS (lower(category || ' ' || name)) STORED NOT NULL;--> statement-breakpoint
CREATE INDEX "emission_sources_library_scope_order_idx" ON "emission_sources" USING btree ("library_code","scope","sort_order");--> statement-breakpoint
CREATE INDEX "emission_sources_library_category_order_idx" ON "emission_sources" USING btree ("library_code","category","scope","sort_order");--> statement-breakpoint
CREATE INDEX "emission_sources_search_trgm_idx" ON "emission_sources" USING gin ("search_text" gin_trgm_ops);