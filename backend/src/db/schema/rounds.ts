import { numeric, serial, pgTable as table, timestamp, varchar } from 'drizzle-orm/pg-core'
import { users } from './users'

export const rounds = table('rounds', {
  id: serial('id').primaryKey(),
  status: varchar('status', { length: 20 }).notNull().default('waiting'),
  startTime: timestamp('startTime'),
  endTime: timestamp('endTime'),
  bankAmount: numeric('bankAmount', { precision: 20, scale: 8 }).notNull().default('0').$type<string>(),
  winnerUserId: varchar('winnerUserId').references(() => users.id),
  winnerColor: varchar('winnerColor', { length: 10 }), // 'light' | 'dark' | 'red' (optional, for game mode '32')
  game: varchar('game', { length: 10 }).notNull(), // 'pvp' | 'duel' | 'limit' | '32'
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  updatedAt: timestamp('updatedAt'),
})

export type Round = typeof rounds.$inferSelect
export type NewRound = typeof rounds.$inferInsert
