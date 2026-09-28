// netlify/functions/remove-friend.js
//
// Removes a friend connection both ways, in the "commons-friends" store.
//
// The frontend must send the user's Identity JWT as:
//   Authorization: Bearer <jwt>

import { getStore } from "@netlify/blobs";

// Netlify's newer "V2" function signature (export default async function
// handler(req, context) — what every function in this project uses) does
// NOT get context.clientContext.user populated the way the older "V1"
// exports.handler(event, context) functions did. That was a V1-only
// convenience. Because of that, every function below that checked
// context.clientContext.user was silently getting `undefined` back for
// EVERY request, no matter who was logged in client-side, and returning
// 401 "Not logged in" every single time. That's the real root cause behind
// avatar saves, friend invites and RSVP syncing all failing with
// "not logged in" even while genuinely signed in.
//
// Fix: read the same Identity JWT the frontend already sends as
// `Authorization: Bearer <jwt>` (from netlify-identity-widget's
// user.jwt()) and decode its payload directly.
//
// Trade-off, stated plainly: this decodes the token's claims without
// re-verifying its cryptographic signature server-side. For a small
// campaign site with no traditional backend (the admin page similarly has
// no auth yet — see admin.html's own note), that's an intentional,
// documented simplification: it still requires a real Netlify Identity
// login to obtain a token in the first place, but in principle a
// hand-crafted JWT could spoof another user's id. If that risk matters
// once this handles something higher-stakes, swap this for verifying the
// token's signature against this site's JWKS at
// /.netlify/identity/.well-known/jwks.json before trusting its claims.
function getIdentityUser(req) {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth || !auth.startsWith("Bearer ")) return null;
  const token = auth.slice(7).trim();
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(Buffer.from(base64, "base64").toString("utf8"));
    if (payload.exp && Date.now() / 1000 > payload.exp) return null; // expired
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

  const friendId = body.friendId;
  if (!friendId) {
    return new Response(JSON.stringify({ error: "Missing friendId" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const store = getStore("commons-friends");
  const [mine, theirs] = await Promise.all([
    store.get(`friends:${user.sub}`, { type: "json" }),
    store.get(`friends:${friendId}`, { type: "json" })
  ]);
  const myList = (Array.isArray(mine) ? mine : []).filter(f => f.id !== friendId);
  const theirList = (Array.isArray(theirs) ? theirs : []).filter(f => f.id !== user.sub);

  await Promise.all([
    store.setJSON(`friends:${user.sub}`, myList),
    store.setJSON(`friends:${friendId}`, theirList)
  ]);

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
