/**
 * /api/dashboard/brands
 *
 * GET    → list all brands (full config)
 * POST   → create a new brand
 * PUT    → update an existing brand (body must include id)
 * DELETE → delete a brand (body must include id)
 *
 * All methods require an active dashboard session.
 */

import { getServerSession } from 'next-auth/next';
import { authOptions } from '../auth/[...nextauth]';
import { getSupabaseAdmin } from '@/lib/supabase';

export default async function handler(req, res) {
  const session = await getServerSession(req, res, authOptions);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });

  const supabase = getSupabaseAdmin();

  // ── GET — list all brands ──────────────────────────────────────────────────
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('brands')
      .select('*')
      .order('created_at', { ascending: true });
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ brands: data || [] });
  }

  // ── POST — create brand ────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const {
      slug, name, active,
      booking_headline, booking_subtitle, booking_description,
      meeting_title, meeting_duration,
      event_description, event_location, event_color, event_reminder_mins,
      fb_form_ids, ghl_tags, rep_emails,
      routing_rules,
    } = req.body;

    if (!slug || !name) return res.status(400).json({ error: 'slug and name are required' });

    // Validate slug: lowercase letters, numbers, hyphens only
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({ error: 'slug must be lowercase letters, numbers, and hyphens only' });
    }

    const { data, error } = await supabase
      .from('brands')
      .insert({
        slug:                slug.trim().toLowerCase(),
        name:                name.trim(),
        active:              active !== false,
        booking_headline:    booking_headline    || null,
        booking_subtitle:    booking_subtitle    || null,
        booking_description: booking_description || null,
        meeting_title:       meeting_title       || '15-Minute Phone Call',
        meeting_duration:    meeting_duration    || 15,
        event_description:   event_description   || null,
        event_location:      event_location      || null,
        event_color:         event_color         ? Number(event_color) : null,
        event_reminder_mins: event_reminder_mins || 15,
        fb_form_ids:         fb_form_ids         || [],
        ghl_tags:            ghl_tags            || [],
        rep_emails:          rep_emails          || [],
        routing_rules:       routing_rules       || {},
        routing_counters:    {},
        updated_at:          new Date().toISOString(),
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(201).json({ brand: data });
  }

  // ── PUT — update brand ─────────────────────────────────────────────────────
  if (req.method === 'PUT') {
    const { id, ...fields } = req.body;
    if (!id) return res.status(400).json({ error: 'id is required' });

    const allowed = [
      'slug', 'name', 'active',
      'booking_headline', 'booking_subtitle', 'booking_description',
      'meeting_title', 'meeting_duration',
      'event_description', 'event_location', 'event_color', 'event_reminder_mins',
      'fb_form_ids', 'ghl_tags', 'rep_emails', 'routing_rules',
    ];

    const update = { updated_at: new Date().toISOString() };
    for (const key of allowed) {
      if (fields[key] !== undefined) {
        update[key] = fields[key];
      }
    }
    if (update.slug) update.slug = update.slug.trim().toLowerCase();
    if (update.name) update.name = update.name.trim();
    if (update.event_color !== undefined) update.event_color = update.event_color ? Number(update.event_color) : null;

    const { data, error } = await supabase
      .from('brands')
      .update(update)
      .eq('id', id)
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ brand: data });
  }

  // ── DELETE — remove brand ──────────────────────────────────────────────────
  if (req.method === 'DELETE') {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: 'id is required' });

    const { error } = await supabase.from('brands').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ ok: true });
  }

  res.status(405).end();
}
