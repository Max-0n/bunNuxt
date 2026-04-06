import { jsonb, numeric, serial, pgTable as table, timestamp, varchar } from 'drizzle-orm/pg-core'
import { users } from './users'
import { wallets } from './wallets'

export const transactions = table('transactions', {
  id: serial('id').primaryKey(),
  userId: varchar('userId').references(() => users.id), // null для транзакций типа 'tax'
  walletId: varchar('walletId').references(() => wallets.id), // Связь с кошельком, с которого было пополнение
  type: varchar('type', { length: 20 }).notNull(), // 'bet' | 'win' | 'deposit' | 'withdraw' | 'tax'
  amount: numeric('amount', { precision: 20, scale: 8 }).notNull().$type<string>(),
  status: varchar('status', { length: 20 }).notNull().default('pending'), // 'initial' | 'pending' | 'completed' | 'failed'
  payload: jsonb('payload'),
  txBoc: varchar('txBoc'), // BOC транзакции для проверки
  createdAt: timestamp('createdAt').defaultNow().notNull(),
})

export type Transaction = typeof transactions.$inferSelect
export type NewTransaction = typeof transactions.$inferInsert
