# OrderHubNow Development Guide

> Last updated: January 18, 2026

## Quick Start

```bash
# Terminal 1: Start the database tunnel
npm run db:tunnel

# Terminal 2: Start the dev server
npm run dev

# Open browser
http://localhost:3000
```

---

## Development Workflow

### Starting a Session

1. **Start the tunnel** (Terminal 1):
   ```bash
   npm run db:tunnel
   ```
   Wait for "✓ Tunnel is OPEN"

2. **Start the dev server** (Terminal 2):
   ```bash
   npm run dev
   ```

3. **Open browser**: http://localhost:3000

You're now running the app locally against the **production database**.

### Making Code Changes

For code-only changes (no DB schema changes):
1. Edit code
2. Save → hot reload
3. Test in browser

For schema changes (new tables/columns):
1. Edit `prisma/schema.prisma`
2. Run `npx prisma db push` (updates production DB immediately)
3. Edit code to use new fields
4. Test in browser

### Deploying

```bash
npm run deploy
```

This runs:
1. Git status check (prompts to commit if needed)
2. Type check
3. Lint
4. Hydration safety check
5. Build
6. Schema drift check (should pass if you ran `prisma db push`)
7. Push to GitHub
8. Deploy to EC2

### Ending a Session

- Press `Ctrl+C` in Terminal 1 to close the tunnel
- Press `Ctrl+C` in Terminal 2 to stop the dev server

---

## NPM Scripts Reference

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start development server |
| `npm run db:tunnel` | Open SSH tunnel to production DB |
| `npm run deploy` | Full deployment (commit → build → push → deploy) |
| `npm run build` | Build for production |
| `npm run type-check` | Run TypeScript type checking |
| `npm run lint` | Run ESLint |
| `npm run check-schema-drift` | Compare local schema vs production DB |
| `npm run apply-migration` | Apply a SQL migration to production |
| `npm run verify` | Run all checks (type-check, lint, hydration, build) |

---

## URLs

### Production Site

| Page | URL |
|------|-----|
| Home | https://www.orderhubnow.com |
| Admin Login | https://www.orderhubnow.com/admin/login |
| Admin Dashboard | https://www.orderhubnow.com/admin |
| Buyer ATS | https://www.orderhubnow.com/buyer/ats |
| Buyer Pre-Order | https://www.orderhubnow.com/buyer/pre-order |
| Rep Login | https://www.orderhubnow.com/rep/login |
| Rep Portal | https://www.orderhubnow.com/rep |

### Legacy Site (for comparison)

| Page | URL |
|------|-----|
| Home | http://inventory.limeapple.ca |
| USA ATS | http://inventory.limeapple.ca/USA/ATS |
| USA Pre-Order | http://inventory.limeapple.ca/USA/PreOrder |
| Admin | http://inventory.limeapple.ca/Login.aspx |

---

## Test Credentials

### Admin

| Username | Password |
|----------|----------|
| `LimeAdmin` | `Green2022###!` |

### Rep Accounts

| Email | Password | Name | RepId |
|-------|----------|------|-------|
| `info@landrshowroom.com` | `l3rsh00` | L&R Showroom | - |
| `betty@bettyjacobs.com` | `betty1` | Betty Jacobs | 2 |
| `delgallant@hotmail.com` | `gallant2` | Dell Gallant | 4 |
| `pssales@on.aibn.com` | `pam4` | Pam Story Sales Agency | 6 |
| `j_farese@sbcglobal.net` | `joanne5` | Joanne Farese | 7 |
| `kathyfed@yahoo.com` | `kathy6` | Kathy Fedoryshyn | 8 |
| `busybee@abitofhoney.com` | `honey10` | Honey Smith | 12 |
| `liz@lfshowroom.com` | `L1zF@r357` | Liz Farkas | 23 |
| `jeffswartz@telus.net` | `jSw@rtz159` | Jeff Swartz | 24 |

### Buyer

