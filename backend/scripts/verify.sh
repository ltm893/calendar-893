#!/bin/bash
# backend/scripts/verify.sh
# Verifies the deployed calendar-893 stack by testing every API endpoint.
#
# Usage:
#   ./scripts/verify.sh --email your@email.com --password yourpassword

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
OUTPUTS_FILE="${REPO_ROOT}/calendar_outputs.json"

EMAIL=""
PASSWORD=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --email)    EMAIL="$2";    shift 2 ;;
    --password) PASSWORD="$2"; shift 2 ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

if [ -z "$EMAIL" ] || [ -z "$PASSWORD" ]; then
  echo "Usage: ./scripts/verify.sh --email your@email.com --password yourpassword"
  exit 1
fi

if [ ! -f "$OUTPUTS_FILE" ]; then
  echo "  ❌ calendar_outputs.json not found. Run deploy.sh first."
  exit 1
fi

API_URL=$(grep -E '"base_url"' "$OUTPUTS_FILE" | sed 's/.*"\(.*\)".*/\1/')
CLIENT_ID=$(grep -E '"user_pool_client_id"' "$OUTPUTS_FILE" | sed 's/.*"\(.*\)".*/\1/')
REGION=$(grep -E '"aws_region"' "$OUTPUTS_FILE" | head -1 | sed 's/.*"\(.*\)".*/\1/')

PASS=0; FAIL=0

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║        calendar-893 — Verify Deployment      ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "  API URL:    $API_URL"
echo "  Client ID:  $CLIENT_ID"
echo "  Region:     $REGION"
echo ""

pass() { echo "  ✅ $1"; PASS=$((PASS + 1)); }
fail() { echo "  ❌ $1"; FAIL=$((FAIL + 1)); }
check() { [ "$3" = "$2" ] && pass "$1 (HTTP $3)" || fail "$1 (expected HTTP $2, got HTTP $3)"; }

# ── Auth ──────────────────────────────────────────────────────────────────────
echo "  ── Auth ─────────────────────────────────────────"
COGNITO_URL="https://cognito-idp.${REGION}.amazonaws.com/"
AUTH_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$COGNITO_URL" \
  -H "Content-Type: application/x-amz-json-1.1" \
  -H "X-Amz-Target: AWSCognitoIdentityProviderService.InitiateAuth" \
  -d "{\"AuthFlow\":\"USER_PASSWORD_AUTH\",\"AuthParameters\":{\"USERNAME\":\"${EMAIL}\",\"PASSWORD\":\"${PASSWORD}\"},\"ClientId\":\"${CLIENT_ID}\"}")

HTTP_CODE=$(echo "$AUTH_RESPONSE" | tail -1)
AUTH_BODY=$(echo "$AUTH_RESPONSE" | head -1)

if [ "$HTTP_CODE" = "200" ]; then
  pass "Sign in (HTTP 200)"
  ID_TOKEN=$(echo "$AUTH_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin)['AuthenticationResult']['IdToken'])" 2>/dev/null)
  [ -n "$ID_TOKEN" ] && pass "ID token received" || fail "ID token missing"
else
  fail "Sign in (HTTP $HTTP_CODE)"
  ID_TOKEN=""
fi

# ── Endpoints ─────────────────────────────────────────────────────────────────
echo ""
echo "  ── Authenticated endpoints ──────────────────────"

if [ -z "$ID_TOKEN" ]; then
  echo "  ⚠️  Skipping — no token available"
else
  # GET /calendar
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: ${ID_TOKEN}" "${API_URL}calendar")
  check "GET /calendar" "200" "$STATUS"

  # POST /calendar — create test event
  NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  LATER=$(date -u -v+1H +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d "+1 hour" +"%Y-%m-%dT%H:%M:%SZ")
  CREATE_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -H "Authorization: ${ID_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"title\":\"verify-test\",\"startTime\":\"${NOW}\",\"endTime\":\"${LATER}\"}" \
    "${API_URL}calendar")
  CREATE_STATUS=$(echo "$CREATE_RESPONSE" | tail -1)
  CREATE_BODY=$(echo "$CREATE_RESPONSE" | head -1)
  check "POST /calendar (create event)" "201" "$CREATE_STATUS"

  if [ "$CREATE_STATUS" = "201" ]; then
    EVENT_ID=$(echo "$CREATE_BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('eventId',''))" 2>/dev/null)

    if [ -n "$EVENT_ID" ]; then
      # PUT /calendar/{id} — update test event
      PUT_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
        -H "Authorization: ${ID_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "{\"title\":\"verify-test-updated\"}" \
        "${API_URL}calendar/${EVENT_ID}")
      check "PUT /calendar/${EVENT_ID} (update event)" "200" "$PUT_STATUS"

      # DELETE /calendar/{id} — cleanup
      DELETE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
        -H "Authorization: ${ID_TOKEN}" "${API_URL}calendar/${EVENT_ID}")
      check "DELETE /calendar/${EVENT_ID} (cleanup)" "200" "$DELETE_STATUS"
    fi
  fi
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "  ────────────────────────────────────────────────────"
TOTAL=$((PASS + FAIL))
echo "  Results: ${PASS}/${TOTAL} passed"
if [ "$FAIL" -eq 0 ]; then
  echo "  ✅ All checks passed — calendar-893 is working correctly"
else
  echo "  ❌ ${FAIL} check(s) failed — review output above"
fi
echo "  ────────────────────────────────────────────────────"
echo ""
