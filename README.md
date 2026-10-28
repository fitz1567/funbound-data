# FunBound data

The fare files the FunBound iPhone and iPad app downloads, published at https://fitz1567.github.io/funbound-data/.

- `flights/<AIRPORT>.json`: for each of about 40 U.S. airports, the cheapest fares found recently to and from Orlando for every day of the next 13 months (by airline, nonstop or not), and the cheapest round trips to FunBound's destinations.
- `calendars/<AIRPORT>.json`: each destination's price calendar from that airport: the cheapest round trip found for each departure day, with its return day (`{ "origin", "updated", "routes": { "CUN": { "2026-11-12": [price, airline, stops, return day] } } }`).
- `history/<AIRPORT>.json`: the last 90 nights' cheapest round trip to each destination from that airport (`{ "origin", "updated", "from", "routes": { "CUN": [312, null, 298, …] } }`, one price or null per night from `from`), made from the night's calendars and deals with no extra requests. The Action downloads last night's copy first, so it grows a night at a time.
- `index.json`: when the files were last made, the airports with fare files, calendars and histories, and any that failed that night.
- `disney-guide.json`: the latest Walt Disney World price guide. The app uses it when it's newer than the one built in.
- `disney-events.json`: Disney's published event dates (parties, EPCOT festivals, runDisney weekends) and the usual school-holiday weeks, for the planner's calendar. Also used when newer than the built-in copy.

Every night the **Fares** GitHub Action (`.github/workflows/fares.yml`) runs `tools/fares.mjs`, which calls Travelpayouts' official Data API. The API token is the repository secret `TRAVELPAYOUTS_TOKEN`; the app never sees it. The files are published with GitHub Pages straight from the Action and are never committed, so the repository stays small. An airport that fails keeps the previous night's file. On the 1st of each month the Action makes an empty commit, because GitHub pauses nightly schedules in repositories that go 60 days without one.

These files are made from `FunBound/` in the ClaudeApps project and pushed by `FunBound/hosting/publish.sh`. Change them there, not here.

## Moving to Cloudflare Pages

GitHub Pages discourages commercial sites, so the feed can move to Cloudflare Pages. The app is ready: it reads the
host in its `FBDataURL` setting first and falls back to `https://fitz1567.github.io/funbound-data/` for any file the
new host doesn't answer (TripKit's `FeedHosts`). The Fares workflow already has a step that copies each night's files
to a Cloudflare Pages project; it's skipped until the two secrets below exist. Nothing changes for phones until an app
update sets `FBDataURL`.

1. Cloudflare dashboard: **Workers & Pages > Create > Pages > Upload assets** (Direct Upload). Project name
   `funbound-data`, production branch `main`. Upload any small folder to create it (the workflow replaces it). Note the
   address it gets, normally `https://funbound-data.pages.dev/` (it differs if the name is taken).
2. **My Profile > API Tokens > Create Token > Custom token:** permission *Account > Cloudflare Pages > Edit*, for your
   account only. Copy the token. Your **Account ID** is on the Workers & Pages overview page.
3. GitHub, `fitz1567/funbound-data` **Settings > Secrets and variables > Actions > New repository secret**: add
   `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
4. Publish the workflow change (`FunBound/hosting/publish.sh`), then **Actions > Fares > Run workflow**. Check that
   `https://funbound-data.pages.dev/index.json` shows tonight's date and the same airports as GitHub Pages.
5. Set `FUNBOUND_DATA_URL` in `FunBound/project.yml` to that address; the next app update reads Cloudflare first. Keep GitHub Pages running: older app versions and the fallback use it, and each night's run starts
   from its copy of the price history.

