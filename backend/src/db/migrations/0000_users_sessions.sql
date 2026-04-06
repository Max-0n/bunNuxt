CREATE TABLE "sessions" (
	"id" varchar PRIMARY KEY NOT NULL,
	"userId" varchar NOT NULL,
	"lastActivityAt" timestamp DEFAULT now() NOT NULL,
	"logoutAt" timestamp,
	"deletedAt" timestamp
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY NOT NULL,
	"firstName" varchar(100),
	"lastName" varchar(100),
	"username" varchar(100) NOT NULL,
	"avatar" varchar DEFAULT '' NOT NULL,
	"languageCode" varchar(20) NOT NULL,
	"isBot" boolean,
	"isPremium" boolean,
	"invitee" varchar,
	"trafficId" varchar,
	"role" varchar(20) DEFAULT 'user',
	"updatedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_invitee_users_id_fk" FOREIGN KEY ("invitee") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_sessions_idx" ON "sessions" USING btree ("userId");
