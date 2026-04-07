CREATE TABLE "circle_draw_scores" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" varchar(64) NOT NULL,
	"scorePercent" integer NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "circle_draw_scores" ADD CONSTRAINT "circle_draw_scores_userId_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "circle_draw_scores_user_idx" ON "circle_draw_scores" USING btree ("userId");