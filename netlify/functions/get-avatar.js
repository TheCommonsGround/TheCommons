// netlify/functions/get-avatar.js
//
// Read-only: returns the saved profile photo (as a data: URL) for a given
// user id, or { avatarUrl: null } if that user hasn't set one. Deliberately
// public/unauthenticated — profile photos aren't sensitive, and this keeps
// showing other members' avatars (e.g. on a future leaderboard) simple.
//
// Usage: GET /.netlify/functions/get-avatar?userId=<identity-user-id>

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

  const store = getStore("commons-avatars");
  const avatarUrl = await store.get(`avatar:${userId}`);

  return new Response(JSON.stringify({ avatarUrl: avatarUrl || null }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
