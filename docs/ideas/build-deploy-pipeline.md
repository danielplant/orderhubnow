# Build & Deploy Pipeline Improvements

## Status: 🔵 Idea (Post-Show)

## Current State
- **CI workflow**: Type-check, lint, build validation on every push (~1m 32s)
- **Deploy**: Manual SSH to EC2, run `git pull && npm run build`
- **Blocker**: EC2 security group blocks SSH from GitHub Actions IPs

## EC2 Server Details
- **IP:** 3.131.126.250
- **User:** ubuntu
- **SSH Key:** LANext.pem (Bilal manages)
- **CPU cores:** 2
- **RAM:** 2GB
- **Swap:** 2GB (configured)
- **PM2 process:** `orderhubnow`
- **Path:** `/var/www/orderhubnow`

## Manual Deploy Commands
```bash
cd /var/www/orderhubnow
git pull origin main
npm ci
npx prisma generate
npm run build
pm2 restart orderhubnow
```

---

## Improvement Options

### Option A: Open Security Group (Quick)
Ask Bilal to open port 22 to `0.0.0.0/0` in EC2 security group.
- **Pros:** Simple, enables existing ssh-action workflow
- **Cons:** Less secure (SSH open to internet)

### Option B: Self-Hosted GitHub Actions Runner (Recommended)
Install GitHub Actions runner on EC2 itself.
- **Pros:** Secure (no external SSH needed), faster (no network transfer)
- **Cons:** More setup, runner maintenance

**Setup steps:**
```bash
# On EC2
mkdir actions-runner && cd actions-runner
curl -o actions-runner-linux-x64-2.311.0.tar.gz -L https://github.com/actions/runner/releases/download/v2.311.0/actions-runner-linux-x64-2.311.0.tar.gz
tar xzf ./actions-runner-linux-x64-2.311.0.tar.gz

# Get token from: GitHub repo > Settings > Actions > Runners > New self-hosted runner
./config.sh --url https://github.com/danielplant/orderhubnow --token YOUR_TOKEN

# Run as service
sudo ./svc.sh install
sudo ./svc.sh start
```

Then update workflow:
```yaml
runs-on: self-hosted  # instead of ubuntu-latest
```

### Option C: Upgrade EC2 Instance
Current 2-core, 2GB instance is the build speed bottleneck.
- **t3.medium** (2 vCPU, 4GB RAM) - ~$30/month
- **t3.large** (2 vCPU, 8GB RAM) - ~$60/month

---

## Outstanding Questions for Bilal

1. **Instance type:** What EC2 instance type is currently running?
   - Metadata service returned empty: `curl -s http://169.254.169.254/latest/meta-data/instance-type`

2. **Security group:** What IPs are allowed inbound on port 22?
   - Check: AWS Console → EC2 → Instance → Security tab → Inbound rules

3. **Preference:** Open security group vs self-hosted runner vs keep manual deploys?

---

## Middleware → Proxy Migration

Separate but related - Next.js 16 deprecated `middleware.ts`:

```
⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.
```

**Fix:**
```bash
npx @next/codemod@canary middleware-to-proxy .
```

This renames `src/middleware.ts` → `src/proxy.ts` and updates exports.

**When:** Post-show, low priority (warning only, doesn't affect functionality)
