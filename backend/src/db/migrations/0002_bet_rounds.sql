CREATE TABLE "bets" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" varchar NOT NULL,
	"roundId" integer NOT NULL,
	"amount" numeric(20, 8) NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" serial PRIMARY KEY NOT NULL,
	"status" varchar(20) DEFAULT 'waiting' NOT NULL,
	"startTime" timestamp,
	"endTime" timestamp,
	"bankAmount" numeric(20, 8) DEFAULT '0' NOT NULL,
	"winnerUserId" varchar,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "balance" numeric(20, 8) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "bets" ADD CONSTRAINT "bets_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bets" ADD CONSTRAINT "bets_roundId_rounds_id_fk" FOREIGN KEY ("roundId") REFERENCES "public"."rounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_winnerUserId_users_id_fk" FOREIGN KEY ("winnerUserId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
