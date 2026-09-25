// netlify/functions/accept-friend-invite.js
//
// Redeems an invite token: connects the signed-in person and whoever
// created that invite link, both ways, in the "commons-friends" store.
// Safe to call more than once with the same token/person — it leaves the
// connection as-is if it's already there rather than duplicating it.
//
// The frontend must send the user's Identity JWT as:
//   Authorization: Bearer <jwt>
//
// Data model (Netlify Blobs):
//   store "commons-friend-invites": invite:<token>  -> { inviterId, inviterName, createdAt }
//   store "commons-friends":        friends:<userId> -> [{ id, name, since }, ...]

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

  const token = body.token;
  if (!token) {
    return new Response(JSON.stringify({ error: "Missing invite token" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const invites = getStore("commons-friend-invites");
  const friends = getStore("commons-friends");

  const invite = await invites.get(`invite:${token}`, { type: "json" });
  if (!invite) {
    return new Response(JSON.stringify({ error: "That invite link is invalid or has expired." }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    });
  }
  if (invite.inviterId === user.sub) {
    return new Response(JSON.stringify({ error: "That's your own invite link." }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const accepterName = (user.user_metadata && user.user_metadata.full_name) || user.email || "A volunteer";

  const [inviterList, accepterList] = await Promise.all([
    friends.get(`friends:${invite.inviterId}`, { type: "json" }),
    friends.get(`friends:${user.sub}`, { type: "json" })
  ]);
  const inviterFriends = Array.isArray(inviterList) ? inviterList : [];
  const accepterFriends = Array.isArray(accepterList) ? accepterList : [];

  const alreadyFriends = accepterFriends.some(f => f.id === invite.inviterId);
  if (!alreadyFriends) {
    inviterFriends.push({ id: user.sub, name: accepterName, since: Date.now() });
    accepterFriends.push({ id: invite.inviterId, name: invite.inviterName, since: Date.now() });
    await Promise.all([
      friends.setJSON(`friends:${invite.inviterId}`, inviterFriends),
      friends.setJSON(`friends:${user.sub}`, accepterFriends)
    ]);
  }

  return new Response(JSON.stringify({ success: true, friendName: invite.inviterName }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
