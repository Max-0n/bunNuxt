ALTER TABLE "bets" ADD COLUMN "type" varchar(10) DEFAULT 'ton' NOT NULL;
--> statement-breakpoint
ALTER TABLE "bets" ADD COLUMN "nftAddress" varchar;
--> statement-breakpoint
ALTER TABLE "bets" ADD CONSTRAINT "bets_type_check" CHECK ("type" IN ('ton','nft'));
--> statement-breakpoint
ALTER TABLE "bets" ADD CONSTRAINT "bets_asset_check" CHECK (
  ("type" = 'ton' AND "nftAddress" IS NULL)
  OR ("type" = 'nft' AND "nftAddress" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "bets" ADD CONSTRAINT "bets_nftAddress_nfts_address_fk" FOREIGN KEY ("nftAddress") REFERENCES "public"."nfts"("address") ON DELETE no action ON UPDATE no action;