No login required - public access via `/buyer/ats` or `/buyer/pre-order`

---

## Infrastructure

### EC2 Server

| Detail | Value |
|--------|-------|
| IP Address | `3.131.126.250` |
| User | `ubuntu` |
| SSH Key | `~/.ssh/LANext.pem` |
| App Directory | `/var/www/orderhubnow` |
| Process Manager | PM2 (`orderhubnow`) |

**SSH Access:**
```bash
ssh -i ~/.ssh/LANext.pem ubuntu@3.131.126.250
```

### Database

| Detail | Value |
|--------|-------|
| Type | SQL Server |
| Host | `3.141.136.218` |
| Port | `1433` |
| Database | `Limeapple_Live_Nov2024` |
| User | `limeappleNext` |
| Access | EC2 IP whitelisted only |

**Local access:** Use the tunnel (`npm run db:tunnel`)

### GitHub

| Detail | Value |
|--------|-------|
| Repo | https://github.com/danielplant/orderhubnow |
| Branch | `main` |

### AWS S3

| Detail | Value |
|--------|-------|
| Bucket | `orderhub-uploads` |
| Region | `us-east-1` |
| URL Pattern | `https://orderhub-uploads.s3.us-east-1.amazonaws.com/uploads/...` |

**Structure:**
```
uploads/
├── collections/
│   └── collection-{id}.{ext}
└── categories/
    └── category-{id}.{ext}
```

### Nginx (on EC2)

Config: `/etc/nginx/sites-available/orderhubnow`

Important setting for file uploads:
```
client_max_body_size 10M;
```

Restart after changes: `sudo systemctl restart nginx`

---

## Manual EC2 Commands

If you need to manually deploy or debug on EC2:

```bash
# SSH in
ssh -i ~/.ssh/LANext.pem ubuntu@3.131.126.250

# Navigate to app
cd /var/www/orderhubnow

# Pull latest code
git fetch origin main && git reset --hard origin/main

# Install dependencies
npm ci

# Regenerate Prisma client
npx prisma generate

# Build
npm run build

# Restart
pm2 restart orderhubnow

# Check logs
pm2 logs orderhubnow --lines 50
```

---

## Schema Changes

### How It Works

1. Edit `prisma/schema.prisma`
2. Run `npx prisma db push` - this updates the production DB immediately
3. Prisma Client is regenerated with new types
4. Your code can now use the new fields

### Safety Notes

- **Adding** columns/tables is safe (existing code ignores them)
- **Removing/renaming** columns is risky (breaks existing code)
- For destructive changes: deploy new code first, then remove old columns

### Checking for Drift

```bash
npm run check-schema-drift
```

This compares your local `schema.prisma` to the production DB and shows any differences.

---

## Testing Flows

### Buyer ATS Flow
1. `/buyer/ats` → Select collection
2. Browse categories → Add items to cart
3. `/buyer/my-order` → Fill form → Submit

### Buyer Pre-Order Flow
1. `/buyer/pre-order` → Select collection
2. Same as ATS flow

### Admin Flow
1. `/admin/login` → Login as LimeAdmin
2. Dashboard → Orders, Products, Customers, Reports

### Rep Flow
1. `/rep/login` → Login as rep
2. View assigned orders, create new orders

---

## Troubleshooting

### Tunnel won't connect
- Check if SSH key exists: `ls ~/.ssh/LANext.pem`
- Check if port 1433 is already in use: `lsof -i :1433`
- Kill existing tunnel: `pkill -f 'ssh.*1433.*3.141'`

### App can't connect to DB
- Make sure tunnel is running (Terminal 1)
- Check `.env` has correct `DATABASE_URL`
- Restart the dev server after starting tunnel

### Schema mismatch errors
- Run `npx prisma db push` to sync schema
- Run `npx prisma generate` to regenerate client

### Deploy fails at schema drift check
- You probably forgot to run `prisma db push`
- Or run `npm run check-schema-drift` to see what's different
