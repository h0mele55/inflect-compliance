# Inflect Compliance

End-to-end ISO/IEC 27001:2022 compliance management platform with SOC 2 and NIS2 mapping.

## Quick Start

### Prerequisites
- Node.js 18+
- Docker (for PostgreSQL)

### Setup

```bash
# 1. Start PostgreSQL
docker compose up -d

# 2. Install dependencies
npm install

# 3. Generate Prisma client & run migrations
npx prisma generate
npx prisma db push

# 4. Seed demo data
npx ts-node prisma/seed.ts

# 5. Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Demo Credentials
| Email | Password | Role |
|-------|----------|------|
| admin@acme.com | password123 | Owner |
| editor@acme.com | password123 | Editor |
| viewer@acme.com | password123 | Viewer |

## Features

### Core
- **Clause Tracker (4–10)** — Track progress through ISO 27001:2022 requirements
- **Asset Inventory** — Register and classify information assets (C/I/A ratings)
- **Risk Register** — Assess risks with likelihood×impact scoring + heatmap
- **Controls Library** — Annex A controls + custom controls, implementation tracking
- **Evidence Management** — Submit/Review/Approve workflow with audit trail
- **Policies** — Versioning, approval, and acknowledgement workflows
- **Internal Audits** — Auto-generated checklists, pass/fail testing
- **Findings** — Nonconformity/observation tracking with corrective action workflow

### V2
- **Framework Mapping** — SOC 2 and NIS2 readiness views
- **Reports** — Statement of Applicability, Risk Register (CSV export)
- **Audit Log** — Immutable activity trail
- **Notifications** — In-app notification system

## Tech Stack
Next.js 14 · TypeScript · Tailwind CSS · Prisma · PostgreSQL

## Legal
All ISO 27001, SOC 2, and NIS2 content in this application uses **original paraphrases**. No verbatim reproduction of ISO, AICPA, or EU regulatory text.
