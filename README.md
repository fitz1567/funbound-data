# FunBound data

The fare files the FunBound iPhone and iPad app downloads, published at https://fitz1567.github.io/funbound-data/.

- `flights/<AIRPORT>.json`: for each of about 40 U.S. airports, the cheapest fares found recently to and from Orlando for every day of the next 13 months (by airline, nonstop or not), and the cheapest round trips to FunBound's destinations.
- `index.json`: when the files were last made, the airports with files, and any that failed that night.
- `disney-guide.json`: the latest Walt Disney World price guide. The app uses it when it's newer than the one built in.

Every night the **Fares** GitHub Action (`.github/workflows/fares.yml`) runs `tools/fares.mjs`, which calls Travelpayouts' official Data API. The API token is the repository secret `TRAVELPAYOUTS_TOKEN`; the app never sees it. The files are published with GitHub Pages straight from the Action and are never committed, so the repository stays small. An airport that fails keeps the previous night's file. On the 1st of each month the Action makes an empty commit, because GitHub pauses nightly schedules in repositories that go 60 days without one.

These files are made from `FunBound/` in the ClaudeApps project and pushed by `FunBound/hosting/publish.sh`. Change them there, not here.
