import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { Config } from './Config'
import * as schema from './db/schema'

const config = Config()

const create = (arg: { config: NonNullable<Config['postgres']> }) => {
  const { host, database, user, password, port } = arg.config

  const ssl = config.appName === 'Local' ? false : { rejectUnauthorized: false }

  let connectionString = `postgresql://${user}:${password}@${host}:${port}/${database}`
  if (config.appName !== 'Local') connectionString += '?sslmode=no-verify'

  const pool = new Pool({
    connectionString,
    ssl,
    max: 20,
    maxLifetimeSeconds: 60,
    idleTimeoutMillis: 30000,
  })

  const db = drizzle({ client: pool, schema })

  return { db }
}

export type Db = Awaited<ReturnType<typeof Db.create>>
export const Db = { create }
