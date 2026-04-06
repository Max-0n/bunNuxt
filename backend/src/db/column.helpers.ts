import { timestamp } from 'drizzle-orm/pg-core'

export const timestamps = {
  updatedAt: timestamp('updatedAt'),
  createdAt: timestamp('createdAt').defaultNow().notNull(),
  deletedAt: timestamp('deletedAt'),
}
