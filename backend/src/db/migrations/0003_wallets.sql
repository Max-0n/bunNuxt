CREATE TABLE "wallets" (
	"id" varchar PRIMARY KEY NOT NULL,
	"userId" varchar NOT NULL,
	"updatedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"deletedAt" timestamp
);
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "walletId" varchar;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "txBoc" varchar;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_walletId_wallets_id_fk" FOREIGN KEY ("walletId") REFERENCES "public"."wallets"("id") ON DELETE no action ON UPDATE no action;
