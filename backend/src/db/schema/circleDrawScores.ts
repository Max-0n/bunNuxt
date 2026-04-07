import * as t from 'drizzle-orm/pg-core'
import { AnyPgColumn, pgTable as table } from 'drizzle-orm/pg-core'
import { users } from './users'

export const circleDrawScores = table(
  'circle_draw_scores',
  {
    id: t.serial('id').primaryKey(),
    userId: t.varchar('userId', { length: 64 }).references((): AnyPgColumn => users.id, { onDelete: 'cascade' }),
    scorePercent: t.integer('scorePercent').notNull(),
    createdAt: t.timestamp('createdAt').defaultNow().notNull(),
  },
  table_ => [t.index('circle_draw_scores_user_idx').on(table_.userId)]
)

export type CircleDrawScore = typeof circleDrawScores.$inferSelect
export type NewCircleDrawScore = typeof circleDrawScores.$inferInsert
