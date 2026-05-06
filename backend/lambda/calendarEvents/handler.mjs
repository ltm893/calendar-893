'use strict';
console.log('Loading calendarEvents function');

import {
  DynamoDBClient,
  PutItemCommand,
  DeleteItemCommand,
  QueryCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { randomUUID } from "crypto";

const TABLE_NAME = process.env.CALENDAR_TABLE;
const client = new DynamoDBClient({});

export const handler = async (event) => {
  console.log("request:", JSON.stringify(event));
  const method      = event.httpMethod;
  const pathParams  = event.pathParameters;
  const eventId     = pathParams?.id;
  const callerId    = event.requestContext?.authorizer?.claims?.sub;
  const callerEmail = event.requestContext?.authorizer?.claims?.email ?? "unknown";

  try {
    // GET /calendar?from=YYYY-MM-DD&to=YYYY-MM-DD
    if (method === "GET" && !eventId) {
      const qs   = event.queryStringParameters ?? {};
      const from = qs.from ?? todayString();
      const to   = qs.to   ?? monthEndString();
      return respond(200, await listEvents(from, to));
    }

    // POST /calendar — create event
    if (method === "POST") {
      const body = parseBody(event.body);
      const { title, description, startTime, endTime } = body;
      if (!title || !startTime || !endTime)
        return respond(400, { error: "title, startTime and endTime are required" });
      return respond(201, await createEvent({ callerId, callerEmail, title, description, startTime, endTime }));
    }

    // PUT /calendar/{id} — update event
    if (method === "PUT" && eventId) {
      const updated = await updateEvent({ eventId, callerEmail, body: parseBody(event.body) });
      if (!updated) return respond(404, { error: "Event not found" });
      return respond(200, updated);
    }

    // DELETE /calendar/{id} — delete event
    if (method === "DELETE" && eventId) {
      const deleted = await deleteEvent({ eventId, callerEmail });
      if (!deleted) return respond(404, { error: "Event not found" });
      return respond(200, { deleted: eventId });
    }

    return respond(400, { error: "Unknown route" });
  } catch (err) {
    console.error(err);
    return respond(500, { error: err.message });
  }
};

async function listEvents(from, to) {
  const res = await client.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: "gsi-startTime",
    KeyConditionExpression: "GSI_PK = :all AND startTime BETWEEN :from AND :to",
    ExpressionAttributeValues: marshall({
      ":all": "ALL", ":from": from, ":to": to + "T23:59:59Z",
    }),
    ScanIndexForward: true,
  }));
  return (res.Items ?? []).map(unmarshall);
}

async function createEvent({ callerId, callerEmail, title, description, startTime, endTime }) {
  const eventId = randomUUID();
  const now     = new Date().toISOString();
  const sortKey = `${startTime.slice(0, 10)}#${eventId}`;
  const item = {
    userId: callerId, sortKey, eventId, GSI_PK: "ALL",
    title, description: description ?? "", startTime, endTime,
    createdBy: callerEmail, createdAt: now, updatedBy: callerEmail, updatedAt: now,
  };
  await client.send(new PutItemCommand({ TableName: TABLE_NAME, Item: marshall(item) }));
  console.log(`CREATE eventId=${eventId} by=${callerEmail}`);
  return item;
}

async function updateEvent({ eventId, callerEmail, body }) {
  const existing = await findEventById(eventId);
  if (!existing) return null;
  const { title, description, startTime, endTime } = body;
  const now        = new Date().toISOString();
  const newSortKey = startTime ? `${startTime.slice(0, 10)}#${eventId}` : existing.sortKey;

  if (newSortKey !== existing.sortKey) {
    await client.send(new DeleteItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({ userId: existing.userId, sortKey: existing.sortKey }),
    }));
    const updated = {
      ...existing,
      title:       title       ?? existing.title,
      description: description ?? existing.description,
      startTime:   startTime   ?? existing.startTime,
      endTime:     endTime     ?? existing.endTime,
      sortKey:     newSortKey,
      updatedBy:   callerEmail,
      updatedAt:   now,
    };
    await client.send(new PutItemCommand({ TableName: TABLE_NAME, Item: marshall(updated) }));
    console.log(`UPDATE eventId=${eventId} by=${callerEmail} (date changed)`);
    return updated;
  }

  const res = await client.send(new UpdateItemCommand({
    TableName: TABLE_NAME,
    Key: marshall({ userId: existing.userId, sortKey: existing.sortKey }),
    UpdateExpression:
      "SET #t = :title, description = :desc, startTime = :st, endTime = :et, updatedBy = :by, updatedAt = :now",
    ExpressionAttributeNames: { "#t": "title" },
    ExpressionAttributeValues: marshall({
      ":title": title       ?? existing.title,
      ":desc":  description ?? existing.description,
      ":st":    startTime   ?? existing.startTime,
      ":et":    endTime     ?? existing.endTime,
      ":by":    callerEmail,
      ":now":   now,
    }),
    ReturnValues: "ALL_NEW",
  }));
  console.log(`UPDATE eventId=${eventId} by=${callerEmail}`);
  return unmarshall(res.Attributes);
}

async function deleteEvent({ eventId, callerEmail }) {
  const existing = await findEventById(eventId);
  if (!existing) return null;
  await client.send(new DeleteItemCommand({
    TableName: TABLE_NAME,
    Key: marshall({ userId: existing.userId, sortKey: existing.sortKey }),
  }));
  console.log(`DELETE eventId=${eventId} deletedBy=${callerEmail}`);
  return true;
}

async function findEventById(eventId) {
  const res = await client.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: "gsi-startTime",
    KeyConditionExpression: "GSI_PK = :all",
    FilterExpression: "eventId = :id",
    ExpressionAttributeValues: marshall({ ":all": "ALL", ":id": eventId }),
  }));
  return ((res.Items ?? []).map(unmarshall))[0] ?? null;
}

function parseBody(raw) { try { return JSON.parse(raw ?? "{}"); } catch { return {}; } }
function todayString() { return new Date().toISOString().slice(0, 10); }
function monthEndString() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}
function respond(statusCode, body) {
  return {
    statusCode,
    headers: {
      "Access-Control-Allow-Origin":  "*",
      "Access-Control-Allow-Headers": "Authorization,Content-Type",
    },
    body: JSON.stringify(body),
  };
}
