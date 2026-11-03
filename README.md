# EventEase

EventEase is a local online event booking and management demo. The static frontend is plain HTML/CSS/JavaScript served from the repo root, the API is an Express server in `eventease-backend`, and the app data lives in MySQL.

## Requirements

- Node.js 20+ and npm
- MySQL 8.0.16+ (local validation used MySQL 9.2)
- Python 3 for the static frontend server
- PowerShell 5.1+ or PowerShell 7 for the Windows setup commands below

## Fresh setup

1. Create the app user and both databases in MySQL. Replace the placeholders with private values that you control.

   In PowerShell, open the MySQL client with `mysql -u root -p` and run the SQL below, or use MySQL Workbench. If `mysql.exe` is not on `PATH`, start it with `& 'C:\Program Files\MySQL\MySQL Server 9.2\bin\mysql.exe' -u root -p`. You can also add that `bin` folder to the current PowerShell session with `$env:Path += ';C:\Program Files\MySQL\MySQL Server 9.2\bin'`.

   ```sql
   CREATE DATABASE IF NOT EXISTS eventease CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
   CREATE DATABASE IF NOT EXISTS eventease_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
   CREATE USER IF NOT EXISTS 'eventease_user'@'localhost' IDENTIFIED BY 'StrongLocalPassword123!';
   GRANT ALL PRIVILEGES ON eventease.* TO 'eventease_user'@'localhost';
   GRANT ALL PRIVILEGES ON eventease_test.* TO 'eventease_user'@'localhost';
   FLUSH PRIVILEGES;
   ```

   If you want a fresh reset, drop both databases before re-creating them, then run the schema and seed again.

2. Configure the backend environment file from the template in `eventease-backend`.

   ```powershell
   Set-Location .\eventease-backend
   Copy-Item .env.example .env
   notepad .env
   ```

   Required values:

   ```dotenv
   NODE_ENV=development
   PORT=5000
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_USER=eventease_user
   DB_PASSWORD=StrongLocalPassword123!
   DB_NAME=eventease
   JWT_SECRET=replace_with_a_long_random_secret
   JWT_EXPIRES_IN=1d
   CLIENT_ORIGIN=http://localhost:8000
   COOKIE_SECURE=false
   ```

3. Apply the schema and seed demo data.

   ```powershell
   Get-Content .\sql\schema.sql | mysql -u your_mysql_admin -p --database=eventease
   npm install
   npm run seed
   ```

   If `mysql.exe` is not on `PATH`, replace `mysql` with `& 'C:\Program Files\MySQL\MySQL Server 9.2\bin\mysql.exe'`.

   `eventease-backend/scripts/seed.js` creates local demo accounts and sample events. Their usernames/passwords are intentionally stored only in the ignored `DEMO.md` file and must never be reused outside the local demo.

4. Start the API and frontend in separate PowerShell windows.

   ```powershell
   Set-Location .\eventease-backend
   npm start
   ```

   ```powershell
   Set-Location .
   python -m http.server 8000 --bind 127.0.0.1
   ```

   Open `http://localhost:8000` in the browser. The API is available at `http://localhost:5000/api/v1` and `http://localhost:5000/api/v1/health` should return a healthy response after the database connection is ready.

   PowerShell note: use `Set-Location`, not `cd` in all examples, if you are copying commands directly from docs. If `python` is not found, use `py -m http.server 8000` instead.

## Project layout

- `assets/` — static frontend scripts and styles
- `about.html`, `index.html`, `login.html`, `register.html`, `explore.html`, `dashboard.html`, `organizer.html`, `admin.html`, etc. — frontend pages for the event booking demo
- `eventease-backend/src/` — Express app, routes, services, middleware, validators and database config
- `eventease-backend/sql/` — MySQL schema and setup scripts
- `eventease-backend/scripts/` — demo data seeding
- `eventease-backend/test/` — backend Node test runner coverage
- `e2e/` — Playwright browser flow checks against the static frontend and temporary API
- `EventEase_Test_Documents.xlsx` — scenarios, test cases, execution workbook and defect log
- `DEMO.md` — local-only demo credentials; ignored by version control in practice

