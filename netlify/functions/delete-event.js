// netlify/functions/delete-event.js
//
// Removes one event (by id) from the shared list in Netlify Blobs.
// Same auth caveat as save-event.js — no authentication on this endpoint yet.

import { getStore } from "@netlify/blobs";

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
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

  if (!body.id) {
    return new Response(JSON.stringify({ error: "Missing id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const store = getStore("commons-events");
  const events = (await store.get("events", { type: "json", consistency: "strong" })) || [];
  const filtered = events.filter(e => e.id !== body.id);
  await store.setJSON("events", filtered);

  return new Response(JSON.stringify({ success: true, remaining: filtered.length }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
