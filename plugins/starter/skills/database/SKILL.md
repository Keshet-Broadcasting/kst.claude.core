---
name: database
description: Load whenever the app needs to store data - a database, a table, a model, a schema change, a migration, "save this", "persist", "keep a list of", or when a source project being onboarded uses any database (Postgres, MySQL, Mongo, Firebase, Supabase, localStorage-as-a-database). The one database in this starter is SQLite through Sequelize, with UUID ids, JSON columns where flexible data is needed, and a Sequelize migration for every schema change. Never pick another database. V:0.1.3
---

# Database - SQLite + Sequelize, nothing else

## The rules

1. **SQLite is the only database.** Whatever the source project used (Postgres,
   MySQL, Mongo, Firebase, Supabase), the starter rebuilds it on SQLite. Never add
   another database driver.
2. **Sequelize is the only access layer.** Models and queries go through
   Sequelize. No raw `sqlite3` calls in app code, no second ORM.
3. **Ids are UUIDs.** Every table's primary key is a UUID (v4), never an
   auto-increment integer.
4. **JSON columns are allowed** (`DataTypes.JSON`) for flexible or nested data.
   Use real columns for anything you filter, sort or join on.
5. **Every schema change is a Sequelize migration.** Creating a table, adding or
   renaming a column, an index - each is a new migration file, in the same
   change as the model edit. Never edit an old migration that already ran, never
   `sequelize.sync()` / `sync({ alter: true })` to change a schema, never change
   the `.sqlite` file by hand.
6. **Server only.** The database is touched in route handlers and server
   components, never in a `'use client'` file.

## Docker

The app runs in Docker, but the platform supplies the Dockerfile and ignores
yours. **Do not write a Dockerfile.** What you control is one thing: the
database file's location comes from the env var `DATABASE_PATH`, so the
platform can point it at the container's data folder. Locally the default is
`./data/app.sqlite`. Add `/data` to `.gitignore` - the database file is never
committed. Document the data source in `DEPLOY_REQUEST.md` as a local SQLite
file (the deploy chain's `deployment` agent checks code against it).

## One-time setup (first time the app needs a database)

```bash
pnpm add sequelize sqlite3
pnpm add -D sequelize-cli
```

`package.json` scripts:

```json
"db:migrate": "sequelize-cli db:migrate",
"db:migrate:undo": "sequelize-cli db:migrate:undo",
"db:migration:new": "sequelize-cli migration:generate --name"
```

`.sequelizerc` at the repo root (migrations are CommonJS `.cjs`, outside `src/`):

```js
const path = require('path');
module.exports = {
  config: path.resolve('db', 'config.cjs'),
  'migrations-path': path.resolve('db', 'migrations'),
};
```

`db/config.cjs`:

```js
const storage = process.env.DATABASE_PATH ?? './data/app.sqlite';
module.exports = {
  development: { dialect: 'sqlite', storage },
  production: { dialect: 'sqlite', storage },
};
```

`next.config.ts` - keep the native driver out of the bundle:

```ts
const nextConfig: NextConfig = {
  serverExternalPackages: ['sequelize', 'sqlite3'],
};
```

Connection lives in `src/shared/db/` (server-only; export one cached
`sequelize` instance - reuse it across hot reloads via `globalThis`). Models
live in the entity that owns them: `src/entities/<name>/db/`, exported through
that slice's `index.ts` like everything else (see the `fsd` skill).

Run pending migrations at start: `pnpm db:migrate` before `pnpm dev` and as
part of the production start command.

## Model shape

```ts
id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
payload: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
```

Migration for it (`db/migrations/<timestamp>-create-<table>.cjs`):

```js
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('items', {
      id: { type: Sequelize.UUID, primaryKey: true, allowNull: false },
      payload: { type: Sequelize.JSON, allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('items');
  },
};
```

Every migration has a working `down`. SQLite cannot drop or alter some columns
in place - Sequelize rebuilds the table; check the result and test `down`.

## Changing the schema - the checklist

1. `pnpm db:migration:new <what-changes>` - write `up` and `down`.
2. Edit the model to match.
3. `pnpm db:migrate`, then run the app against it.
4. Test the data access (Vitest, a temp SQLite file or `:memory:`).
5. `pnpm typecheck && pnpm lint && pnpm build && pnpm test`.

## Secrets and auth

The SQLite file has no password, so `DATABASE_PATH` is a plain path, not a
secret. The file holds whatever users put in it: store only what the app
needs, and scope reads by the signed-in user (see the auth agent's rules).
