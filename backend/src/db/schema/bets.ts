import { integer, numeric, serial, pgTable as table, timestamp, varchar } from 'drizzle-orm/pg-core'
import { nfts } from './nfts'
import { rounds } from './rounds'
import { users } from './users'

export const bets = table('bets', {
  id: serial('id').primaryKey(),
  userId: varchar('userId')
    .notNull()
    .references(() => users.id),
  roundId: integer('roundId')
    .notNull()
    .references(() => rounds.id),
  type: varchar('type', { length: 10 }).notNull().default('ton'), // 'ton' | 'nft'
  nftAddress: varchar('nftAddress').references(() => nfts.address), // present only for type='nft'
  amount: numeric('amount', { precision: 20, scale: 8 }).notNull().$type<string>(),
  game: varchar('game', { length: 10 }).notNull(), // 'pvp' | 'duel' | 'limit' | '32'
  color: varchar('color', { length: 10 }), // 'light' | 'dark' | 'red' (optional)
  createdAt: timestamp('createdAt').defaultNow().notNull(),
})

export type Bet = typeof bets.$inferSelect
export type NewBet = typeof bets.$inferInsert
