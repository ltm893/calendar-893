// backend/bin/config.example.ts
// ─────────────────────────────────────────────────────────────────────────────
// Copy this file to config.ts and fill in your values. config.ts is gitignored.
//
//   cp backend/bin/config.example.ts backend/bin/config.ts
//
// ─────────────────────────────────────────────────────────────────────────────

export const config = {
  // id is read from the sibling cognito-s3-stack-893/base/bin/config.ts.
  // Set id here only to keep an already-deployed stack name.

  // AWS region to deploy into. Omit to use the base config region.
  awsRegion: "us-east-1",

  // ── Auth ──────────────────────────────────────────────────────────────────
  // Cognito User Pool ID — from your cognito-s3-stack-893 base_outputs.json
  // or any existing pool.
  userPoolId: "us-east-1_XXXXXXXXX",

  // ── DynamoDB ──────────────────────────────────────────────────────────────
  // Omit calendarTable to use "{id}-calendar".
  // Do not set CalendarEvents. That is the live DLIV table.
  //
  // createTable defaults to true, which creates the table on first deploy.
  // After that deploy succeeds, set createTable: false.
};
