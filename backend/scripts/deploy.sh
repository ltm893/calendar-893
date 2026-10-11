#!/bin/bash
# backend/scripts/deploy.sh
# Deploys the calendar-893 CDK stack and writes calendar_outputs.json at repo root.
#
# Idempotent — safe to run on every deploy:
#   - Cognito app client: checked by name, created only if missing
#   - API Gateway:        checked by name, imports real logical ID if found
#   - DynamoDB table:     imported by name, never created or deleted
#                         Set createTable: true only on the first deploy of a
#                         new table name, then set it back to false.
#                         Name the table with id. Do not use CalendarEvents.
#
# Usage:
#   cd backend && ./scripts/deploy.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${BACKEND_DIR}/.." && pwd)"
CONFIG_FILE="${BACKEND_DIR}/bin/config.ts"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║         calendar-893 — Backend Deploy        ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── Validate config.ts ────────────────────────────────────────────────────────
if [ ! -f "$CONFIG_FILE" ]; then
  echo "  ❌ backend/bin/config.ts not found."
  echo "     Run: cp backend/bin/config.example.ts backend/bin/config.ts"
  echo "     Then fill in your values and re-run."
  exit 1
fi

# ── Read config values ────────────────────────────────────────────────────────
CONFIG_ID=$(grep -E '^\s+id:' "$CONFIG_FILE" | head -1 | sed 's/.*"\(.*\)".*/\1/')
AWS_REGION=$(grep -E '^\s+awsRegion:' "$CONFIG_FILE" | head -1 | sed 's/.*"\(.*\)".*/\1/')
USER_POOL_ID=$(grep -E '^\s+userPoolId:' "$CONFIG_FILE" | head -1 | sed 's/.*"\(.*\)".*/\1/')
TABLE_NAME=$(grep -E '^\s+calendarTable:' "$CONFIG_FILE" | head -1 | sed 's/.*"\(.*\)".*/\1/')

if [ -z "$CONFIG_ID" ] || [ -z "$AWS_REGION" ] || [ -z "$USER_POOL_ID" ]; then
  echo "  ❌ Could not read required values from config.ts."
  exit 1
fi

STACK_NAME="CalendarStack-${CONFIG_ID}"
CLIENT_NAME="${CONFIG_ID}-calendar-client"
API_NAME="${CONFIG_ID}-calendar-api"

echo "  Stack:        $STACK_NAME"
echo "  Region:       $AWS_REGION"
echo "  ID prefix:    $CONFIG_ID"
echo "  User Pool:    $USER_POOL_ID"
echo "  DynamoDB:     $TABLE_NAME"
echo ""

# ── Check / create Cognito app client (idempotent) ────────────────────────────
echo "  Checking Cognito app client '$CLIENT_NAME'..."

EXISTING_CLIENT_ID=$(aws cognito-idp list-user-pool-clients \
  --user-pool-id "$USER_POOL_ID" \
  --region "$AWS_REGION" \
  --query "UserPoolClients[?ClientName=='${CLIENT_NAME}'].ClientId" \
  --output text 2>/dev/null || true)

if [ -n "$EXISTING_CLIENT_ID" ] && [ "$EXISTING_CLIENT_ID" != "None" ]; then
  echo "  ✅ App client exists: $EXISTING_CLIENT_ID"
  CALENDAR_CLIENT_ID="$EXISTING_CLIENT_ID"
else
  echo "  Creating app client '$CLIENT_NAME'..."
  CALENDAR_CLIENT_ID=$(aws cognito-idp create-user-pool-client \
    --user-pool-id "$USER_POOL_ID" \
    --client-name "$CLIENT_NAME" \
    --no-generate-secret \
    --explicit-auth-flows \
      ALLOW_USER_PASSWORD_AUTH \
      ALLOW_USER_SRP_AUTH \
      ALLOW_REFRESH_TOKEN_AUTH \
    --prevent-user-existence-errors ENABLED \
    --region "$AWS_REGION" \
    --query "UserPoolClient.ClientId" \
    --output text)
  echo "  ✅ App client created: $CALENDAR_CLIENT_ID"
fi

# ── Check API Gateway (idempotent) ────────────────────────────────────────────
echo ""
echo "  Checking API Gateway '$API_NAME'..."

EXISTING_API_ID=$(aws apigateway get-rest-apis \
  --region "$AWS_REGION" \
  --query "items[?name=='${API_NAME}'].id" \
  --output text 2>/dev/null || true)

