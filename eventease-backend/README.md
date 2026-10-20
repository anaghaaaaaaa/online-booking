# EventEase Backend

REST API for the EventEase static frontend. Built with Node.js ES modules, Express, MySQL, JWT httpOnly cookies, bcrypt, Zod validation, and QR ticket generation.

## Requirements

- Node.js 20 or newer and npm
- MySQL 8.0.16 or newer (local project environment: MySQL 9.2)

## Database and environment setup

Create the two databases and a dedicated application user in MySQL Workbench, replacing placeholders with private values:

```sql
CREATE DATABASE eventease CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE eventease_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'your_database_user'@'localhost' IDENTIFIED BY 'your_private_password';
GRANT ALL PRIVILEGES ON eventease.* TO 'your_database_user'@'localhost';
GRANT ALL PRIVILEGES ON eventease_test.* TO 'your_database_user'@'localhost';
FLUSH PRIVILEGES;
```

From this directory, create `.env` from the template and set private values. `.env` is ignored by Git:

```powershell
Copy-Item .env.example .env
```

Required values:

```dotenv
NODE_ENV=development
PORT=5000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=your_database_user
DB_PASSWORD=your_database_password
DB_NAME=eventease
JWT_SECRET=replace_with_a_long_random_secret
JWT_EXPIRES_IN=1d
CLIENT_ORIGIN=http://localhost:8000
COOKIE_SECURE=false
```

Execute `sql/schema.sql` in MySQL Workbench or with `mysql -u your_mysql_admin -p < sql/schema.sql`. Then install and seed the local development data:

```powershell
npm install
npm run seed
npm start
```

The API listens at `http://localhost:5000`; `GET /api/v1/health` verifies both API and database readiness. Run the static frontend from the repository root using `python -m http.server 8000` and open `http://localhost:8000`. Do not use `file://`.

## Tests

`npm test` runs database-independent smoke tests and MySQL integration tests. Integration setup and cleanup are scoped to `eventease_test`; the application account must have privileges on that database. It covers registration/auth, authorization, organizer ownership, concurrent bookings, cancellation/seat restoration, the 24-hour cancellation limit, and ticket QR generation.

```powershell
npm test
npm run test:integration
```

Browser end-to-end automation is not included yet. Use the static frontend manually with the API running; do not infer browser E2E coverage from backend tests.

## API overview

Base path: `/api/v1`. Successful responses use `{ "success": true, "data": ... }`; errors use `{ "success": false, "message": ..., "errors"?: ... }`.

- Auth: `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `PUT /auth/profile`, `PUT /auth/password`
- Public: `GET /categories`, `GET /events`, `GET /events/:id`, `POST /contact`
- User: `/bookings`, `/bookings/:id`, `/bookings/:id/cancel`, `/tickets`, `/dashboard/summary`, `/notifications`, `/organizer-requests`
- Organizer: `/organizer/dashboard`, `/organizer/events`, `/organizer/events/:id/bookings`, `/organizer/bookings`, `/organizer/reports`
- Admin: `/admin/dashboard`, `/admin/events`, `/admin/users`, `/admin/organizer-requests`, `/admin/bookings`, `/admin/categories`, `/admin/reports`, `/admin/activity`

Authentication uses a signed JWT in an httpOnly cookie. Ticket responses include a PNG data URL QR code containing only the ticket ID and booking ID; cancelled and past bookings are excluded.

## Security

- Passwords use bcrypt cost 12; password hashes and credentials are excluded from API response projections.
- Values in SQL statements are parameterized; dynamic update fields are selected from allowlists.
- Authentication reloads role/status from MySQL; blocked users cannot continue using an existing session.
- Helmet, request-size limits, Morgan, Zod validation, and separate authentication/API rate limits are enabled.
- Booking and cancellation flows use transactions and row locks.
- Use TLS, `COOKIE_SECURE=true`, private random production secrets, and migration tooling before deployment.

## Known limitations

- Password reset is not implemented; the login page does not advertise it and the direct page explains the limitation.
- Payments are not processed; bookings show `Not Processed`. A test-mode payment gateway is a future extension.
- Email delivery is not implemented. User notifications are stored and displayed in the application.
- The frontend is static HTML/CSS/JavaScript rather than React/Vite.
- QR scanning/verification and event reminders are not implemented.
- Seed/demo credentials are for local use only. Keep credentials in the ignored `DEMO.md`, rotate/remove them before shared deployment, and never use them in production.
