CREATE TABLE IF NOT EXISTS "withdrawRequests" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" varchar NOT NULL,
	"amount" numeric(20, 8) NOT NULL,
	"toAddress" varchar NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"confirmedAt" timestamp,
	"processedByAdminId" varchar,
	"txHash" varchar
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "withdrawRequests" ADD CONSTRAINT "withdrawRequests_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "withdrawRequests" ADD CONSTRAINT "withdrawRequests_processedByAdminId_users_id_fk" FOREIGN KEY ("processedByAdminId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "withdraw_requests_user_idx" ON "withdrawRequests" ("userId");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "withdraw_requests_status_created_idx" ON "withdrawRequests" ("status","createdAt");
