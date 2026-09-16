# Green Team express locations

The Meetings client card, shared CRM card (including CQ Recovery), and expanded
All Contacts lead card automatically check Green Team leads when opened. Other
brands do not display the box or make requests. No database migration is needed.

## Works without an API key

The default check runs entirely on the server using bundled public U.S. Census
2025 Gazetteer representative coordinates for 33,601 places and towns. No external
API, account, key, or per-lookup fee is needed. The dataset is not sent to browsers.

The origin is the same resolved territory shown on the client card, with a phone
area-code fallback when no territory exists. Every region in the app's current
area-code lookup has an explicit representative city or a matching Census place.
Area codes can cover broad regions and may not reflect where a client lives.
Unambiguous city/state form answers and standalone supported area codes also work.
State-only, unknown, and ambiguous locations remain unresolved.

The estimator compares all 19 processing **warehouse towns**, rather than the
marketing city (for example, Santa Clara for San Francisco and Gurnee for Chicago).
It ranks them by geographic distance, not verified road travel time, and keeps the
supplied street address and a Google Maps driving-directions link for confirmation.
The UI shows the representative origin and warehouse town used in the projection.

The screening assumptions are deliberately visible and are not calibrated routing
predictions or statistical confidence intervals:

- Central distance: straight-line miles multiplied by 1.30.
- Central time: that distance at 55 mph, plus 15 minutes of local travel.
- Low time: 1.15 times straight-line miles at 65 mph, plus 10 minutes.
- High time: 1.50 times straight-line miles at 45 mph, plus 20 minutes.
- Time ranges round outward to 15 minutes (minimum 15 minutes); distance rounds to
  10 miles. Same-city travel shows `<10 mi est.` rather than an exact zero.

If the entire modeled range is within 5h 30m, the card labels it a potential
express location, with an estimate label. If the range crosses the cutoff, it
shows **Borderline — verify the drive**. If even the low estimate is beyond the
cutoff, it says **Estimated outside express range**. The estimate is not an
eligibility guarantee: roads, traffic, mountains and water crossings can change
travel substantially. Alaska, Hawaii and Puerto Rico do not receive implied
mainland driving times. No client address or personal information leaves the app
for the offline calculation.

Data sources:
[2025 Census Gazetteer](https://www.census.gov/geographies/reference-files/2025/geo/gazetter-file.html),
[Places ZIP](https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_Gaz_place_national.zip),
[Towns/subdivisions ZIP](https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_Gaz_cousubs_national.zip).
To reproduce the bundled file, download those public archives and run
`python3 scripts/build-express-coordinates.py places.zip county-subdivisions.zip`.
New England and New Jersey town/subdivision records supplement missing places.
Duplicate names within a state are retained and rejected during lookup.

## Optional Google driving routes

For calculated road routes, enable Google Maps **Routes API** with billing and
set `GOOGLE_MAPS_ROUTES_API_KEY` in the server environment. Restrict the key to the
Routes API and use appropriate quotas. Never prefix it with `NEXT_PUBLIC_`.
Redeploy after setting the key in hosting.

With a key, all 19 supplied physical addresses are compared in one route matrix
request. The closest warehouse is ranked by driving time. At most 19,800 seconds
(5 hours 30 minutes) flags a potential express location. These routes exclude live
traffic. One check requests 19 billable route elements; results are not persisted.
Missing keys use the offline estimator. Failed, timed-out, or inconclusive route
requests also fall back to a labeled rough projection. Partial Google results
that confirm a nearby warehouse retain the incomplete-results warning.

Reference: [Google route matrix documentation](https://developers.google.com/maps/documentation/routes/compute_route_matrix).

## Verification

Run `node --test tests/greenTeamExpress.test.mjs` for the routing and offline
estimate tests, `npm test` for the complete suite, and `npm run build` for the
production build. Database tests start temporary PostgreSQL and require local
shared-memory permissions.

Without a key, test Dallas (nearby), Detroit (borderline), Denver (distant), a
missing city, and another brand. Check an area-code region's displayed
representative city. Google live-route verification requires a configured key.
