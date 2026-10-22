# WorkPulse — Freelance Marketplace

WorkPulse is a full-stack, Upwork-inspired freelance marketplace platform built with **Next.js 16 (App Router)**, **TypeScript**, **Tailwind CSS v4**, **PostgreSQL**, and **Prisma ORM**.

---

## 🛠 System Prerequisites

- **Node.js**: `v20.x` or higher (verified on Node `v26.5.0`)
- **Package Manager**: `npm` `10.x` or higher (verified on npm `11.17.0`)
- **Database Engine**: PostgreSQL `14+` (local instance, Docker container, or hosted service like Supabase/Neon/Render)

---

## 🚀 Environment Configuration

1. Copy the example environment template:
   ```bash
   cp .env.example .env
   ```

2. Open `.env` and set your PostgreSQL connection string:
   ```env
   # Local PostgreSQL instance example:
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/workpulse?schema=public"

   # Neon / Supabase cloud example with SSL pooling:
   # DATABASE_URL="postgresql://user:password@ep-sample-pooler.us-east-2.aws.neon.tech/workpulse?sslmode=require&pgbouncer=true"
   ```

> **Note on Zero-Configuration Fallback:**  
> The application includes a resilient server-side data-access layer (`src/lib/jobs.ts`). If PostgreSQL is offline or unmigrated, it gracefully falls back to the in-memory seed dataset (`SEED_JOBS`) with full search, filter, and pagination capabilities. When PostgreSQL is online, it directly executes optimized Prisma queries against your database.

---

## 📦 Installation & Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Generate the Prisma client:**
   ```bash
   npx prisma generate
   ```

3. **Push the database schema (creates tables and indexes in PostgreSQL):**
   ```bash
   npx prisma db push
   # Or create a timestamped migration:
   # npx prisma migrate dev --name init_jobs
   ```

4. **Seed the database with realistic freelance contracts:**
   ```bash
   npx prisma db seed
   ```
   > The seed script (`prisma/seed.ts`) idempotently upserts **12 realistic freelance contracts** across Development, Design, AI, Writing, and Finance, preventing duplicate entries on repeated runs.

5. **Start the development server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧭 Application Routes

| Path | Purpose |
|------|---------|
| `/` | Marketing Homepage with cinematic video background hero, value props, categories, and metrics |
| `/jobs` | Interactive Job Board with search, category/type/experience filters, sorting, and pagination (synced with URL search params) |
| `/jobs/[id]` | Comprehensive Contract Details page with client verification stats, scope breakdown, and honest application modal |
| `/api/jobs` | REST Route Handler: search, filter, sort, and paginate jobs |
| `/api/jobs/[id]` | REST Route Handler: retrieve single job by ID with 404 handling |

---

## 📡 REST API Documentation

### 1. `GET /api/jobs`

Returns a paginated list of jobs matching query filters.

#### Query Parameters
- `search` *(string, optional)*: Keyword query matched against job title, description, and required skills.
- `category` *(string, optional)*: Filter by category (e.g. `Development & IT`, `Design & Creative`, `AI & Machine Learning`, `Writing & Translation`, `Finance & Accounting`, `Admin & Customer Support`).
- `type` *(string, optional)*: `FIXED` or `HOURLY`.
- `experienceLevel` *(string, optional)*: `ENTRY`, `INTERMEDIATE`, or `EXPERT`.
- `sortBy` *(string, optional)*: `newest` (default), `budget_high`, or `proposals_low`.
- `page` *(number, optional)*: Page number (default: `1`).
- `limit` *(number, optional)*: Results per page (default: `10`, maximum: `50`).

#### Example Request
```http
GET /api/jobs?search=nextjs&type=HOURLY&page=1&limit=5 HTTP/1.1
Host: localhost:3000
```

#### Example Response (200 OK)
```json
{
  "data": [
    {
      "id": "job-nextjs-fullstack-01",
      "title": "Senior Full-Stack Next.js 16 & TypeScript Architect",
      "description": "We are seeking an experienced senior full-stack engineer to build an enterprise SaaS analytics dashboard...",
      "category": "Development & IT",
      "skills": ["Next.js", "TypeScript", "React", "Tailwind CSS", "PostgreSQL", "Node.js"],
      "type": "HOURLY",
      "hourlyMin": 70,
      "hourlyMax": 110,
      "budget": null,
      "duration": "3 to 6 months",
      "experienceLevel": "EXPERT",
      "status": "OPEN",
      "proposalsCount": 6,
      "clientName": "CloudScale Analytics Inc.",
      "clientCountry": "United States",
      "clientRating": 4.95,
      "clientSpent": 185000,
      "clientPaymentVerified": true,
      "createdAt": "2026-10-21T06:00:00.000Z",
      "updatedAt": "2026-10-21T06:00:00.000Z"
    }
  ],
  "pagination": {
    "total": 1,
    "page": 1,
    "limit": 5,
    "totalPages": 1
  }
}
```

---

### 2. `GET /api/jobs/[id]`

Retrieves a single job specification by its unique ID.

#### Example Request
```http
GET /api/jobs/job-nextjs-fullstack-01 HTTP/1.1
Host: localhost:3000
```

#### Example Response (200 OK)
```json
{
  "data": {
    "id": "job-nextjs-fullstack-01",
    "title": "Senior Full-Stack Next.js 16 & TypeScript Architect",
    "description": "We are seeking an experienced senior full-stack engineer...",
    "category": "Development & IT",
    "skills": ["Next.js", "TypeScript", "React", "Tailwind CSS", "PostgreSQL", "Node.js"],
    "type": "HOURLY",
    "hourlyMin": 70,
    "hourlyMax": 110,
    "budget": null,
    "duration": "3 to 6 months",
    "experienceLevel": "EXPERT",
    "status": "OPEN",
    "proposalsCount": 6,
    "clientName": "CloudScale Analytics Inc.",
    "clientCountry": "United States",
    "clientRating": 4.95,
    "clientSpent": 185000,
    "clientPaymentVerified": true,
    "createdAt": "2026-10-21T06:00:00.000Z",
    "updatedAt": "2026-10-21T06:00:00.000Z"
  }
}
```

#### Example Error Response (404 Not Found)
```json
{
  "error": "Job with ID 'job-unknown-999' was not found"
}
```

---

## 🏛 Architectural Highlights & Security

1. **Separation of Concerns:**
   - **Data-Access Layer** (`src/lib/jobs.ts`): Encapsulates all query building, filtering, pagination mathematics, and database error tolerance.
   - **Server-Only Prisma Client** (`src/lib/prisma.ts`): Singleton instance using global caching in development to prevent connection exhaustion.
   - **Route Handlers** (`src/app/api/jobs/route.ts`): Pure HTTP transport layer parsing request parameters and enforcing Zod input validation schemas.
   - **Client Components** (`src/components/jobs/`): Pure presentation and interactive state management querying `/api/jobs` and `/api/jobs/[id]`. No Prisma or database imports exist in client components.

2. **No Fake Authentication:**
   - Job details view includes an honest Apply modal stating clearly that proposal submission and freelancer profiles require future authentication and escrow integration.

3. **Homepage Preservation:**
   - The original WorkPulse homepage (`src/app/page.tsx`), navigation links, metrics, and video hero background (`homevideo.mp4`) remain untouched and fully intact.

---

## 🧪 Verification & Build Commands

Run the test and verification suite:

```bash
# Code style and TypeScript linting
npm run lint

# Next.js production build verification
npm run build
```
