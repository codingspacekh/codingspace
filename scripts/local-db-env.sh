#!/usr/bin/env bash
# Prints the local Supabase settings the app, import script and tests need, as KEY=value lines.
#   CI:    scripts/local-db-env.sh >> "$GITHUB_ENV"
#   Local: set -a; eval "$(scripts/local-db-env.sh)"; set +a
set -euo pipefail
eval "$(npx --no-install supabase status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
echo "NEXT_PUBLIC_SUPABASE_URL=$API_URL"
echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY"
echo "SUPABASE_SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY"
echo "API_URL=$API_URL"
echo "ANON_KEY=$ANON_KEY"
echo "SERVICE_ROLE_KEY=$SERVICE_ROLE_KEY"
