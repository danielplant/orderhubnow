#!/bin/bash
# Creates an SSH tunnel to the production database through EC2
# This allows your laptop to connect to the DB as if it were localhost
#
# Usage: npm run db:tunnel
# Then in another terminal: npm run dev
#
# Keep this terminal open while developing. Ctrl+C to close the tunnel.

set -e

EC2_HOST="ubuntu@3.131.126.250"
EC2_KEY="$HOME/.ssh/LANext.pem"
DB_HOST="3.141.136.218"
DB_PORT="1433"
LOCAL_PORT="1433"

# Check if SSH key exists
if [ ! -f "$EC2_KEY" ]; then
    echo "ERROR: SSH key not found at $EC2_KEY"
    exit 1
fi

# Check if port is already in use
if lsof -iTCP:$LOCAL_PORT -sTCP:LISTEN > /dev/null 2>&1; then
    echo "ERROR: Port $LOCAL_PORT is already in use."
    echo "Either another tunnel is running, or you have a local SQL Server."
    echo ""
    echo "To find what's using it: lsof -i :$LOCAL_PORT"
    echo "To kill an existing tunnel: pkill -f 'ssh.*$LOCAL_PORT.*$DB_HOST'"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  DATABASE TUNNEL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Connecting..."
echo ""
echo "  Local:  localhost:${LOCAL_PORT}"
echo "  Via:    ${EC2_HOST}"
echo "  To:     ${DB_HOST}:${DB_PORT}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  ✓ Tunnel is OPEN"
echo ""
echo "  Your app can now connect to the production DB"
echo "  using DATABASE_URL with localhost:${LOCAL_PORT}"
echo ""
echo "  Keep this terminal open while developing."
echo "  Press Ctrl+C to close the tunnel."
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# -N = don't execute remote command (just tunnel)
# -L = local port forwarding
# -o ServerAliveInterval=60 = send keepalive every 60s to prevent timeout
# -o ServerAliveCountMax=3 = disconnect after 3 missed keepalives
# -o ExitOnForwardFailure=yes = exit if tunnel can't be established
ssh -i "$EC2_KEY" \
    -N \
    -o ServerAliveInterval=60 \
    -o ServerAliveCountMax=3 \
    -o ExitOnForwardFailure=yes \
    -L ${LOCAL_PORT}:${DB_HOST}:${DB_PORT} \
    ${EC2_HOST}
