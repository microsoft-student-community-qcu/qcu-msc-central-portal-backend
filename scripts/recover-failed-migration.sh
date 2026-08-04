#!/usr/bin/env bash
#
# One-time recovery for the failed `20260729000548_rename_membershipRole_to_office`
# migration (MySQL 1265 / Prisma P3018 on the first failure, P3009 afterwards).
#
# Prisma records the failed attempt in `_prisma_migrations`, and `migrate deploy`
# then refuses to apply ANY migration until that row is cleared — so the deploy
# workflow keeps failing at the same point even with the fix committed. This
# script clears the row so the next deploy can run
# 20260729000000_normalize_membership_role followed by the retried rename.
#
# Usage:
#   ./scripts/recover-failed-migration.sh release
#   ./scripts/recover-failed-migration.sh prod
#
# Requires: az (logged in, with MySQL + Key Vault access), mysql client, npx.

set -euo pipefail

MIGRATION="20260729000548_rename_membershipRole_to_office"
RESOURCE_GROUP="MSC-QCU"

ENV_NAME="${1:-}"
case "$ENV_NAME" in
  dev)     KV_NAME="kv-msc-qcu-dev" ;;
  release) KV_NAME="kv-msc-qcu-release" ;;
  prod)    KV_NAME="kv-msc-qcu-prod" ;;
  *)       echo "Usage: $0 <dev|release|prod>" >&2; exit 2 ;;
esac

echo "Fetching DATABASE_URL from Key Vault: $KV_NAME..."
DATABASE_URL=$(az keyvault secret show --vault-name "$KV_NAME" --name database-url --query value -o tsv)
export DATABASE_URL

SERVER_NAME=$(echo "$DATABASE_URL" | sed -e 's|.*@||' -e 's|\..*||')
RUNNER_IP=$(curl -s https://api.ipify.org)
RULE_NAME="temp-recover-$$"

echo "Adding temporary firewall rule on $SERVER_NAME for $RUNNER_IP ($RULE_NAME)..."
az mysql flexible-server firewall-rule create \
  --resource-group "$RESOURCE_GROUP" \
  --name "$SERVER_NAME" \
  --rule-name "$RULE_NAME" \
  --start-ip-address "$RUNNER_IP" \
  --end-ip-address "$RUNNER_IP" \
  -o none

trap 'echo "Cleaning up firewall rule..."; az mysql flexible-server firewall-rule delete --resource-group "$RESOURCE_GROUP" --name "$SERVER_NAME" --rule-name "$RULE_NAME" --yes -o none || true' EXIT

# MySQL DDL is not transactional, so confirm which side of the rename the table
# is on before choosing how to resolve. A failed single-statement ALTER leaves
# the old column in place, but verify rather than assume.
DB_HOST=$(echo "$DATABASE_URL" | sed -e 's|.*@||' -e 's|[:/].*||')
DB_USER=$(echo "$DATABASE_URL" | sed -e 's|^mysql://||' -e 's|:.*||')
DB_PASS=$(echo "$DATABASE_URL" | sed -e 's|^mysql://[^:]*:||' -e 's|@.*||')
DB_NAME=$(echo "$DATABASE_URL" | sed -e 's|.*/||' -e 's|?.*||')

COLUMN=$(mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASS" -N -B -e \
  "SELECT COLUMN_NAME FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = '$DB_NAME' AND TABLE_NAME = 'Applicant'
     AND COLUMN_NAME IN ('membershipRole', 'office')")

echo "Applicant column found: ${COLUMN:-<none>}"

case "$COLUMN" in
  membershipRole)
    echo "Rename did not apply — marking migration as rolled back so it retries."
    npx prisma migrate resolve --rolled-back "$MIGRATION"
    ;;
  office)
    echo "Rename already applied — marking migration as applied."
    npx prisma migrate resolve --applied "$MIGRATION"
    ;;
  *)
    echo "Unexpected column state. Resolve manually before deploying." >&2
    exit 1
    ;;
esac

echo "Done. Re-run the Deploy Backend workflow, or run: npx prisma migrate deploy"
