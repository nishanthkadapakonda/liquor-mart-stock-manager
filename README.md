# Liquor Mart Stock & Sales Manager

A full-stack admin portal that helps a small liquor mart capture stock purchases, day-end sales, low-stock alerts, and analytics with PDF-ready charts.

## Tech Stack

- **Backend:** Node.js + TypeScript + Express, Prisma ORM
- **Database:** PostgreSQL (local via Docker or any hosted provider like Neon/Supabase/Render)
- **Frontend:** React + TypeScript (Vite), Tailwind CSS, Recharts, React Query

## Prerequisites

- Node.js 20+
- npm 10+
- Docker (optional but recommended for running Postgres locally)
- Access to a PostgreSQL database (Neon free tier works great)

## Quick Start

### 1. Clone & Install

```bash
# Backend deps
cd backend
npm install

# Frontend deps
cd ../frontend
npm install
```

### 2. Configure Environment

Create `backend/.env` (you can copy `.env.example`) and supply the following:

```
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/liquor_mart?schema=public"
PORT=4000
JWT_SECRET=replace-me
ADMIN_EMAIL=admin@liquormart.test
ADMIN_PASSWORD=ChangeMe123!
```

- For **Neon/Supabase/Render**, paste the connection string they provide.
- For **local Docker**, use `postgresql://postgres:postgres@localhost:5432/liquor_mart?schema=public` and run the compose file below.

### 3. Run Postgres Locally (optional)

```bash
# from repo root
docker compose up -d db
```

This exposes Postgres on `localhost:5432` with database `liquor_mart`.

### 4. Migrate & Seed

```bash
cd backend
npx prisma migrate deploy   # or `prisma migrate dev` in local env
npm run seed
```

This provisions schema + seed data (admin user, sample items, purchases, and one day-end report).

### 5. Start the Stack

```bash
# Backend API
cd backend
npm run dev

# Frontend
cd ../frontend
npm run dev
```

Visit `http://localhost:5173` and log in with the seeded admin credentials from `.env`.

## Deploying / Using Hosted Postgres

1. Create a free Postgres database (e.g., [Neon](https://neon.tech) serverless cluster).
2. Update `DATABASE_URL` with the provided connection string.
3. Run `npx prisma migrate deploy && npm run seed` against that database (locally or in CI).
4. Configure your hosting provider (Render/Railway/Heroku/etc.) with the same environment variables.

## Database Management

### Quick Commands (run from `backend/` folder)

| Command | Description |
|---------|-------------|
| `npm run db:reset` | Delete all data, recreate tables (keeps schema) |
| `npm run db:fresh` | Same as reset - complete fresh start |
| `npm run seed` | Add sample items, purchases, and reports |
| `npm run prisma:studio` | Open visual database browser |
| `npm run prisma:migrate` | Create & apply new migrations (dev only) |
| `npm run prisma:deploy` | Apply existing migrations (CI/CD or prod) |

### Using Makefile (Linux/Mac/Git Bash/WSL)

```bash
make db-reset    # Reset database
make db-seed     # Seed sample data
make db-studio   # Open Prisma Studio
make help        # Show all available commands
```

### What Does `db:reset` Do?

```
Step 1: DROP all tables (deletes all data)
            ↓
Step 2: RE-RUN all migrations (recreates tables)
            ↓
Step 3: Empty database with full schema intact ✓
```

| What | Deleted? | Recreated? |
|------|----------|------------|
| **Data** (items, purchases, sales) | ✅ Yes | ❌ No |
| **Tables** (structure) | ✅ Yes | ✅ Yes |
| **Schema file** (`schema.prisma`) | ❌ No | N/A |
| **Migration files** | ❌ No | N/A |

Your schema definition files are **never touched** - only the database contents are reset.

### Complete Fresh Start

```bash
cd backend
npm run db:reset    # Wipe all data
npm run seed        # (Optional) Add sample data
npm run dev         # Start the server
```

## Item Matching Logic (Composite Key)

When importing purchases, items are matched using this priority:

1. **Item ID** – Direct database ID (when editing existing purchases)
2. **SKU** – Unique identifier (e.g., `0019-DD-P`)
3. **Composite Key** – `brandNumber` + `sizeCode` + `packType`

Example: The same brand can have multiple inventory entries:
- `0019-DD-P` → McDowells 180ml (48 units, P type)
- `0019-PP-G` → McDowells 375ml (24 units, G type)
- `0019-QQ-G` → McDowells 750ml (12 units, G type)

## Other Helpful Commands

- `npm run build && npm start` – production build for backend

## Frontend Notes

- React Query handles caching & refetching of dashboard data.
- CSV/XLSX uploads are parsed client-side via PapaParse/XLSX before being sent to the API.
- Analytics section uses Recharts and includes client-side PDF export (html2canvas + jsPDF).

## Testing Cloud Connectivity

If you want to sanity-check a hosted DB from your machine:

```bash
DATABASE_URL="postgresql://..." npx prisma db pull
```

This ensures the API can reach the remote Postgres instance before deploying.

Enjoy managing your liquor mart inventory! 🍾
