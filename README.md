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

## Other Helpful Commands

- `npm run prisma:migrate` – create & apply new Prisma migrations (development only)
- `npm run prisma:deploy` – apply existing migrations (CI/CD or prod)
- `npm run seed` – idempotent bootstrap script (admin, items, sample reports)
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
