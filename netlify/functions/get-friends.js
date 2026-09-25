// netlify/functions/get-friends.js
//
// Returns the signed-in person's friends list: [{ id, name, since }, ...].
// The frontend fills in each friend's live hours/events itself via the
// site's existing (public) get-rsvps?userId=... endpoint — this function
// only needs to hand back who's on the list.
//
// The frontend must send the user's Identity JWT as:
//   Authorization: Bearer <jwt>

import { getStore } from "@netlify/blobs";

export default async function handler(req, context) {
  const user = context.clientContext && context.clientContext.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Not logged in" }), {
      status: 401,
      headers: { "Content-Type": "application/json" }
    });
  }

  const store = getStore("commons-friends");
  const list = (await store.get(`friends:${user.sub}`, { type: "json" })) || [];

  return new Response(JSON.stringify({ friends: list }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
