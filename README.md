# EventEase

EventEase is a local online event booking and management project. The frontend is static HTML/CSS/JavaScript; the API is Node.js/Express; MySQL stores application data.

## Requirements

- Node.js 20 or newer and npm
- MySQL 8.0.16 or newer (tested locally with MySQL 9.2)
- Python 3 for the static frontend server

## Fresh setup

1. Create the development and test databases and a dedicated MySQL account in MySQL Workbench (replace the username/password placeholders with private values):

   ```sql
   CREATE DATABASE eventease CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
   CREATE DATABASE eventease_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
   CREATE USER 'your_database_user'@'localhost' IDENTIFIED BY 'your_private_password';
   GRANT ALL PRIVILEGES ON eventease.* TO 'your_database_user'@'localhost';
   GRANT ALL PRIVILEGES ON eventease_test.* TO 'your_database_user'@'localhost';
   FLUSH PRIVILEGES;
   ```

2. Configure and seed the development database:

   ```powershell
   Set-Location .\eventease-backend
   Copy-Item .env.example .env
   # Edit .env with your private DB_USER, DB_PASSWORD and a random JWT_SECRET (32+ characters).
   Get-Content .\sql\schema.sql | mysql -u your_mysql_admin -p
   npm install
   npm run seed
   ```

   The seed creates local demo accounts and sample events. Their credentials belong only in your ignored `DEMO.md`; never deploy seeded credentials.

3. Start the API and frontend in separate PowerShell windows:

   ```powershell
   Set-Location .\eventease-backend
   npm start
   ```

   ```powershell
   Set-Location .
   python -m http.server 8000
   ```

   Open `http://localhost:8000`. Check API/database readiness at `http://localhost:5000/api/v1/health`.

## Project layout

- `assets/` — static frontend JavaScript and styles
- `eventease-backend/src/` — Express app, routes, services, middleware and validators
- `eventease-backend/sql/` — MySQL schema
- `eventease-backend/scripts/` — seed script
- `eventease-backend/test/` — Node test-runner smoke and MySQL integration tests
- `EventEase_Test_Documents.xlsx` — scenario, case, execution and defect workbook

## Tests

The backend test suite also creates/seeds and modifies **only** `eventease_test`; grant the app account privileges on that database:

```powershell
Set-Location .\eventease-backend
npm test
```

Automated browser end-to-end tests are not currently included. Browser checks recorded in the workbook were run manually against the local frontend and API.

## API overview

Base URL: `http://localhost:5000/api/v1`.

- Authentication/profile: `/auth/register`, `/auth/login`, `/auth/logout`, `/auth/me`, `/auth/profile`, `/auth/password`
- Public discovery: `/categories`, `/events`, `/events/:id`, `/contact`
- User booking: `/bookings`, `/bookings/:id`, `/bookings/:id/cancel`, `/tickets`, `/notifications`, `/dashboard/summary`
- Organizer: `/organizer/events`, `/organizer/bookings`, `/organizer/reports`
- Admin: `/admin/events`, `/admin/users`, `/admin/organizer-requests`, `/admin/reports`

The API uses an httpOnly JWT cookie and `{ "success": true, "data": ... }` success responses. See [eventease-backend/README.md](./eventease-backend/README.md) for endpoint and configuration details.

## Troubleshooting

- `ER_ACCESS_DENIED_ERROR`: check the MySQL account, host, password and grants for both `eventease` and `eventease_test`; then verify the backend `.env`.
- `ECONNREFUSED`: start MySQL and the API, then check `DB_HOST`, `DB_PORT`, and `PORT`.
- `EADDRINUSE`: another process is using port 8000, 5000 or 5001; stop that specific process or configure an unused port and matching URLs.
- CORS/cookie/session issues: open the frontend via `http://localhost:8000` (not `file://`), set `CLIENT_ORIGIN=http://localhost:8000`, keep `COOKIE_SECURE=false` for local HTTP, and use the same hostname (`localhost`) for UI and API.
- Integration tests fail to connect: verify the ignored backend `.env` has credentials for `eventease_test` and that the database user has access to that separate test database.

## Known limitations

- Payments are not processed; bookings explicitly show `Not Processed`. A test-mode payment gateway is a future extension.
- Password reset is not implemented; the login link is hidden and the direct page states the limitation.
- Email notifications are not sent; booking and system notifications are stored in-app.
- The frontend is static HTML/CSS/JavaScript; there is no React/Vite build.
- Seed/demo credentials are local-only. Keep them in the ignored `DEMO.md`, rotate them before any shared deployment, and never treat the demo accounts as production accounts.
- QR codes encode only a ticket ID and booking ID. Ticket scanning/verification and reminders are future work.
- Configure TLS, `COOKIE_SECURE=true`, production secrets and schema migrations before deployment.
