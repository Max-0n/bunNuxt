import { numeric, serial, pgTable as table, timestamp, varchar } from 'drizzle-orm/pg-core'
import { users } from './users'

export const withdrawRequests = table('withdrawRequests', {
  id: serial('id').primaryKey(),
  userId: varchar('userId')
    .notNull()
    .references(() => users.id),
  amount: numeric('amount', { precision: 20, scale: 8 }).notNull().$type<string>(),
  toAddress: varchar('toAddress').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'), // pending | payed | rejected
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  confirmedAt: timestamp('confirmedAt'),
  processedByAdminId: varchar('processedByAdminId').references(() => users.id),
  txHash: varchar('txHash'),
})

export type WithdrawRequest = typeof withdrawRequests.$inferSelect
export type NewWithdrawRequest = typeof withdrawRequests.$inferInsert
