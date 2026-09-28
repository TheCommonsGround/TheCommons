// netlify/functions/get-friend-code.js
//
// Hands back a stable, short "friend code" for the signed-in person, in the
// Discord-style format NAME#12345 — a secondary way to connect besides the
// invite link, meant for sharing in person or verbally, where there's no
// link to click. Only the numeric part is ever actually looked up (see
// send-friend-request-by-code.js); the name half is just a memory aid and
// is re-read fresh from the account each time, so it stays current even if
// someone changes their display name later.
//
// The frontend must send the user's Identity JWT as:
//   Authorization: Bearer <jwt>
//
// Data model (Netlify Blobs):
//   store "commons-friend-codes":         code:<5-digit number> -> userId
//   store "commons-friend-codes-by-user":  user:<userId>         -> code

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

  const codes = getStore("commons-friend-codes");
  const codesByUser = getStore("commons-friend-codes-by-user");

  let code = await codesByUser.get(`user:${user.sub}`);

  if (!code) {
    // Try a handful of random 5-digit codes until one isn't already taken.
    // Collisions are rare at this scale, but check anyway rather than
    // assuming.
    for (let attempt = 0; attempt < 20; attempt++) {
      const candidate = String(Math.floor(10000 + Math.random() * 90000));
      const existingOwner = await codes.get(`code:${candidate}`);
      if (!existingOwner) {
        code = candidate;
        break;
      }
    }
    if (!code) {
      return new Response(JSON.stringify({ error: "Could not generate a unique code — try again." }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
    await codes.set(`code:${code}`, user.sub);
    await codesByUser.set(`user:${user.sub}`, code);
  }

  const displayName = (user.user_metadata && user.user_metadata.full_name) || user.email || "A volunteer";

  return new Response(JSON.stringify({ code, displayName }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
