// netlify/functions/remove-friend.js
//
// Removes a friend connection both ways, in the "commons-friends" store.
//
// The frontend must send the user's Identity JWT as:
//   Authorization: Bearer <jwt>

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