CALENDAR_API_LOGICAL_ID=""

if [ -n "$EXISTING_API_ID" ] && [ "$EXISTING_API_ID" != "None" ]; then
  echo "  ✅ API Gateway exists: $EXISTING_API_ID"

  echo "  Fetching CloudFormation logical ID..."
  CALENDAR_API_LOGICAL_ID=$(aws cloudformation describe-stack-resources \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query "StackResources[?ResourceType=='AWS::ApiGateway::RestApi'].LogicalResourceId" \
    --output text 2>/dev/null || true)

  if [ -n "$CALENDAR_API_LOGICAL_ID" ] && [ "$CALENDAR_API_LOGICAL_ID" != "None" ]; then
    echo "  ✅ Logical ID: $CALENDAR_API_LOGICAL_ID"
  else
    echo "  ⚠️  Could not fetch logical ID — CDK will manage normally."
    CALENDAR_API_LOGICAL_ID=""
  fi
else
  echo "  ℹ️  API Gateway not found — CDK will create on first deploy."
  EXISTING_API_ID=""
fi

# ── Summary and confirm ───────────────────────────────────────────────────────
echo ""
echo "  Resources after this deploy:"
echo "    Cognito client:  $CALENDAR_CLIENT_ID (preserved)"
if [ -n "$EXISTING_API_ID" ]; then
  echo "    API Gateway:     $EXISTING_API_ID (preserved)"
else
  echo "    API Gateway:     will be created by CDK"
fi
echo "    DynamoDB:        $TABLE_NAME (imported only — never modified)"
echo ""
read -p "  Proceed? (y/n): " CONFIRM
if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then echo "  Cancelled."; exit 0; fi

# ── Install deps ──────────────────────────────────────────────────────────────
cd "$BACKEND_DIR"
[ ! -d "node_modules" ] && npm install

# ── Deploy CDK stack ──────────────────────────────────────────────────────────
echo ""
echo "  Deploying CDK stack..."

CALENDAR_CLIENT_ID="$CALENDAR_CLIENT_ID" \
CALENDAR_API_LOGICAL_ID="$CALENDAR_API_LOGICAL_ID" \
  npx cdk deploy "$STACK_NAME" --require-approval never

# ── Re-fetch API Gateway ID if CDK just created it ────────────────────────────
if [ -z "$EXISTING_API_ID" ]; then
  echo ""
  echo "  Resolving new API Gateway ID..."
  EXISTING_API_ID=$(aws apigateway get-rest-apis \
    --region "$AWS_REGION" \
    --query "items[?name=='${API_NAME}'].id" \
    --output text)
  echo "  ✅ API Gateway created: $EXISTING_API_ID"
fi

# ── Read CloudFormation outputs ───────────────────────────────────────────────
get_output() {
  aws cloudformation describe-stacks \
    --stack-name "$STACK_NAME" \
    --region "$AWS_REGION" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" \
    --output text
}

API_URL=$(get_output "CalendarApiUrl")
USER_POOL_ID_OUT=$(get_output "CalendarUserPoolId")
APP_CLIENT_ID=$(get_output "CalendarAppClientId")
TABLE_NAME_OUT=$(get_output "CalendarTableName")

# ── Write calendar_outputs.json ───────────────────────────────────────────────
cat > "${REPO_ROOT}/calendar_outputs.json" << OUTPUTS
{
  "version": "1",
  "aws_region": "${AWS_REGION}",
  "auth": {
    "user_pool_id":        "${USER_POOL_ID_OUT}",
    "user_pool_client_id": "${APP_CLIENT_ID}"
  },
  "api": {
    "base_url": "${API_URL}"
  },
  "tables": {
    "calendarEvents": "${TABLE_NAME_OUT}"
  }
}
OUTPUTS

echo ""
echo "  ✅ calendar_outputs.json written to repo root"
echo ""
echo "  ────────────────────────────────────────────────────"
echo "  API URL:        $API_URL"
echo "  API Gateway ID: $EXISTING_API_ID"
echo "  User Pool:      $USER_POOL_ID_OUT"
echo "  App Client:     $APP_CLIENT_ID"
echo "  DynamoDB:       $TABLE_NAME_OUT"
echo "  ────────────────────────────────────────────────────"
echo ""
echo "  Next: share calendar_outputs.json with dliv-web-893."
echo ""
