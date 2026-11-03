# EventEase Backend

REST API for the EventEase static frontend. It is built with Node.js ES modules, Express, MySQL, JWT httpOnly cookies, bcrypt, Zod validation, and QR ticket generation for local demo usage.

## Requirements

- Node.js 20 or newer and npm
- MySQL 8.0.16 or newer (validated locally with MySQL 9.2)
- A local MySQL user with permission on both `eventease` and `eventease_test`
- PowerShell on Windows or a compatible shell for the setup commands below

## Database and environment setup

Create the two databases and a dedicated application user in MySQL, replacing placeholders with private values:

```sql
CREATE DATABASE eventease CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE eventease_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'eventease_user'@'localhost' IDENTIFIED BY 'StrongLocalPassword123!';
GRANT ALL PRIVILEGES ON eventease.* TO 'eventease_user'@'localhost';
GRANT ALL PRIVILEGES ON eventease_test.* TO 'eventease_user'@'localhost';
FLUSH PRIVILEGES;
```

From this directory, create `.env` from the template and set your local values. `.env` is intentionally ignored by Git:

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

Apply the schema and seed the local development data:

```powershell
mysql -u your_mysql_admin -p --database=eventease < .\sql\schema.sql
npm install
npm run seed
```

Then start the API:

```powershell
npm start
```

The API listens at `http://localhost:5000`; `GET /api/v1/health` verifies the database connection and application health. Run the static frontend from the repo root using `python -m http.server 8000 --bind 127.0.0.1`, then open `http://localhost:8000`. Do not use `file://`.

## Resetting the demo database

`eventease-backend/sql/schema.sql` creates tables if they do not already exist; it does not drop the database at the top. For a completely clean demo state, drop the target database first and then rerun the schema file and seed script.

```powershell
mysql -u your_mysql_admin -p -e "DROP DATABASE IF EXISTS eventease; DROP DATABASE IF EXISTS eventease_test; CREATE DATABASE eventease CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci; CREATE DATABASE eventease_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
mysql -u your_mysql_admin -p --database=eventease < .\sql\schema.sql
npm run seed
```

## Tests

Backend tests use `node --test` and cover the API flows with a dedicated `eventease_test` database. The app account must have privileges on that database before you run the suite.

```powershell
npm test
npm run test:integration
```

Browser E2E checks live under the repo-level `e2e/` folder and are run separately:

```powershell
Set-Location ..
cd .\e2e
npm install
npm run install:browsers
npm test
```

The backend and browser suites are separate. Do not infer browser coverage from the Node API tests alone.

## API overview

Base path: `/api/v1`. Successful responses use `{ "success": true, "data": ... }`; errors use `{ "success": false, "message": ..., "errors"?: ... }`.

- Auth: `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `PUT /auth/profile`, `PUT /auth/password`
- Public: `GET /categories`, `GET /events`, `GET /events/:id`, `POST /contact`
- User: `GET /bookings`, `GET /tickets`, `GET /notifications`, `GET /dashboard/summary`, `POST /bookings`, `POST /bookings/:id/cancel` (or the cancel route used by the app)
- Organizer: `GET /organizer/dashboard`, `GET /organizer/events`, `GET /organizer/events/:id/bookings`, `GET /organizer/bookings`, `GET /organizer/reports`
- Admin: `GET /admin/dashboard`, `GET /admin/events`, `GET /admin/users`, `GET /admin/organizer-requests`, `GET /admin/bookings`, `GET /admin/reports`, `GET /admin/categories` and `GET /admin/activity`

Authentication uses an httpOnly JWT cookie. Ticket responses include a PNG data URL QR code containing only the ticket ID and booking ID; cancelled and past bookings are excluded from the current app flow.

## Security

- Passwords use bcrypt cost 12 and are never returned in API responses.
- SQL statements are parameterized; dynamic update keys use allowlists.
- Authentication reloads role and status from MySQL; blocked users cannot continue with an active cookie.
- Helmet, request size limits, Morgan, Zod validation, and separate authentication/API rate limits are enabled.
- Booking and cancellation flows rely on transactions and row locks.
- Use TLS, `COOKIE_SECURE=true`, strong production secrets, and migration tooling before deployment.

## Known limitations

- Payments are not processed; bookings show `Not Processed` and there is no real payment gateway.
- Email delivery is not implemented. User notifications are stored inside the app and shown in the UI.
- Password reset is not implemented; the forgot-password page is informational only and the app does not send reset emails.
- QR scanning and verification are not implemented.
- The frontend is static HTML/CSS/JavaScript rather than a React/Vite build.
- The project is configured for localhost-only use; it is not hardened for TLS or production deployment.
- Seed/demo credentials are for local use only. Keep them in the ignored `DEMO.md`, rotate or remove them before any shared deployment, and never use them as production credentials.

## Troubleshooting

- `ER_ACCESS_DENIED_ERROR`: verify the MySQL user exists, the password is correct, the host is `localhost`, and the grant set includes both `eventease` and `eventease_test`.
- `ECONNREFUSED`: confirm MySQL is running and that `DB_HOST`, `DB_PORT`, `PORT`, and the client origin match your local environment.
- `EADDRINUSE`: another process is already bound to port 5000, 8000, 5100 or 8100. Stop that process or set a different port in `.env` and the matching frontend URL.
- CORS or cookie problems: serve the site on `http://localhost:8000` or `http://localhost:8100`, never via `file://`, keep `CLIENT_ORIGIN` aligned with the exact host, and keep `COOKIE_SECURE=false` for local HTTP.
- Integration or browser tests fail to connect: verify the `.env` file contains the correct `eventease_test` credentials and that the app user can access that database.
