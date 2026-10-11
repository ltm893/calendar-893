// backend/bin/config.example.ts
// ─────────────────────────────────────────────────────────────────────────────
// Copy this file to config.ts and fill in your values. config.ts is gitignored.
//
//   cp backend/bin/config.example.ts backend/bin/config.ts
//
// ─────────────────────────────────────────────────────────────────────────────

export const config = {
  // Short prefix for all AWS resource names.
  // Lowercase letters, numbers, hyphens only.
  id: "your-id-here",

  // AWS region to deploy into.
  awsRegion: "us-east-1",

  // ── Auth ──────────────────────────────────────────────────────────────────
  // Cognito User Pool ID — from your cognito-s3-stack-893 base_outputs.json
  // or any existing pool.
  userPoolId: "us-east-1_XXXXXXXXX",

  // ── DynamoDB ──────────────────────────────────────────────────────────────
  // Table name for this deployment. Include id so a second stack does not
  // share another site's events. Do not use CalendarEvents — that is the live DLIV table.
  calendarTable: "your-id-here-calendar",

  // true only on the first deploy of a new table name. That deploy creates the table.
  // After it succeeds, set this to false. Later deploys import the table and do not recreate it.
  createTable: true,
};
