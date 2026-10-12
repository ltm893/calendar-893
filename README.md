# calendar-893

CDK add-on backend for calendar CRUD on top of an existing Cognito User Pool.

This repo deploys an authenticated API (`/calendar`) backed by a DynamoDB table.
It is designed to work with `dliv-web` and other clients that read `calendar_outputs.json`.

## What this deploys

- API Gateway REST API (`{id}-calendar-api`)
- Lambda function (`calendarEvents`)
- Cognito app client on an existing User Pool (`{id}-calendar-client`)
- DynamoDB table import (or create on first deploy if configured)

## Prerequisites

- AWS CLI configured (`aws sts get-caller-identity`)
- Node.js 18+ (20 recommended)
- AWS CDK bootstrapped in target account/region
- Existing Cognito User Pool ID

## Quick start

```bash
cd backend
cp bin/config.example.ts bin/config.ts
# edit bin/config.ts: userPoolId
# id comes from the sibling cognito-s3-stack-893/base/bin/config.ts
# calendarTable defaults to {id}-calendar
# createTable defaults to true; set it false after the first deploy

npm install
./scripts/deploy.sh
```

`deploy.sh` writes `calendar_outputs.json` at the repository root.

## Verify

From `backend/`:

```bash
./scripts/verify.sh --public-only
# or full verify if your script version supports auth checks:
./scripts/verify.sh --email you@example.com --password 'your-password'
```

## Config notes

- `backend/bin/config.ts` is local-only (gitignored).
- Use `config.example.ts` as the committed template.
- `id` comes from the sibling `cognito-s3-stack-893/base/bin/config.ts` when this config omits it. An `id` already set in this config is kept, so an existing stack name does not change.
- `calendarTable` defaults to `{id}-calendar`. Do not use `CalendarEvents`. That is the live DLIV table, and a second stack with that name reads and writes DLIV events.
- `createTable` defaults to `true`. That first deploy creates the table. After it succeeds, set `createTable: false`. Later deploys import the table and leave it in place.

## Security

- Do not commit `backend/bin/config.ts`
- Do not commit `calendar_outputs.json`
- Keep real pool IDs and environment-specific values in local config/env, not source

