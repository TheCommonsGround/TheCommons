// netlify/functions/respond-friend-request.js
//
// Accepts or declines a pending friend request that arrived via friend
// code (see send-friend-request-by-code.js). Accepting adds each person to
// the other's friends list (same shape accept-friend-invite.js uses);
// declining (or accepting) both just remove the request from the
// recipient's pending list either way.
//
// Body: { "fromId": "<the requester's user id>", "action": "accept" | "decline" }
// Auth: Authorization: Bearer <jwt> (the recipient — the one responding)
//
// Data model (Netlify Blobs):
//   store "commons-friend-requests": user:<recipientId> -> [ { fromId, fromName, fromAvatarUrl, createdAt } ]
//   store "commons-friends":         friends:<userId>   -> [ { id, name, since }, ... ]

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
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  const user = getIdentityUser(req);
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

  const fromId = body.fromId;
  const action = body.action;
  if (!fromId || (action !== "accept" && action !== "decline")) {
    return new Response(JSON.stringify({ error: "Missing fromId or invalid action" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const requests = getStore("commons-friend-requests");
  const pending = (await requests.get(`user:${user.sub}`, { type: "json" })) || [];
  const match = pending.find((r) => r.fromId === fromId);

  if (!match) {
    return new Response(JSON.stringify({ error: "That request no longer exists — it may have already been handled." }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Either way, the request is resolved and comes off the pending list.
  const remaining = pending.filter((r) => r.fromId !== fromId);
  await requests.setJSON(`user:${user.sub}`, remaining);

  if (action === "decline") {
    return new Response(JSON.stringify({ success: true, declined: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Accept: connect both people, same shape as accept-friend-invite.js.
  const friends = getStore("commons-friends");
  const accepterName = (user.user_metadata && user.user_metadata.full_name) || user.email || "A volunteer";

  const [requesterList, accepterList] = await Promise.all([
    friends.get(`friends:${fromId}`, { type: "json" }),
    friends.get(`friends:${user.sub}`, { type: "json" })
  ]);
  const requesterFriends = Array.isArray(requesterList) ? requesterList : [];
  const accepterFriends = Array.isArray(accepterList) ? accepterList : [];

  const alreadyFriends = accepterFriends.some((f) => f.id === fromId);
  if (!alreadyFriends) {
    requesterFriends.push({ id: user.sub, name: accepterName, since: Date.now() });
    accepterFriends.push({ id: fromId, name: match.fromName, since: Date.now() });
    await Promise.all([
      friends.setJSON(`friends:${fromId}`, requesterFriends),
      friends.setJSON(`friends:${user.sub}`, accepterFriends)
    ]);
  }

  return new Response(JSON.stringify({ success: true, friendName: match.fromName }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
