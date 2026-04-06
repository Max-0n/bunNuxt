// @ts-nocheck
import { defineConfig } from 'drizzle-kit'
import { Config } from './src/Config'

const config = Config()

export default defineConfig({
  dialect: 'postgresql',
  out: './src/db/migrations',
  schema: './src/db/schema',
  migrations: {
    table: 'migrations',
    schema: 'public',
  },
  dbCredentials:
    config.appName === 'Local'
      ? {
          url: `postgresql://${config.postgres.user}:${config.postgres.password}@${config.postgres.host}:${config.postgres.port}/${config.postgres.database}`,
        }
      : {
          url: `postgresql://${config.postgres.user}:${config.postgres.password}@${config.postgres.host}:${config.postgres.port}/${config.postgres.database}?sslmode=no-verify`,
          ssl: { rejectUnauthorized: false },
        },
  verbose: true,
})
