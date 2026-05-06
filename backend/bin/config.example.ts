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
  // Existing DynamoDB table name — imported by CDK, never created or deleted.
  // Deploy cognito-s3-stack-893 first, then create this table manually or
  // let calendar-893 create it on first deploy by setting createTable: true.
  calendarTable: "CalendarEvents",

  // Set to true on first deploy if the table doesn't exist yet.
  // Set back to false after first deploy — table will be imported from then on.
  createTable: false,
};
