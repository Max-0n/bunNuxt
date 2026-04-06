import { jsonb, numeric, pgTable as table, varchar } from 'drizzle-orm/pg-core'
import { timestamps } from '../column.helpers'
import { users } from './users'

export const nfts = table('nfts', {
  address: varchar('address').primaryKey(), // NFT item contract address

  name: varchar('name').notNull().default(''),
  description: varchar('description').notNull().default(''),
  image: varchar('image').notNull().default(''),
  animationUrl: varchar('animationUrl'),

  attributes: jsonb('attributes'), // array of {trait_type,value} or any metadata attributes

  preview5x5: varchar('preview5x5'),
  preview100x100: varchar('preview100x100'),
  preview500x500: varchar('preview500x500'),
  preview1500x1500: varchar('preview1500x1500'),

  userId: varchar('userId').references(() => users.id),

  // price in TON stored as numeric string
  price: numeric('price', { precision: 20, scale: 8 }).notNull().default('10').$type<string>(),
  status: varchar('status', { length: 20 }).notNull().default('disabled'), // 'active' | 'disabled' | 'sold' | 'bet' | 'send'

  ...timestamps,
})

export type Nft = typeof nfts.$inferSelect
export type NewNft = typeof nfts.$inferInsert
