# Backend

## Development

1. Copy `.env.example` to `.env` and adjust Postgres settings if needed
2. `docker compose build`
2. `docker compose up -d postgres valkey-cache valkey-bullmq backend barcode-api`


## Migrations

#### Create snapshot and migration
– run `bunx drizzle-kit generate` from `/backend` directory

This command will:
1. Compare your current schema (`src/db/schema`) with the last snapshot
2. Generate a new SQL migration file
3. Automatically create a new snapshot in `src/db/migrations/meta/`

#### Apply migrations
– run `bunx drizzle-kit migrate` to apply pending migrations to the database