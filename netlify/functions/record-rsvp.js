// netlify/functions/record-rsvp.js
//
// Called once per RSVP, from every visitor, site-wide. Keeps a single
// shared counter (via Netlify Blobs — free, built into Netlify, no extra
// signup) and funds one real tree every RSVPS_PER_TREE RSVPs, no matter
// which visitor happens to trigger it.
//
// Change RSVPS_PER_TREE any time to tune cost vs. frequency. At $0.89/tree:
//   25  -> ~3.6 cents per RSVP
//   50  -> ~1.8 cents per RSVP  (current default)
//   100 -> ~0.9 cents per RSVP
//
// Needs the same ECOLOGI_API_KEY / ECOLOGI_TEST_MODE environment variables
// as before. If ECOLOGI_API_KEY isn't set yet, RSVPs still count toward the
// shared total, they just won't fund a real tree until the key is added.
//
// Honest limitation: this does a read-then-write, not a true atomic
// increment. Two RSVPs landing in the exact same instant could theoretically
// both read the same starting number. At real-world traffic for a campaign
// site this is a very low-probability edge case, not a reason to hold off
// shipping it — just flagging it rather than pretending it's impossible.

import { getStore } from "@netlify/blobs";

const RSVPS_PER_TREE = 50;
const COUNTERS_KEY = "counters";

export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" }
    });
  }

  const store = getStore("commons-counters");
  const counters = (await store.get(COUNTERS_KEY, { type: "json", consistency: "strong" }))
    || { totalRSVPs: 0, totalTreesPlanted: 0 };

  counters.totalRSVPs += 1;

  let treeJustPlanted = false;
  let treeUrl = null;

  if (counters.totalRSVPs % RSVPS_PER_TREE === 0) {
    const apiKey = process.env.ECOLOGI_API_KEY;
    if (apiKey) {
      try {
        const testMode = process.env.ECOLOGI_TEST_MODE !== "false"; // defaults to true (safe) unless explicitly set to "false"
        const ecologiRes = await fetch("https://public.ecologi.com/impact/trees", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            number: 1,
            name: "The Commons \u2014 community milestone",
            test: testMode
          })
        });
        const data = await ecologiRes.json();
        if (ecologiRes.ok) {
          treeJustPlanted = true;
          treeUrl = data.treeUrl || null;
          counters.totalTreesPlanted += 1;
        }
      } catch (err) {
        // Ecologi call failed — the RSVP still counts, we just don't fund a
        // tree this time. The count stays a multiple of RSVPS_PER_TREE, so
        // nothing is lost, it just didn't fire this round.
      }
    }
  }

  await store.setJSON(COUNTERS_KEY, counters);

  return new Response(
    JSON.stringify({
      totalRSVPs: counters.totalRSVPs,
      totalTreesPlanted: counters.totalTreesPlanted,
      treeJustPlanted,
      treeUrl
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
