# Kanso Mobile PWA

Drop these files into your existing `booking-app` repo. No new dependencies needed
(you already have Next.js, Supabase, next-auth).

---

## Files to add

```
pages/
  mobile/
    index.js                   ← /mobile route (PWA entry point)
  api/
    mobile/
      meetings.js              ← GET /api/mobile/meetings
      contacts.js              ← GET /api/mobile/contacts
      contacts/
        [id].js                ← GET /api/mobile/contacts/:id
      actions.js               ← POST /api/mobile/actions

components/
  mobile/
    KansoPWA.jsx               ← The full PWA UI component

public/
  manifest.json                ← PWA install manifest
  sw.js                        ← Service worker (cache + offline)
  icons/
    icon-192.png               ← App icon (home screen)
    icon-512.png               ← App icon (splash)

supabase/
  migrations/
    20260616_actions_log.sql   ← Run this once in Supabase SQL editor
```

---

## Step 1 — Run the Supabase migration

In your Supabase dashboard → SQL Editor, paste and run:
`supabase/migrations/20260616_actions_log.sql`

This creates the `actions_log` table that all 5 quick actions write to.

---

## Step 2 — Add env vars to Vercel

In Vercel → booking-app → Settings → Environment Variables, add any missing:

```
GHL_API_KEY=                        # your GHL private API key
GHL_LOCATION_ID=tsIW5P8nYSjx55tuMI43
GHL_USER_ID_STEVE=ZJTH1bHHkmeBf5uOcziW
GHL_USER_ID_JOHN=kzKxqpO9YJXGCbBj9k02

# GHL custom field IDs (get these from GHL Settings → Custom Fields)
GHL_FIELD_FRANCHISE_NAME=
GHL_FIELD_LIQUID_CAPITAL=
GHL_FIELD_SCORE=
GHL_FIELD_FRANCHISE_SUMMARY=
GHL_FIELD_FRANCHISE_HOOK=

# GHL workflow IDs for quick actions
GHL_WORKFLOW_BOOKING_LINK=          # workflow that fires booking link SMS

# Optional: GHL stage ID for "Showed"
NEXT_PUBLIC_GHL_STAGE_SHOWED=
```

Your Calendly and Google Calendar tokens are already flowing through next-auth
session — the meetings route reads them from `session.calendlyToken` and
`session.accessToken`. Verify those are present in your [...nextauth].js.

---

## Step 3 — Deploy

```bash
git add .
git commit -m "feat: kanso mobile PWA"
git push
```

Vercel auto-deploys. Takes ~60 seconds.

---

## Step 4 — Install on your iPhone

1. Open Safari on your iPhone
2. Go to: **https://www.trykanso.co/mobile**
3. Tap the **Share** button (box with arrow at bottom)
4. Tap **"Add to Home Screen"**
5. Name it "Kanso" → tap **Add**

It will appear on your home screen with the blue K icon and open full-screen
like a native app (no Safari chrome, no URL bar).

---

## How it all connects

```
iPhone PWA (KansoPWA.jsx)
    ↓ fetch()
/api/mobile/meetings     → Calendly API + Google Calendar API + GHL Calendar API
/api/mobile/contacts     → GHL Contacts Search
/api/mobile/contacts/id  → GHL Contact Detail + Appointments
/api/mobile/actions      → logs to Supabase → fires to GHL
```

No direct third-party calls from the PWA. Everything goes through Kanso.
