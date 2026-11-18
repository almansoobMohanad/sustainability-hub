CREATE TABLE "company_settings" (
	"organization_id" uuid PRIMARY KEY NOT NULL,
	"sector" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_sources" (
	"organization_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"default_unit" text,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"added_by" uuid,
	CONSTRAINT "company_sources_organization_id_source_id_pk" PRIMARY KEY("organization_id","source_id")
);
--> statement-breakpoint
CREATE TABLE "emission_factors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"factor_set_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"unit" text NOT NULL,
	"kg_co2e_per_unit" numeric NOT NULL
);
--> statement-breakpoint
CREATE TABLE "emission_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"library_code" text NOT NULL,
	"key" text NOT NULL,
	"scope" smallint NOT NULL,
	"category" text NOT NULL,
	"path" text[] NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "emission_sources_scope_check" CHECK ("emission_sources"."scope" between 1 and 3)
);
--> statement-breakpoint
CREATE TABLE "factor_libraries" (
	"code" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"publisher" text NOT NULL,
	"licence" text NOT NULL,
	"licence_url" text NOT NULL,
	"sources_sha256" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "factor_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"library_code" text NOT NULL,
	"year" smallint NOT NULL,
	"version" text NOT NULL,
	"source_url" text NOT NULL,
	"content_sha256" text NOT NULL,
	"factor_count" integer NOT NULL,
	"loaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_sources" ADD CONSTRAINT "company_sources_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_sources" ADD CONSTRAINT "company_sources_source_id_emission_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."emission_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_sources" ADD CONSTRAINT "company_sources_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emission_factors" ADD CONSTRAINT "emission_factors_factor_set_id_factor_sets_id_fk" FOREIGN KEY ("factor_set_id") REFERENCES "public"."factor_sets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emission_factors" ADD CONSTRAINT "emission_factors_source_id_emission_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."emission_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emission_sources" ADD CONSTRAINT "emission_sources_library_code_factor_libraries_code_fk" FOREIGN KEY ("library_code") REFERENCES "public"."factor_libraries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "factor_sets" ADD CONSTRAINT "factor_sets_library_code_factor_libraries_code_fk" FOREIGN KEY ("library_code") REFERENCES "public"."factor_libraries"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "emission_factors_source_unit_set_unique" ON "emission_factors" USING btree ("source_id","unit","factor_set_id");--> statement-breakpoint
CREATE INDEX "emission_factors_set_idx" ON "emission_factors" USING btree ("factor_set_id");--> statement-breakpoint
CREATE UNIQUE INDEX "emission_sources_library_key_unique" ON "emission_sources" USING btree ("library_code","key");--> statement-breakpoint
CREATE INDEX "emission_sources_scope_order_idx" ON "emission_sources" USING btree ("scope","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "factor_sets_library_year_unique" ON "factor_sets" USING btree ("library_code","year");