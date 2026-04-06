import * as t from 'drizzle-orm/pg-core'
import { jsonb, numeric, serial, pgTable as table } from 'drizzle-orm/pg-core'
import { timestamps } from '../column.helpers'
import type { User } from './users'

export const promocodes = table('promocodes', {
  id: serial('id').primaryKey(),
  code: t.varchar('code', { length: 100 }).notNull().unique(),
  active: t.boolean('active').notNull().default(true),
  count: t.integer('count').notNull().default(0), // оставшееся кол-во активаций
  reward: numeric('reward', { precision: 20, scale: 8 }).notNull().$type<string>(),
  payload: jsonb('payload').$type<{ accountsList?: User['id'][] }>(),
  ...timestamps,
})

export type Promocode = typeof promocodes.$inferSelect
export type NewPromocode = typeof promocodes.$inferInsert
