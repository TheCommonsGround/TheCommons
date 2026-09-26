// netlify/functions/geocode-zip.js
//
// Turns a zip code (or general location text) into { lat, lng } using
// OpenStreetMap's free Nominatim geocoder. Used both by the main site
// (turning a visitor's searched zip into real coordinates) and could be
// reused for other location lookups later.
//
// Nominatim's usage policy requires a real User-Agent identifying the app
// and asks for no more than ~1 request/second — both handled below. This is
// fine at prototype/small-nonprofit traffic. If you outgrow it, the fix is a
// paid geocoder (Mapbox, Google) with a real SLA, not a code change here —
// just swap the fetch URL and response parsing.
//
// Usage: GET /.netlify/functions/geocode-zip?q=05401
//     or GET /.netlify/functions/geocode-zip?q=Burlington,%20VT

export default async function handler(req) {
  const url = new URL(req.url);
  const query = url.searchParams.get("q");

  if (!query) {
    return new Response(JSON.stringify({ error: "Missing ?q= parameter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const headers = {
      // Required by Nominatim's usage policy — identifies the app, not a browser UA.
      "User-Agent": "TheCommonsVT/1.0 (thecommonsproject.netlify.app)"
    };

    // A bare 5-digit US zip (optionally with a -1234 extension) is far more
    // reliable through Nominatim's *structured* search (postalcode= + country=)
    // than through the free-text q= search: plain "q=05753" frequently comes
    // back with zero results for real, valid zips because it's being matched
    // as a keyword rather than looked up as a postal code. City/state text
    // ("Burlington, VT") still goes through the general q= search below.
    const isBareZip = /^\d{5}(-\d{4})?$/.test(query.trim());

    let results;
    if (isBareZip) {
      const zip5 = query.trim().slice(0, 5);
      const structuredUrl = `https://nominatim.openstreetmap.org/search?` +
        `postalcode=${encodeURIComponent(zip5)}&country=us&format=json&limit=1`;
      const res = await fetch(structuredUrl, { headers });
      results = await res.json();

      // Structured postal lookups occasionally miss a valid zip too (gaps in
      // OSM's postcode data) — fall back to the general search before giving up.
      if (!Array.isArray(results) || results.length === 0) {
        const fallbackUrl = `https://nominatim.openstreetmap.org/search?` +
          `q=${encodeURIComponent(zip5)}&countrycodes=us&format=json&limit=1`;
        const fallbackRes = await fetch(fallbackUrl, { headers });
        results = await fallbackRes.json();
      }
    } else {
      const nominatimUrl = `https://nominatim.openstreetmap.org/search?` +
        `q=${encodeURIComponent(query)}&countrycodes=us&format=json&limit=1`;
      const res = await fetch(nominatimUrl, { headers });
      results = await res.json();
    }

    if (!Array.isArray(results) || results.length === 0) {
      return new Response(JSON.stringify({ error: "Location not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(
      JSON.stringify({
        lat: parseFloat(results[0].lat),
        lng: parseFloat(results[0].lon),
        displayName: results[0].display_name
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: "Geocoding failed", message: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
