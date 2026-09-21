// netlify/functions/save-rsvps.js
//
// Saves the current logged-in user's RSVP record (event snapshots, not just
// titles — so someone's history stays accurate even if an event is later
// removed from the live list). Requires Netlify Identity to be enabled.
//
// The frontend sends the user's Identity JWT as:
//   Authorization: Bearer <jwt>
// which Netlify verifies server-side into context.clientContext.user — so a
// visitor can only ever overwrite their OWN record, never someone else's.

import { getStore } from "@netlify/blobs";

export default async function handler(req, context) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  const user = context.clientContext && context.clientContext.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Not logged in" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  let body;
  try {
    body = await req.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  if (!Array.isArray(body.records)) {
    return new Response(JSON.stringify({ error: "Missing or invalid records array" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Basic sanity cap — a real volunteer record shouldn't ever need more than
  // this many entries; guards against a runaway/malformed request.
  if (body.records.length > 2000) {
    return new Response(JSON.stringify({ error: "Too many records" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const store = getStore("commons-rsvps");
  await store.setJSON(`rsvps:${user.sub}`, body.records);

  return new Response(JSON.stringify({ success: true, count: body.records.length }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
