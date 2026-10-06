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
