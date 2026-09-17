// netlify/functions/save-avatar.js
//
// Saves a profile photo for the currently logged-in user. Requires Netlify
// Identity to be enabled on the site (Site configuration → Identity →
// Enable Identity) — that's what makes context.clientContext.user available
// and server-verified here, so a visitor can only ever overwrite their OWN
// avatar, never someone else's.
//
// The frontend must send the user's Identity JWT as:
//   Authorization: Bearer <jwt>
// (netlify-identity-widget's user.jwt() gives you this token.)

import { getStore } from "@netlify/blobs";

export default async function handler(req, context) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  const user = context.clientContext && context.clientContext.user;
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

  if (!body.image || !String(body.image).startsWith("data:image/")) {
    return new Response(JSON.stringify({ error: "Missing or invalid image (expected a data: URL)" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  // Rough size guard — data: URLs are ~33% bigger than the raw file, so this
  // caps the original image at roughly 3MB. Prevents someone from storing
  // an enormous file as their avatar.
  if (body.image.length > 4_000_000) {
    return new Response(JSON.stringify({ error: "Image is too large — please use a smaller photo" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const store = getStore("commons-avatars");
  await store.set(`avatar:${user.sub}`, body.image);

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
