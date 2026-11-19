CREATE TABLE "emission_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"scope" smallint NOT NULL,
	"reporting_year" smallint NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"amount" numeric NOT NULL,
	"unit" text NOT NULL,
	"factor_year" smallint NOT NULL,
	"kg_co2e_per_unit" numeric NOT NULL,
	"co2e_kg" numeric NOT NULL,
	"data_source" text,
	"notes" text,
	"status" text NOT NULL,
	"rejection_reason" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	CONSTRAINT "emission_entries_status_check" CHECK ("emission_entries"."status" in ('pending', 'verified', 'rejected')),
	CONSTRAINT "emission_entries_scope_check" CHECK ("emission_entries"."scope" between 1 and 3),
	CONSTRAINT "emission_entries_amount_check" CHECK ("emission_entries"."amount" > 0),
	CONSTRAINT "emission_entries_period_check" CHECK ("emission_entries"."period_end" >= "emission_entries"."period_start")
);
--> statement-breakpoint
CREATE TABLE "emission_entry_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"entry_id" uuid,
	"action" text NOT NULL,
	"actor_id" uuid,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "require_verification" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "emission_entries" ADD CONSTRAINT "emission_entries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emission_entries" ADD CONSTRAINT "emission_entries_source_id_emission_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."emission_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emission_entries" ADD CONSTRAINT "emission_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emission_entries" ADD CONSTRAINT "emission_entries_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emission_entry_events" ADD CONSTRAINT "emission_entry_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emission_entry_events" ADD CONSTRAINT "emission_entry_events_entry_id_emission_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."emission_entries"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emission_entry_events" ADD CONSTRAINT "emission_entry_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "emission_entries_company_period_idx" ON "emission_entries" USING btree ("organization_id","period_start" DESC NULLS LAST,"created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "emission_entries_company_pending_idx" ON "emission_entries" USING btree ("organization_id","period_start" DESC NULLS LAST,"created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "emission_entries"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "emission_entry_events_entry_idx" ON "emission_entry_events" USING btree ("entry_id","created_at");--> statement-breakpoint
CREATE INDEX "emission_entry_events_company_idx" ON "emission_entry_events" USING btree ("organization_id","created_at" DESC NULLS LAST);