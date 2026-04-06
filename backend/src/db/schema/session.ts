import * as t from 'drizzle-orm/pg-core'
import { pgTable as table } from 'drizzle-orm/pg-core'

export const sessions = table(
  'sessions',
  {
    id: t.varchar().primaryKey(),
    userId: t.varchar('userId').notNull(),
    lastActivityAt: t.timestamp('lastActivityAt').defaultNow().notNull(),
    logoutAt: t.timestamp('logoutAt'),
    deletedAt: t.timestamp('deletedAt'),
  },
  table => [t.index('user_sessions_idx').on(table.userId)]
)

export type Session = typeof sessions.$inferInsert
