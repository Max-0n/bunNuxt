import * as t from 'drizzle-orm/pg-core'
import { AnyPgColumn, numeric, pgTable as table } from 'drizzle-orm/pg-core'
import { timestamps } from '../column.helpers'

export const users = table('users', {
  id: t.varchar('id').primaryKey(),
  firstName: t.varchar('firstName', { length: 100 }),
  lastName: t.varchar('lastName', { length: 100 }),
  username: t.varchar('username', { length: 100 }).notNull(),
  avatar: t.varchar('avatar').default('').notNull(),
  languageCode: t.varchar('languageCode', { length: 20 }).notNull(),
  isBot: t.boolean('isBot'),
  isPremium: t.boolean('isPremium'),
  invitee: t.varchar('invitee').references((): AnyPgColumn => users.id),
  trafficId: t.varchar('trafficId'),
  role: t.varchar('role', { length: 20 }).default('user'),
  // Баланс всегда хранится как NUMERIC в БД, а в приложении используется как строка
  balance: numeric('balance', { precision: 20, scale: 8 }).notNull().default('0').$type<string>(),
  ...timestamps,
})

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
