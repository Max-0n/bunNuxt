CREATE TABLE IF NOT EXISTS "promocodes" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(100) NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"reward" numeric(20, 8) NOT NULL,
	"payload" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp,
	"deletedAt" timestamp
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "promocodes_code_unique" ON "promocodes" ("code");
