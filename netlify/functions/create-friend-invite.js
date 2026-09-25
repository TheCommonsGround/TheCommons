// netlify/functions/create-friend-invite.js
//
// Hands back a stable, shareable invite link/token for the signed-in
// person. Calling this again later returns the SAME token rather than
// minting a new one every time, so a person's invite link doesn't change
// every time they open the Friends tab.
//
// The frontend must send the user's Identity JWT as:
//   Authorization: Bearer <jwt>
//
// Data model (Netlify Blobs):
//   store "commons-friend-invite-owners": owner:<userId> -> token
//   store "commons-friend-invites":       invite:<token> -> { inviterId, inviterName, createdAt }

import { getStore } from "@netlify/blobs";
import crypto from "node:crypto";

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

  const owners = getStore("commons-friend-invite-owners");
  const invites = getStore("commons-friend-invites");

  const existingToken = await owners.get(`owner:${user.sub}`);
  if (existingToken) {
    return new Response(JSON.stringify({ token: existingToken }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }

  const token = crypto.randomBytes(16).toString("hex");
  const inviterName = (user.user_metadata && user.user_metadata.full_name) || user.email || "A volunteer";

  await invites.setJSON(`invite:${token}`, {
    inviterId: user.sub,
    inviterName,
    createdAt: Date.now()
  });
  await owners.set(`owner:${user.sub}`, token);

  return new Response(JSON.stringify({ token }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
