# CareerOps AI — SaaS Web App Setup

## Tech Stack
- **Frontend:** Next.js 15 (App Router) + React + TypeScript
- **UI:** Tailwind CSS (shadcn-compatible components, hand-written)
- **Database:** PostgreSQL via **Supabase**
- **ORM:** Prisma
- **Auth:** Supabase Auth (email + Google OAuth)
- **AI:** Claude (Anthropic) + OpenAI
- **Storage:** Supabase Storage (CV files)
- **Hosting:** Vercel

---

## Step 1 — Create Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Choose region: **eu-north-1 (Stockholm)** for Swedish latency
3. Wait for the project to be ready (~2 min)

### Get your credentials (Settings → API):
- `NEXT_PUBLIC_SUPABASE_URL` → Project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` → Anon/public key
- `SUPABASE_SERVICE_ROLE_KEY` → service_role key (keep secret)

### Get database URLs (Settings → Database → Connection string):
- `DATABASE_URL` → Use **Transaction pooler** (port 6543) — for Prisma queries
- `DIRECT_URL` → Use **Session pooler** or Direct (port 5432) — for migrations

---

## Step 2 — Configure Supabase Auth

In Supabase Dashboard → Authentication:

1. **Email auth**: Enable "Email" provider (enabled by default)
2. **Google OAuth** (optional but recommended):
   - Go to Providers → Google
   - Create a Google OAuth app at [console.cloud.google.com](https://console.cloud.google.com)
   - Add your Client ID and Secret
3. **Redirect URLs**: Add `http://localhost:3000/api/auth/callback` (dev) and `https://yourapp.vercel.app/api/auth/callback` (prod)

---

## Step 3 — Set up environment variables

```bash
cd webapp
cp .env.example .env.local
```

Fill in `.env.local`:
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...
DATABASE_URL=postgresql://postgres.xxxx:password@aws-0-eu-north-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.xxxx:password@aws-0-eu-north-1.pooler.supabase.com:5432/postgres
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
AI_SWEDEN_PROVIDER=huggingface # optional GPT-SW3 Hugging Face fallback
AI_SWEDEN_BASE_URL=
AI_SWEDEN_MODEL=AI-Sweden-Models/gpt-sw3-356m
HUGGINGFACE_API_KEY=          # optional Hugging Face provider
HF_TOKEN=                     # standard Hugging Face token alias
HUGGINGFACE_BASE_URL=https://router.huggingface.co/v1
HUGGINGFACE_MODEL=openai/gpt-oss-120b:cerebras
ARBETSFORMEDLINGEN_JOBSEARCH_BASE_URL=https://jobsearch.api.jobtechdev.se
JOBTECH_TAXONOMY_BASE_URL=https://taxonomy.api.jobtechdev.se
ENABLE_ARBETSFORMEDLINGEN=true
ENABLE_JOBTECH_TAXONOMY=true
ENABLE_KOMMUN_JOBS=true
ENABLE_REGION_JOBS=true
ENABLE_COMPANY_CAREER_PAGES=true
ENABLE_LIA_PRAKTIK_SEARCH=true
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Step 4 — Install dependencies

```bash
cd webapp
npm install
```

---

## Step 5 — Set up database

```bash
# Generate Prisma client
npm run db:generate

# Push schema to Supabase (first time)
npm run db:push

# Or use migrations (recommended for production)
npm run db:migrate
```

---

## Step 6 — Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Step 7 — Deploy to Vercel

