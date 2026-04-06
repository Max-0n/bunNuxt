import { pgTable as table, varchar } from 'drizzle-orm/pg-core'
import { timestamps } from '../column.helpers'
import { users } from './users'

export const wallets = table('wallets', {
  id: varchar('id').primaryKey(), // TON адрес кошелька
  userId: varchar('userId')
    .notNull()
    .references(() => users.id),
  ...timestamps,
})

export type Wallet = typeof wallets.$inferSelect
export type NewWallet = typeof wallets.$inferInsert
