// netlify/functions/get-counts.js
//
// Read-only: returns the current shared totals so the site can display a
// live-looking counter to every visitor, not just the one who RSVP'd.
// The front end polls this periodically.

import { getStore } from "@netlify/blobs";

export default async function handler() {
  const store = getStore("commons-counters");
  const counters = (await store.get("counters", { type: "json" }))
    || { totalRSVPs: 0, totalTreesPlanted: 0 };

  return new Response(JSON.stringify(counters), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