1. Push `saas-platform` branch to GitHub
2. Go to [vercel.com](https://vercel.com) → New Project → Import from GitHub
3. Set root directory to `webapp`
4. Add all environment variables from `.env.local`
5. Deploy

Or via CLI:
```bash
npm install -g vercel
cd webapp
vercel --prod
```

---

## Step 8 — Run Prisma migrations in production

After first Vercel deploy:
```bash
DATABASE_URL="..." DIRECT_URL="..." npx prisma migrate deploy
```

Or Vercel will run it automatically if you set `prisma migrate deploy` in build command.

---

## Step 9 — Set up Supabase Storage (CV files)

In Supabase Dashboard → Storage:
1. Create a new bucket called `cvs`
2. Set it to **private** (users can only access their own files)
3. Add RLS policy: `(auth.uid() = owner)`

> Note: Currently the app stores CV text in PostgreSQL directly. File uploads are extracted server-side. For full file storage, update `api/cv/route.ts` to also upload to Supabase Storage.

---

## Row Level Security (optional but recommended)

In Supabase SQL Editor, run:
```sql
-- Enable RLS on all user tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE cvs ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY "users_own_data" ON users FOR ALL USING (supabase_id = auth.uid()::text);
CREATE POLICY "cvs_own_data" ON cvs FOR ALL USING (
  user_id IN (SELECT id FROM users WHERE supabase_id = auth.uid()::text)
);
```

---

## Make yourself Admin

After registering your account, in Supabase SQL Editor:
```sql
UPDATE users SET role = 'ADMIN' WHERE email = 'your@email.com';
```

Then visit `/admin` to access the admin dashboard.

---

## Project structure

```
webapp/
├── prisma/schema.prisma      — Database schema (12 models)
├── middleware.ts              — Auth protection for all routes
├── src/
│   ├── app/
│   │   ├── page.tsx           — Home / marketing page
│   │   ├── pricing/           — Pricing page
│   │   ├── (auth)/            — Login, Register, Forgot password
│   │   ├── (dashboard)/       — All protected user pages
│   │   │   ├── dashboard/     — Overview with stats
│   │   │   ├── profile/       — CV upload + profile form
│   │   │   ├── jobs/          — Job search + match display
│   │   │   ├── applications/  — Application tracker
│   │   │   ├── cv-builder/    — AI CV adaptation
│   │   │   ├── cover-letter/  — AI cover letter generator
│   │   │   ├── companies/     — AI company discovery
│   │   │   └── settings/      — Account settings
│   │   ├── admin/             — Admin dashboard (ADMIN role only)
│   │   └── api/               — All API routes
│   ├── lib/
│   │   ├── supabase/          — Supabase client (browser + server)
│   │   ├── prisma.ts          — Prisma singleton
│   │   ├── auth.ts            — requireAuth() helper
│   │   └── ai/                — Claude AI functions
│   └── types/                 — TypeScript types
```

---

## What's fully implemented

- [x] Auth (email + Google OAuth) via Supabase
- [x] Protected routes via middleware
- [x] CV upload (PDF, DOCX, TXT) + text extraction
- [x] AI CV analysis (Claude)
- [x] AI job matching with score + reasoning
- [x] AI cover letter generator (Swedish + English)
- [x] AI CV adaptation per job
- [x] AI company discovery with outreach messages
- [x] Arbetsförmedlingen/JobTech import plus Swedish kommun, region, employer, and LIA/praktik source catalogs
- [x] Local Swedish profession taxonomy with 650 professions across 26 industries
- [x] Personligt brev, LIA/praktik letter, and short application email generation
- [x] Job scanner (Greenhouse API)
- [x] Application tracker with status management
- [x] User profile management
- [x] Admin dashboard
- [x] All 15 pages
- [x] Complete Prisma schema (12 models)
- [x] Rate limiting via subscription table

## What needs more work

- [ ] Full Playwright scraping (use CLI tool in parent project for now)
- [ ] PDF export of generated CVs (requires Puppeteer/Playwright in API)
- [ ] pgvector semantic search (schema ready, needs embedding pipeline)
- [ ] Stripe payments
- [ ] Email notifications
- [ ] More ATS sources (Ashby, Lever APIs)
- [ ] Mobile sidebar / hamburger menu
- [ ] Supabase Storage file uploads (currently extracts text only)
