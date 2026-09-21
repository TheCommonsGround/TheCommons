// netlify/functions/get-rsvps.js
//
// Read-only: returns the saved RSVP record (event snapshots) for a given
// user id, or an empty array if they haven't RSVP'd to anything yet.
//
// Usage: GET /.netlify/functions/get-rsvps?userId=<identity-user-id>

import { getStore } from "@netlify/blobs";

export default async function handler(req) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");

  if (!userId) {
    return new Response(JSON.stringify({ error: "Missing ?userId= parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const store = getStore("commons-rsvps");
  const records = (await store.get(`rsvps:${userId}`, { type: "json" })) || [];

  return new Response(JSON.stringify({ records }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
