import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';

export const config = { maxDuration: 60 };

// Meta Ad Library API — https://www.facebook.com/ads/library/api
// Requires an access token from an app approved for the Ad Library API.
const FB_TOKEN = process.env.FB_ADS_TOKEN || process.env.FB_PAGE_ACCESS_TOKEN;
const GRAPH = 'https://graph.facebook.com/v21.0';

async function scrapeAdLibrary(searchTerms, limit = 25) {
  const params = new URLSearchParams({
    search_terms: searchTerms,
    ad_type: 'ALL',
    ad_active_status: 'ACTIVE',
    ad_reached_countries: '["US"]',
    limit: String(limit),
    fields: 'id,page_name,ad_creative_bodies,ad_creative_link_titles,ad_creative_link_descriptions,ad_snapshot_url',
    access_token: FB_TOKEN,
  });
  const r = await fetch(`${GRAPH}/ads_archive?${params}`);
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || 'Ad Library API error');
  return (d.data || []).map((ad) => ({
    source: 'meta_ad_library',
    fb_ad_archive_id: ad.id,
    advertiser: ad.page_name || null,
    headline: ad.ad_creative_link_titles?.[0] || null,
    body: ad.ad_creative_bodies?.[0] || null,
    snapshot_url: ad.ad_snapshot_url || null,
    industry: 'franchise',
    raw: ad,
  }));
}

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  const supabase = getSupabaseAdmin();

  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('ad_library')
      .select('*')
      .order('starred', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ads: data });
  }

  if (req.method === 'POST') {
    const { action } = req.body || {};

    if (action === 'scrape') {
      if (!FB_TOKEN) return res.status(500).json({ error: 'Missing FB_ADS_TOKEN (Meta Ad Library access token)' });
      const terms = req.body.searchTerms || 'franchise opportunity';
      let ads;
      try {
        ads = await scrapeAdLibrary(terms, req.body.limit || 25);
      } catch (e) {
        return res.status(502).json({ error: `Ad Library scrape failed: ${e.message}` });
      }
      if (!ads.length) return res.json({ imported: 0, ads: [] });
      const { data, error } = await supabase
        .from('ad_library')
        .upsert(ads, { onConflict: 'fb_ad_archive_id', ignoreDuplicates: true })
        .select();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ imported: data?.length || 0, ads: data });
    }

    if (action === 'add') {
      const { advertiser, headline, body, link_url, notes } = req.body;
      const { data, error } = await supabase
        .from('ad_library')
        .insert({ source: 'manual', advertiser, headline, body, link_url, notes })
        .select()
        .single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ad: data });
    }

    if (action === 'star') {
      const { id, starred } = req.body;
      const { error } = await supabase.from('ad_library').update({ starred: !!starred }).eq('id', id);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true });
    }

    return res.status(400).json({ error: 'Unknown action' });
  }

  if (req.method === 'DELETE') {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: 'id required' });
    const { error } = await supabase.from('ad_library').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  return res.status(405).end();
}
