-- Добавляем столбцы как nullable сначала
ALTER TABLE "bets" ADD COLUMN "game" varchar(10);
--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "game" varchar(10);
--> statement-breakpoint
-- Обновляем существующие записи, устанавливая значение 'pvp' по умолчанию
UPDATE "bets" SET "game" = 'pvp' WHERE "game" IS NULL;
--> statement-breakpoint
UPDATE "rounds" SET "game" = 'pvp' WHERE "game" IS NULL;
--> statement-breakpoint
-- Делаем столбцы NOT NULL
ALTER TABLE "bets" ALTER COLUMN "game" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "rounds" ALTER COLUMN "game" SET NOT NULL;
--> statement-breakpoint
-- Добавляем опциональный столбец color в таблицу bets
ALTER TABLE "bets" ADD COLUMN "color" varchar(10);
--> statement-breakpoint
-- Добавляем CHECK constraint для значений color
ALTER TABLE "bets" ADD CONSTRAINT "bets_color_check" CHECK ("color" IS NULL OR "color" IN ('light', 'dark', 'red'));
--> statement-breakpoint
-- Добавляем опциональный столбец winnerColor в таблицу rounds
ALTER TABLE "rounds" ADD COLUMN "winnerColor" varchar(10);
--> statement-breakpoint
-- Добавляем CHECK constraint для значений winnerColor
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_winnerColor_check" CHECK ("winnerColor" IS NULL OR "winnerColor" IN ('light', 'dark', 'red'));
--> statement-breakpoint
-- Обновляем payload транзакций, добавляя game из соответствующего раунда
UPDATE "transactions" 
SET "payload" = jsonb_set(
  COALESCE("payload", '{}'::jsonb),
  '{game}',
  to_jsonb(r."game")
)
FROM "rounds" r
WHERE "transactions"."payload"->>'roundId' IS NOT NULL
  AND ("transactions"."payload"->>'roundId')::integer = r."id";
