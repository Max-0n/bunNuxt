CREATE TABLE "nfts" (
	"address" varchar PRIMARY KEY NOT NULL,
	"name" varchar DEFAULT '' NOT NULL,
	"description" varchar DEFAULT '' NOT NULL,
	"image" varchar DEFAULT '' NOT NULL,
	"animationUrl" varchar,
	"attributes" jsonb,
	"preview5x5" varchar,
	"preview100x100" varchar,
	"preview500x500" varchar,
	"preview1500x1500" varchar,
	"userId" varchar,
	"price" numeric(20, 8) DEFAULT '10' NOT NULL,
	"status" varchar(20) DEFAULT 'disabled' NOT NULL,
	"updatedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp,
	CONSTRAINT "nfts_status_check" CHECK ("status" IN ('active','disabled','sold','bet','send'))
);
--> statement-breakpoint
ALTER TABLE "nfts" ADD CONSTRAINT "nfts_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;


