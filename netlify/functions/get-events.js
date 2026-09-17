// netlify/functions/get-events.js
//
// Read-only: returns the current list of real events stored in Netlify Blobs.
// The main site fetches this on load instead of using a hardcoded array.

import { getStore } from "@netlify/blobs";

export default async function handler() {
  const store = getStore("commons-events");
  const events = (await store.get("events", { type: "json" })) || [];

  return new Response(JSON.stringify(events), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
