CREATE TABLE "transactions" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" varchar,
	"type" varchar(20) NOT NULL,
	"amount" numeric(20, 8) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"payload" jsonb,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
