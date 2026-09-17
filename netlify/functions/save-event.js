// netlify/functions/save-event.js
//
// Adds one event to the shared list in Netlify Blobs. Called by admin.html.
// Geocodes the event's address server-side (via Nominatim) at save time, so
// every event carries real lat/lng — that's what lets the main site compute
// real distance from any visitor's zip later, instead of a fixed number.
//
// Honest limitation: this endpoint has no authentication. Anyone who finds
// this URL and knows the expected fields could POST an event. Fine while
// only you and your team know admin.html exists; worth locking down with
// real auth (e.g. Netlify Identity, or a simple shared secret header)
// before sharing the admin page more widely or linking it publicly.

import { getStore } from "@netlify/blobs";

async function geocodeAddress(address) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?` +
      `q=${encodeURIComponent(address)}&countrycodes=us&format=json&limit=1`;
    const res = await fetch(url, {
      headers: { "User-Agent": "TheCommonsVT/1.0 (thecommonsproject.netlify.app)" }
    });
    const results = await res.json();
    if (Array.isArray(results) && results.length > 0) {
      return { lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) };
    }
  } catch (err) {
    // fall through to null — event still gets saved, just without coordinates
  }
  return null;
}

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

  const required = ["title", "org", "town", "address", "date", "time", "hours", "tags"];
  for (const field of required) {
    if (body[field] === undefined || body[field] === null || body[field] === "") {
      return new Response(JSON.stringify({ error: `Missing field: ${field}` }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }
  }

  const coords = await geocodeAddress(body.address);

  const store = getStore("commons-events");
  const events = (await store.get("events", { type: "json", consistency: "strong" })) || [];

  const newEvent = {
    id: crypto.randomUUID(),
    title: String(body.title),
    org: String(body.org),
    town: String(body.town),
    address: String(body.address),
    lat: coords ? coords.lat : null,
    lng: coords ? coords.lng : null,
    date: String(body.date),   // expected format: "YYYY-MM-DD"
    time: String(body.time),
    hours: Number(body.hours) || 0,
    tags: Array.isArray(body.tags)
      ? body.tags
      : String(body.tags).split(",").map(t => t.trim()).filter(Boolean)
  };

  events.push(newEvent);
  await store.setJSON("events", events);

  return new Response(
    JSON.stringify({
      success: true,
      event: newEvent,
      geocoded: coords !== null,
      warning: coords === null ? "Could not geocode that address — event saved, but it won't show a distance until the address is fixed." : undefined
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
