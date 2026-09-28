// netlify/functions/get-invite-preview.js
//
// Public (no login required) lookup: given an invite link's token, returns
// just enough about the person who created it — name + photo — so the
// frontend can show "Jane wants to be your friend on The Commons — Accept /
// Decline" BEFORE the visitor logs in or creates an account. Deliberately
// read-only and unauthenticated: nothing about the visitor is touched here,
// so no JWT is needed. Actually connecting the two people still requires
// signing in and calling accept-friend-invite.js.
//
// Query string: ?token=<invite token>
//
// Data model (Netlify Blobs):
//   store "commons-friend-invites": invite:<token> -> { inviterId, inviterName, createdAt }
//   store "commons-avatars":        avatar:<userId> -> data: URL string

import { getStore } from "@netlify/blobs";

export default async function handler(req, context) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return new Response(JSON.stringify({ error: "Missing token" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const invites = getStore("commons-friend-invites");
  const invite = await invites.get(`invite:${token}`, { type: "json" });

  if (!invite) {
    return new Response(JSON.stringify({ error: "That invite link is invalid or has expired." }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  }

  const avatars = getStore("commons-avatars");
  const avatarUrl = await avatars.get(`avatar:${invite.inviterId}`);

  return new Response(JSON.stringify({
    inviterName: invite.inviterName,
    inviterAvatarUrl: avatarUrl || null
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
