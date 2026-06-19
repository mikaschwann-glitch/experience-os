# Experience-OS — Cloud Preview Readiness

How to run Experience-OS locally and how to stand up a **private cloud preview**
on Vercel with managed Postgres.

> ⚠️ **Demo environment only.** Run 1 ships a **dev-auth stub** (one hardcoded demo
> tenant + user, server-side) and **no production auth, no access control, and no
> real RLS**. Do **not** put real guest data into any cloud preview. Treat the
> preview as a private demo: restrict access (Vercel preview protection /
> password), use only seeded/synthetic data, and delete it when done.

---

## 1. Local development (Docker Postgres)

Local development keeps using the Docker Postgres in `docker-compose.yml`
(isolated container + volume, Experience-OS only).

```bash
# 1. Start local Postgres
docker compose up -d

# 2. Configure env
cp .env.example .env.local
# .env.local already points at the local Docker DB:
#   DATABASE_URL=postgres://postgres:postgres@localhost:5432/experience_os

# 3. Apply schema + load demo data
npm run db:migrate
npm run db:seed

# 4. Run the app
npm run dev      # http://localhost:3000  (dashboard at /dashboard)
```

The connection layer (`db/client.ts`) detects `localhost`/`127.0.0.1` and uses a
pooled, prepared-statement connection locally — unchanged from before.

---

## 2. Managed Postgres (for the cloud preview)

Use any standard managed Postgres. Recommended for a Vercel preview:
**Neon**, **Supabase**, or **Vercel Postgres** (Neon-backed).

Requirements for the `DATABASE_URL`:

- Use the provider's **pooled / transaction-pooler** connection string
  (Neon `-pooler` host, Supabase port **6543**, Vercel "pooled" string).
- Include **`?sslmode=require`** (managed Postgres requires TLS).
- The app auto-detects non-localhost hosts and sets `prepare: false` + `max: 1`
  so it is safe through a transaction-mode pooler (PgBouncer/Neon/Supabase).
  No code change is needed per provider.

Connection string shapes (placeholders — never commit real values):

```
# Neon (pooled)
postgres://USER:PASSWORD@ep-xxxx-pooler.REGION.aws.neon.tech/experience_os?sslmode=require

# Supabase (transaction pooler)
postgres://postgres.PROJECT:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres?sslmode=require

# Vercel Postgres
# Use the pooled connection string shown in the Vercel Storage tab (?sslmode=require)
```

---

## 3. Required `DATABASE_URL`

A single variable drives the app, migrations, and seed:

```
DATABASE_URL=postgres://USER:PASSWORD@HOST:PORT/DBNAME?sslmode=require
```

- **Local:** set in `.env.local` (Docker value above).
- **Cloud:** set as a Vercel project Environment Variable (see §6) **and**, when
  running migrate/seed from your machine against the cloud DB, export it in your
  shell or a temporary local env (see §4–§5).

---

## 4. Migration command (against a cloud database)

Migrations run from your machine (or CI) pointed at the cloud `DATABASE_URL`.
They are **not** run during the Vercel build.

PowerShell (Windows):

```powershell
$env:DATABASE_URL = "postgres://USER:PASSWORD@HOST:PORT/DBNAME?sslmode=require"
npm run db:migrate
```

bash/zsh:

```bash
DATABASE_URL="postgres://USER:PASSWORD@HOST:PORT/DBNAME?sslmode=require" npm run db:migrate
```

`drizzle.config.ts` reads `process.env.DATABASE_URL`. It also tries to load
`.env.local` for convenience; that load safely no-ops if the file is absent
(e.g. in CI), so the explicit env var above always wins where it matters.

> Tip: for migration commands prefer the provider's **direct** (non-pooled)
> connection string if offered — DDL is more reliable off the transaction pooler.
> The app runtime should still use the pooled string.

---

## 5. Seed command (against a cloud database)

> Seeding is **destructive for the demo tenant**: it deletes and recreates the
> `atlantic-hideaway` tenant (cascades). Only run it on a demo database.

PowerShell:

```powershell
$env:DATABASE_URL = "postgres://USER:PASSWORD@HOST:PORT/DBNAME?sslmode=require"
npm run db:seed
```

bash/zsh:

```bash
DATABASE_URL="postgres://USER:PASSWORD@HOST:PORT/DBNAME?sslmode=require" npm run db:seed
```

---

## 6. Vercel setup

1. **Link the project** (interactive — requires your login):
   ```bash
   vercel login
   vercel link
   ```
2. **Create / connect managed Postgres**: either add Postgres from the Vercel
   Storage tab, or create a Neon/Supabase DB and copy its pooled URL.
3. **Add the environment variable** in the Vercel project
   (Settings → Environment Variables), for the **Preview** (and Production if used)
   environment:
   ```
   DATABASE_URL = postgres://USER:PASSWORD@HOST:PORT/DBNAME?sslmode=require
   ```
4. **Migrate + seed** the cloud DB once, from your machine (§4–§5).
5. **Deploy a preview**:
   ```bash
   vercel        # preview deployment
   ```
6. **Protect the preview**: enable Vercel preview protection / password so the
   demo is private.

No `vercel.json` is required — Next.js is auto-detected. The build (`next build`)
does **not** need a database: dashboard routes are `force-dynamic` and the DB
client initializes lazily at request time.

---

## 7. Hard limits for the preview (read before sharing)

- Demo only. **No real guest data.**
- No production authentication, authorization, or RLS yet (app-layer tenant
  scoping only).
- Single demo tenant + user via dev-auth stub.
- Keep the preview access-restricted and short-lived.
