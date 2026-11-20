CREATE TABLE "emission_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"entry_count" integer NOT NULL,
	"skipped_rows" integer DEFAULT 0 NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"undone_by" uuid,
	"undone_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "emission_entries" ADD COLUMN "import_id" uuid;--> statement-breakpoint
ALTER TABLE "emission_imports" ADD CONSTRAINT "emission_imports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emission_imports" ADD CONSTRAINT "emission_imports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emission_imports" ADD CONSTRAINT "emission_imports_undone_by_users_id_fk" FOREIGN KEY ("undone_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "emission_imports_company_created_idx" ON "emission_imports" USING btree ("organization_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "emission_entries" ADD CONSTRAINT "emission_entries_import_id_emission_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."emission_imports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "emission_entries_import_idx" ON "emission_entries" USING btree ("import_id") WHERE "emission_entries"."import_id" is not null;