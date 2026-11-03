# EventEase browser tests

Playwright tests use the static site at `http://localhost:8100` and a temporary API on port `5100`. The runner initializes and seeds **only** `eventease_test`; it refuses a different `DB_NAME`. MySQL credentials are loaded from `eventease-backend/.env`.

```powershell
cd e2e
npm install
npm run install:browsers
npm test
npm run screenshots
```

`npm test` runs the five UI journeys plus responsive checks at 1366, 768, and 390 pixels. Screenshots are saved in `e2e/screenshots/`. `npm run screenshots` runs the same suite so it can recreate the temporary authenticated sessions required for the screenshots. Test users, events, and bookings are temporary and cleaned up.
