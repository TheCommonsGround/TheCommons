// netlify/functions/get-friend-requests.js
//
// Returns the signed-in person's pending incoming friend requests (sent via
// a friend code, not a link — link invites resolve instantly on accept and
// never sit in this list). Each entry: { fromId, fromName, fromAvatarUrl, createdAt }.
//
// The frontend must send the user's Identity JWT as:
//   Authorization: Bearer <jwt>

import { getStore } from "@netlify/blobs";

function getIdentityUser(req) {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(Buffer.from(base64, "base64").toString("utf8"));
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    return {
      sub: payload.sub,
      email: payload.email,
      user_metadata: payload.user_metadata || {},
      app_metadata: payload.app_metadata || {}
    };
  } catch (err) {
    return null;
  }
}

export default async function handler(req, context) {
  const user = getIdentityUser(req);
  if (!user) {
    return new Response(JSON.stringify({ error: "Not logged in" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  const requests = getStore("commons-friend-requests");
  const list = (await requests.get(`user:${user.sub}`, { type: "json" })) || [];

  // Oldest first, so someone who's been waiting a while sees their request
  // at the top rather than buried under newer ones.
  list.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

  return new Response(JSON.stringify({ requests: list }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
