CREATE TABLE "esg_ready_report_edits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"actor_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone DEFAULT now() NOT NULL,
	"changed" text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "esg_ready_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"year" smallint NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	CONSTRAINT "esg_ready_reports_year_check" CHECK ("esg_ready_reports"."year" between 1990 and 2100)
);
--> statement-breakpoint
ALTER TABLE "esg_ready_report_edits" ADD CONSTRAINT "esg_ready_report_edits_report_id_esg_ready_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."esg_ready_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esg_ready_report_edits" ADD CONSTRAINT "esg_ready_report_edits_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esg_ready_reports" ADD CONSTRAINT "esg_ready_reports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esg_ready_reports" ADD CONSTRAINT "esg_ready_reports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "esg_ready_reports" ADD CONSTRAINT "esg_ready_reports_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "esg_ready_report_edits_report_idx" ON "esg_ready_report_edits" USING btree ("report_id","ended_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "esg_ready_reports_company_year_unique" ON "esg_ready_reports" USING btree ("organization_id","year");