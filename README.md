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
# edit bin/config.ts: id, awsRegion, userPoolId, calendarTable
# createTable: true only on the first deploy of a new table name, then false

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
- `calendarTable` in the example is `your-id-here-calendar`. Use a name that includes your `id`. Do not use `CalendarEvents`. That is the live DLIV table, and a second stack with that name reads and writes DLIV events.
- Set `createTable: true` only on the first deploy of a new table name. That deploy creates the table.
- After that deploy succeeds, set `createTable: false`. Later deploys import the table and leave it in place.

## Security

- Do not commit `backend/bin/config.ts`
- Do not commit `calendar_outputs.json`
- Keep real pool IDs and environment-specific values in local config/env, not source

