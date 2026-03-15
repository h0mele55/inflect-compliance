# Deployment Guide

## Quick Start (Local Production)

```bash
# 1. Copy env template
cp .env.production.example .env.production

# 2. Edit .env.production — set ALL secrets:
#    openssl rand -base64 32    (for AUTH_SECRET, JWT_SECRET)
#    Set OAuth credentials, POSTGRES_PASSWORD, NEXTAUTH_URL

# 3. Start
npm run prod:up
# or: docker compose -f docker-compose.prod.yml up -d --build

# 4. Verify
npm run smoke:staging   # works against localhost:3000
curl http://localhost:3000/api/health | jq .
```

## Architecture

```
┌───────────────────────────────────────────────┐
│ docker-compose.prod.yml                       │
│                                               │
│  ┌──────────┐ internal    ┌────────────────┐  │
│  │ db       │◄────────────│ app            │  │
│  │ pg:16    │  network    │ :3000          │  │
│  │ (no port │             │                │  │
│  │  exposed)│             │ entrypoint:    │  │
│  └────┬─────┘             │  1. migrate    │  │
│       │                   │  2. next start │  │
│  [pgdata]                 └──────┬─────────┘  │
│                           [uploads:/data]     │
└───────────────────────────────────────────────┘
```

## Required Environment Variables

| Variable | Required | Notes |
|----------|----------|-------|
| `POSTGRES_PASSWORD` | ✅ | Docker Compose DB password |
| `AUTH_SECRET` | ✅ | ≥16 chars, `openssl rand -base64 32` |
| `JWT_SECRET` | ✅ | ≥16 chars, `openssl rand -base64 32` |
| `NEXTAUTH_URL` | ✅ | Canonical URL (e.g. `https://app.example.com`) |
| `AUTH_URL` | ✅ | Same as NEXTAUTH_URL |
| `GOOGLE_CLIENT_ID` | ✅ | OAuth provider |
| `GOOGLE_CLIENT_SECRET` | ✅ | OAuth provider |
| `MICROSOFT_CLIENT_ID` | ✅ | OAuth provider |
| `MICROSOFT_CLIENT_SECRET` | ✅ | OAuth provider |
| `UPLOAD_DIR` | ✅ | Set to `/data/uploads` (Docker) |
| `CORS_ALLOWED_ORIGINS` | Optional | Comma-separated origins |

## Docker Compose (Self-hosted / VPS)

### Start

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### Commands

| Action | Command |
|--------|---------|
| Start | `npm run prod:up` |
| Stop | `npm run prod:down` |
| Logs | `docker compose -f docker-compose.prod.yml logs -f app` |
| DB logs | `docker compose -f docker-compose.prod.yml logs -f db` |
| Rebuild | `docker compose -f docker-compose.prod.yml up -d --build --force-recreate` |
| Shell | `docker compose -f docker-compose.prod.yml exec app sh` |
| Reset data | `docker compose -f docker-compose.prod.yml down -v` |
| Smoke check | `npm run smoke:staging` |

### How it works

1. **DB starts** → Postgres 16 on internal network (no port exposed externally)
2. **App starts** → `entrypoint.sh` runs `prisma migrate deploy` then `next start`
3. **Volumes** → `inflect-prod-pgdata` (DB) + `inflect-prod-uploads` (files) persist across restarts
4. **Health** → Docker checks `/api/health` every 15s

---

## Railway

### Setup

```bash
# 1. Create project on railway.app, connect your GitHub repo
# 2. Railway auto-detects the Dockerfile

# 3. Add a PostgreSQL plugin:
#    Railway dashboard → New → Database → PostgreSQL
#    This provides DATABASE_URL automatically

# 4. Add environment variables in Railway dashboard:
#    AUTH_SECRET, JWT_SECRET, NEXTAUTH_URL, AUTH_URL,
#    GOOGLE_CLIENT_ID/SECRET, MICROSOFT_CLIENT_ID/SECRET,
#    UPLOAD_DIR=/data/uploads, FILE_STORAGE_ROOT=/data/uploads

# 5. Add a persistent volume:
#    Settings → Volumes → Mount path: /data/uploads
```

### Key points

- Railway provides `DATABASE_URL` via the PostgreSQL plugin — **don't set it manually**
- Set `NEXTAUTH_URL` to your Railway-generated domain (or custom domain)
- Volume mount at `/data/uploads` persists uploaded files across deploys
- The Dockerfile entrypoint automatically runs `prisma migrate deploy` on each deploy

