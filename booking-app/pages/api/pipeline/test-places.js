export default async function handler(req, res) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return res.status(200).json({ status: 'MISSING - key not in env' });

  try {
    const query = 'Orlando Plumbing home services Orlando FL';
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${key}`;
    const r = await fetch(url);
    const d = await r.json();

    return res.status(200).json({
      key_present: true,
      key_prefix: key.slice(0, 8),
      status: d.status,
      error_message: d.error_message || null,
      first_result: d.results?.[0] ? {
        name: d.results[0].name,
        address: d.results[0].formatted_address,
        website: d.results[0].website,
        place_id: d.results[0].place_id,
      } : null,
      total_results: d.results?.length || 0,
    });
  } catch (err) {
    return res.status(200).json({ key_present: true, error: err.message });
  }
}
