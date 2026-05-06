#!/usr/bin/env node
// backend/bin/app.ts
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { CalendarStack } from "../lib/calendar-stack";
import { config } from "./config";

const app = new cdk.App();

const stackName = `CalendarStack-${config.id}`;

// Pre-resolved by deploy.sh idempotency checks.
// When set, CDK updates in place — never recreates.
const calendarClientId     = process.env.CALENDAR_CLIENT_ID      || undefined;
const calendarApiLogicalId = process.env.CALENDAR_API_LOGICAL_ID || undefined;

new CalendarStack(app, stackName, {
  config,
  calendarClientId,
  calendarApiLogicalId,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region:  config.awsRegion,
  },
});