### Railway-specific env vars

```
PORT=3000                    # Railway sets this automatically
DATABASE_URL=                # Provided by PostgreSQL plugin
NEXTAUTH_URL=https://your-app.up.railway.app
AUTH_URL=https://your-app.up.railway.app
AUTH_SECRET=<generated>
JWT_SECRET=<generated>
UPLOAD_DIR=/data/uploads
FILE_STORAGE_ROOT=/data/uploads
```

---

## Fly.io

### Setup

```bash
# 1. Install flyctl
curl -L https://fly.io/install.sh | sh

# 2. Launch (uses existing Dockerfile)
fly launch --no-deploy

# 3. Create Postgres cluster
fly postgres create --name inflect-db
fly postgres attach inflect-db

# 4. Create volume for uploads
fly volumes create uploads --size 1 --region your-region

# 5. Set secrets (never in fly.toml)
fly secrets set \
  AUTH_SECRET=$(openssl rand -base64 32) \
  JWT_SECRET=$(openssl rand -base64 32) \
  NEXTAUTH_URL=https://your-app.fly.dev \
  AUTH_URL=https://your-app.fly.dev \
  GOOGLE_CLIENT_ID=xxx \
  GOOGLE_CLIENT_SECRET=xxx \
  MICROSOFT_CLIENT_ID=xxx \
  MICROSOFT_CLIENT_SECRET=xxx \
  UPLOAD_DIR=/data/uploads \
  FILE_STORAGE_ROOT=/data/uploads

# 6. Deploy
fly deploy
```

### fly.toml additions

```toml
[mounts]
  source = "uploads"
  destination = "/data/uploads"

[http_service]
  internal_port = 3000
  force_https = true

[[http_service.checks]]
  grace_period = "30s"
  interval = "15s"
  method = "GET"
  path = "/api/health"
  timeout = "5s"
```

### Key points

- `fly postgres attach` sets `DATABASE_URL` automatically
- Volume mount persists uploads across deploys and restarts
- Secrets set via `fly secrets set` — never committed
- Health check uses `/api/health` (DB connectivity check)

---

## ⚠️ Hosting Considerations

| Provider | File Storage | Recommended |
|----------|-------------|-------------|
| **VPS + Docker Compose** | ✅ Volumes | ✅ Best for this app |
| **Railway** | ✅ Persistent volumes | ✅ Great |
| **Fly.io** | ✅ Mounted volumes | ✅ Great |
| **Vercel** | ❌ Ephemeral filesystem | ❌ Not suitable |
| **Netlify** | ❌ No server | ❌ Not suitable |

This app uses **local file storage** for evidence uploads. Platforms without persistent filesystems (Vercel, Netlify) require migrating to S3/R2 first — that's a separate effort.

---

## Migrations

- Applied via `prisma migrate deploy` (idempotent, safe to re-run)
- **Docker**: Automatic on every container start via `entrypoint.sh`
- **Manual**: `npm run migrate:deploy`
- **Never** use `db push` in production

## Backup & Restore

### Database

```bash
# Backup
docker compose -f docker-compose.prod.yml exec db \
  pg_dump -U inflect inflect_production > backup_$(date +%Y%m%d).sql

# Restore
docker compose -f docker-compose.prod.yml exec -i db \
  psql -U inflect inflect_production < backup_20240314.sql
```

### Uploads

```bash
# Backup
docker compose -f docker-compose.prod.yml exec app \
  tar czf /tmp/uploads.tar.gz -C /data/uploads .
docker compose -f docker-compose.prod.yml cp app:/tmp/uploads.tar.gz ./uploads_backup.tar.gz

# Restore
docker compose -f docker-compose.prod.yml cp ./uploads_backup.tar.gz app:/tmp/uploads.tar.gz
docker compose -f docker-compose.prod.yml exec app \
  tar xzf /tmp/uploads.tar.gz -C /data/uploads
```

## Security Checklist

- [x] Secrets via env vars only (never in code/config)
- [x] DB not exposed externally (internal Docker network)
- [x] Non-root container user (`nextjs:nodejs`)
- [x] Auth cookies: `httpOnly`, `secure`, `sameSite: lax`
- [x] HSTS + CSP + X-Frame-Options headers
- [x] Rate limiting on auth endpoints
- [x] Test credentials disabled in production
- [x] File upload: mime/size validation + path traversal protection
