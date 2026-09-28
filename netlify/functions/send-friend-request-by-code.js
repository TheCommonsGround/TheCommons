// netlify/functions/send-friend-request-by-code.js
//
// Lets a signed-in person send a friend request to someone else by typing
// that person's friend code (e.g. "32654" from "Lemur#32654" — only the
// numeric part is looked up). Unlike the link-based invite flow, typing in
// someone's code is NOT pre-approval from them, so this creates a pending
// request rather than an instant friendship. The recipient sees it via
// get-friend-requests.js and accepts/declines via respond-friend-request.js.
//
// Body: { "code": "32654" }
// Auth: Authorization: Bearer <jwt> (the sender)
//
// Data model (Netlify Blobs):
//   store "commons-friend-codes":     code:<code> -> userId            (read)
//   store "commons-friend-requests":  user:<recipientId> -> [ { fromId, fromName, fromAvatarUrl, createdAt } ]

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
    return new Response(JSON.stringify({ error: "Invalid request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const rawCode = (body && body.code ? String(body.code) : "").trim();
  // Accept either a bare "32654" or the full "Lemur#32654" — only the digits after
  // the last # (or the whole string, if there's no #) actually matter.
  const code = rawCode.includes("#") ? rawCode.split("#").pop().trim() : rawCode;

  if (!/^\d{4,6}$/.test(code)) {
    return new Response(JSON.stringify({ error: "That doesn't look like a valid friend code." }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const codes = getStore("commons-friend-codes");
  const targetId = await codes.get(`code:${code}`);

  if (!targetId) {
    return new Response(JSON.stringify({ error: "No one has that friend code." }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  }

  if (targetId === user.sub) {
    return new Response(JSON.stringify({ error: "That's your own friend code." }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const friends = getStore("commons-friends");
  const existingFriends = (await friends.get(`friends:${user.sub}`, { type: "json" })) || [];
  if (existingFriends.some((f) => f.id === targetId)) {
    return new Response(JSON.stringify({ error: "You're already friends." }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const requests = getStore("commons-friend-requests");
  const existingRequests = (await requests.get(`user:${targetId}`, { type: "json" })) || [];

  if (existingRequests.some((r) => r.fromId === user.sub)) {
    return new Response(JSON.stringify({ ok: true, alreadySent: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  const avatars = getStore("commons-avatars");
  const fromAvatarUrl = await avatars.get(`avatar:${user.sub}`);

  const fromName = (user.user_metadata && user.user_metadata.full_name) || user.email || "A volunteer";

  existingRequests.push({
    fromId: user.sub,
    fromName,
    fromAvatarUrl: fromAvatarUrl || null,
    createdAt: Date.now()
  });

  await requests.setJSON(`user:${targetId}`, existingRequests);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
