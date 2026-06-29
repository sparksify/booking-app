export default async function handler(req, res) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return res.status(200).json({ status: 'MISSING' });

  try {
    const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.displayName,places.formattedAddress,places.websiteUri,places.id',
      },
      body: JSON.stringify({ textQuery: 'Orlando Plumbing home services Orlando FL' }),
    });

    const d = await r.json();
    return res.status(200).json({
      key_present: true,
      key_prefix: key.slice(0, 8),
      status: r.status,
      first_result: d.places?.[0] ? {
        name: d.places[0].displayName?.text,
        address: d.places[0].formattedAddress,
        website: d.places[0].websiteUri,
        place_id: d.places[0].id,
      } : null,
      total_results: d.places?.length || 0,
      raw_error: d.error || null,
    });
  } catch (err) {
    return res.status(200).json({ error: err.message });
  }
}