## Tests

Run the backend suite from the API directory:

```powershell
Set-Location .\eventease-backend
npm test
```

Run the browser suite from the repo root:

```powershell
Set-Location .
cd .\e2e
npm install
npm run install:browsers
npm test
```

If Python is available only through the Windows launcher, set `$env:PYTHON = 'py'` before `npm test`; the E2E runner starts it with `py -3`.

The e2e runner uses `eventease_test`, creates a temporary test dataset, and then starts the backend on port 5100 with the frontend on `http://localhost:8100`.

## API summary

Base URL: `http://localhost:5000/api/v1`.

- Auth/profile: `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `PUT /auth/profile`, `PUT /auth/password`
- Public: `GET /categories`, `GET /events`, `GET /events/:id`, `POST /contact`
- User: `GET /bookings`, `GET /tickets`, `GET /notifications`, `GET /dashboard/summary`, `POST /bookings`, `POST /bookings/:id/cancel`
- Organizer: `GET /organizer/dashboard`, `GET /organizer/events`, `GET /organizer/events/:id/bookings`, `GET /organizer/bookings`, `GET /organizer/reports`
- Admin: `GET /admin/dashboard`, `GET /admin/events`, `GET /admin/users`, `GET /admin/organizer-requests`, `GET /admin/bookings`, `GET /admin/reports`

The API uses an httpOnly JWT cookie and returns success payloads in the shape `{ "success": true, "data": ... }`. See [eventease-backend/README.md](./eventease-backend/README.md) for endpoint details and configuration notes.

## Troubleshooting

- `ER_ACCESS_DENIED_ERROR`: verify the MySQL user exists, that the host is `localhost`, that the password matches `.env`, and that the user has grants on both `eventease` and `eventease_test`.
- `ECONNREFUSED`: make sure MySQL is running and that `DB_HOST`, `DB_PORT`, `PORT`, and the client URL match your local configuration.
- `EADDRINUSE`: another service is already using port 5000, 8000, 5100 or 8100. Stop that process or change the port in the environment and all matching URLs.
- CORS/cookie issues: serve the frontend from `http://localhost:8000` or `http://localhost:8100`, never via `file://`, keep `CLIENT_ORIGIN` aligned with the exact host, and keep `COOKIE_SECURE=false` for local HTTP.
- Database/test connectivity issues: verify `eventease-backend/.env` points to the correct user and database, and that the same app credentials can access `eventease_test` for the e2e and integration tests.

## Known limitations

- Payments are not processed; booking payment rows are explicitly marked as `Not Processed` and there is no real payment gateway.
- Email delivery is not implemented; booking and system notices are stored in-app.
- Password reset is not implemented; the forgot-password page is informational only and the app does not send reset emails.
- QR scanning and verification are not implemented; QR payloads are generated for display only and the app does not verify tickets at the door.
- The frontend is a static HTML/CSS/JavaScript demo, not a React/Vite or full SPA build.
- This is configured for localhost-only development and testing; no production TLS, secure cookies, or deployment hardening is included.
- Seed/demo credentials are local-only. Keep them in `DEMO.md`, rotate them before any shared deployment, and never treat the demo accounts as production credentials.

## Clean reset checklist

When you want a fresh local demo state:

```powershell
mysql -u your_mysql_admin -p -e "DROP DATABASE IF EXISTS eventease; DROP DATABASE IF EXISTS eventease_test; CREATE DATABASE eventease CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci; CREATE DATABASE eventease_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
Set-Location .\eventease-backend
Get-Content .\sql\schema.sql | mysql -u your_mysql_admin -p --database=eventease
npm run seed
```

If `mysql.exe` is not on `PATH`, replace `mysql` with `& 'C:\Program Files\MySQL\MySQL Server 9.2\bin\mysql.exe'`.

`eventease-backend/sql/schema.sql` creates tables if they do not already exist and does not drop the database first, so a full clean reset is best done by dropping the target database before re-running the schema script.
