# UTM Navigator

A web application for managing campaign URLs, resolving redirect chains through country-specific Bright Data proxies, scheduling bulk resolution jobs, and reviewing resolution, usage, timing, and activity reports.

## Features

- Create, edit, search, filter, import, export, and refresh campaign URLs.
- Resolve a URL in a selected country and inspect its final destination and country verification result.
- Import scheduled URL jobs from CSV or XLSX, then pause, resume, cancel, or reschedule jobs and review their results.
- Review request-level resolution attempts, failure reasons, regional outcomes, and timing statistics.
- Manage users and role assignments through the admin interface.
- Responsive dashboard UI with shared navigation and role-aware menu items.
- Optional browser connection reuse, configurable concurrency and navigation timeout, and structured resolution logs.

## Requirements

- Node.js 18 or later and npm.
- MySQL 8 or a compatible MySQL server. Create the database before starting the app; the app creates and updates its tables on startup.
- A Bright Data account with a Scraping Browser zone and proxy credentials. Add a country proxy entry for each country the app should use.

## Run locally

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env` file in the project root. Add the required settings shown below and replace the sample values with your own credentials.

   ```env
   PORT=8080
   NODE_ENV=development
   SECRET_SESSION_KEY=replace-with-a-long-random-secret
   ALLOWED_ORIGINS=http://localhost:8080
   NAVIGATION_TIMEOUT=your-preferred-timeout-in-miliseconds

   # Rate Limit Settings
   RATE_LIMIT=100
   ENABLE_RATE_LIMIT=true/false

   # Database connection details
   MYSQL_HOST=127.0.0.1
   MYSQL_PORT=3306
   MYSQL_USER=replace-with-your-database-user
   MYSQL_PASSWORD=replace-with-your-database-password
   MYSQL_DB=replace-with-your-database-url (if using any cloud database like clevercloud)

   # Browser & schedule configs setting
   BROWSER_REUSE_ENABLED=false
   RESOLUTION_CONCURRENCY=3
   MAX_ACTIVE_RESOLUTIONS=12
   MAX_ACTIVE_PER_REGION=3

   # Enable wipe (set to "true" to allow truncation)
   DB_WIPE_ENABLED=true

   # Timezone (optional - defaults to Asia/Kolkata)
   WIPE_TIMEZONE=Asia/Kolkata

   # Cron time (optional - defaults 23:59)
   WIPE_HOUR=23
   WIPE_MINUTE=59

   # Wipe Dry run - set true to run without deleting data just to test connection
   WIPE_DRY_RUN=false

   #Force Wipe - set true to force wipe the data
   FORCE_WIPE=false

   #Run Now - set true to run as soon as you run the script
   RUN_NOW=false

   #Exit - set true to auto exit after execution
   EXIT_AFTER_RUN=false

   #Wipe only table - mention table name for testing if truncate working or not
   WIPE_ONLY_TABLE=

   # Brightdata Account API Key
   BRIGHTDATA_API_KEY=replace-with-your-api-key

   # Brightdata zone details
   BRIGHTDATA_ZONE=replace-with-your-zone-name
   BRIGHTDATA_HOST=replace-with-your-zone-host
   BRIGHTDATA_USERNAME=replace-with-your-zone-username
   BRIGHTDATA_PASSWORD=replace-with-your-zone-password
   BRIGHTDATA_PORT=replace-with-your-zone-port

   # Add the countries you need, for example:
   # BRIGHTDATA_US_PROXY=brd-customer-CUSTOMER_ID-zone-ZONE_NAME-country-us
   # BRIGHTDATA_CA_PROXY=brd-customer-CUSTOMER_ID-zone-ZONE_NAME-country-ca
   # BRIGHTDATA_GB_PROXY=brd-customer-CUSTOMER_ID-zone-ZONE_NAME-country-gb

   # Optional: create the first Admin account when the database has no users.
   ADMIN_NAME=Admin
   ADMIN_USERNAME=admin
   ADMIN_EMAIL=admin@example.com
   ADMIN_PASSWORD_HASH=replace-with-a-bcrypt-hash
   ```

   Generate a bcrypt hash for the initial admin password with:

   ```bash
   node -e "console.log(require('bcrypt').hashSync('replace-this-password', 10))"
   ```

   `ALLOWED_ORIGINS` must contain the exact browser origin, including scheme and port. For a local server on port 8080, use `http://localhost:8080`. If you access it through `http://127.0.0.1:8080`, add that origin too, comma separated. Keep `.env` private and do not commit credentials.

3. Start the app:

   ```bash
   npm run dev
   ```

   Or run the production server with `npm start`. Both commands start the web server and its scheduled-job worker. Open [http://localhost:8080](http://localhost:8080).

The server requires a reachable MySQL database, a `SECRET_SESSION_KEY`, and `ALLOWED_ORIGINS`. If there are no users yet, it creates the initial Admin only when `ADMIN_USERNAME` and `ADMIN_PASSWORD_HASH` are set. Otherwise, register an account at `/signup` and approve it through an Admin account.

## Country proxy setup

The country dropdown is populated from proxy environment variables that are configured. Each entry uses the two-letter ISO country code in the variable name and proxy zone string, for example `BRIGHTDATA_US_PROXY` and `BRIGHTDATA_CA_PROXY`. The app uses `BRIGHTDATA_PASSWORD` to connect to the configured Bright Data Scraping Browser proxy. The requested country and detected exit country are reported when country verification is available; a verification lookup may be unavailable even when navigation resolves successfully.

Use only countries enabled in the Bright Data zone. `BRIGHTDATA_API_KEY` and `BRIGHTDATA_ZONE` are used for Bright Data usage analytics.

## User roles

| Role | Access |
| --- | --- |
| **Admin** | All application pages and reports, campaign and scheduler tools, user management, and signup approvals. Admin activity reports can include all users. |
| **Coordinator** | Scheduled jobs, job results, Activity logs for their own account, and My Account. |
| **Analytics** | Usage Analytics, Resolution Stats, Timing Stats, and My Account. |
| **Subscriber** | Campaigns, Activity logs for their own account, and My Account. |

The User Management page also includes this access guide for admins assigning roles.

## Main pages

- **Campaigns:** `/` — manage campaign URLs and run URL resolutions.
- **Scheduled jobs:** `/scheduler/schedule.html` — upload and manage scheduled jobs.
- **Job results:** `/scheduler/scheduled-results.html` — review resolved and failed rows.
- **Activity logs:** `/dashboard.html` — view and filter activity records.
- **Usage Analytics:** `/analytics/stats.html` — review Bright Data usage by date and export usage data.
- **Resolution Stats:** `/resolution-stats/resolutions.html` — inspect successful and failed attempts by region and examine failed URL details.
- **Timing Stats:** `/time-stats/time-stats.html` — review resolution durations by date.
- **User Management:** `/user-management.html` — Admin-only user and role management.
- **Signup approvals:** `/signup-requests.html` — Admin-only registration approvals.

## Scheduled jobs and data retention

The server worker checks for due jobs every 10 seconds. A job can be paused, resumed, cancelled, or rescheduled from the scheduled jobs interface. When a control request arrives during processing, the current URL attempt is allowed to finish before the worker reaches a control checkpoint. Resuming continues from saved progress.

The optional monthly cleanup is a separate process. To run it, set `DB_WIPE_ENABLED=true` and start it in its own terminal:

```bash
node db-monthly-wipe.js
```

It checks daily at 23:59 in `Asia/Kolkata` by default and performs cleanup only on the final day of the month. It retains future jobs, including jobs scheduled for the first day of the next month, and active or unfinished jobs. Cleanup options include `WIPE_TIMEZONE`, `WIPE_HOUR`, `WIPE_MINUTE`, `WIPE_DRY_RUN`, `FORCE_WIPE`, and `WIPE_ONLY_TABLE`. Review `db-monthly-wipe.js` before enabling cleanup in production.

Resolution attempt reports include the most recent 31 days. When monthly cleanup is enabled, it also prunes older attempt records. Resolution summary statistics reset daily at midnight according to the server's local timezone.

## Configuration reference

| Variable | Required | Purpose |
| --- | --- | --- |
| `PORT` | No | Web server port; defaults to `8080`. |
| `NODE_ENV` | No | Set to `production` for production cookie behavior. |
| `SECRET_SESSION_KEY` | Yes | Secret used to sign session cookies. |
| `ALLOWED_ORIGINS` | Yes | Comma-separated exact browser origins allowed by CORS. |
| `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_USER`, `MYSQL_PASSWORD`, `MYSQL_DB` | Yes | MySQL connection settings (`MYSQL_PORT` defaults to `3306`). |
| `BRIGHTDATA_PASSWORD` | Yes for resolution | Password for Bright Data proxy/Scraping Browser access. |
| `BRIGHTDATA_<COUNTRY>_PROXY` | Per country | Bright Data proxy zone identifier, e.g. `BRIGHTDATA_US_PROXY`. |
| `BRIGHTDATA_API_KEY`, `BRIGHTDATA_ZONE` | For usage analytics | Bright Data API key and zone name. |
| `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH` | Optional | Bootstrap the first Admin account when the user table is empty. `ADMIN_NAME` and `ADMIN_EMAIL` are optional profile fields. |
| `BROWSER_REUSE_ENABLED` | No | Defaults to `false`; `true` reuses browser connections isolated by country. |
| `NAVIGATION_TIMEOUT` | No | Navigation timeout in milliseconds. |
| `RESOLUTION_CONCURRENCY` | No | Scheduled worker resolution concurrency (default `3`, bounded to 1–8). |
| `MAX_ACTIVE_RESOLUTIONS` | No | Maximum concurrent resolutions per server process (default `12`). |
| `MAX_ACTIVE_PER_REGION` | No | Maximum concurrent resolutions per country (default `3`). |
| `ENABLE_RATE_LIMIT`, `RATE_LIMIT` | No | Enable resolver endpoint rate limiting (enabled by default); request limit defaults to 100 per five minutes. |

## API overview

All endpoints below are served by the Node.js application. Endpoints that operate on user data require a valid session; Admin-only and Admin/Coordinator endpoint restrictions are noted. For exact response shapes, refer to the route implementation in `server.js`.

### URL resolution

```http
GET /resolve?url=<URL>&region=<COUNTRY_CODE>&uaType=<desktop|mobile|random>
GET /resolve-multiple?url=<URL>&regions=<COUNTRY_CODES>&uaType=<desktop|mobile|random>
```

`region` defaults to `US`; `uaType` defaults to `random`. The response includes the final URL, requested and detected country details when available, country match, request ID, duration, and any error information.

### Schedules and results (Admin or Coordinator)

```http
POST   /api/schedule
GET    /api/schedules
PATCH  /api/schedules/:id
POST   /api/schedules/:id/control
DELETE /api/schedules/:id
GET    /api/scheduled-results
PUT    /api/scheduled-results/:id
DELETE /api/scheduled-results/:id
DELETE /api/scheduled-results/all
```

Upload a CSV or XLSX file as `scheduleFile` with a `scheduledAt` timestamp. CSV/XLSX input should include a URL column; optional columns can specify notes/tags, country/region, and user-agent type. Control actions support pausing, resuming, and cancelling jobs.

### Analytics and resolution records

```http
GET /zone-usage?from=<YYYY-MM-DD>&to=<YYYY-MM-DD>
GET /time-stats?start=<YYYY-MM-DD>&end=<YYYY-MM-DD>
GET /api/resolution-stats?from=<YYYY-MM-DD>&to=<YYYY-MM-DD>&region=<COUNTRY_CODE>
GET /api/resolution-attempts?from=<YYYY-MM-DD>&to=<YYYY-MM-DD>&region=<COUNTRY_CODE>
GET /api/regions
```

The stats pages present these data with date and region filters. Failed attempts include a failure reason and request details where available.

### Authentication and account

```http
POST /login
POST /api/auth/register
GET  /api/auth/me
PUT  /api/auth/me
GET  /logout
```

New registrations require Admin approval. An Admin may also create users directly through User Management.

### Users (Admin only)

```http
GET    /api/users?q=<SEARCH>&page=<PAGE>&pageSize=<SIZE>
POST   /api/users
PUT    /api/users/:id
DELETE /api/users/:id
POST   /api/users/:id/approve
POST   /api/users/:id/reject
```

### Activity logs

```http
GET  /api/activities?page=<PAGE>&pageSize=<SIZE>&action=<ACTION>&username=<USERNAME>&from=<DATE>&to=<DATE>
POST /api/activities
```

Non-Admin users see their own activity records; Admins can review activity across users.

### Health and utilities

```http
GET /ping
GET /system-info
GET /puppeteer-status
GET /ip
```

## Development scripts

```bash
npm run dev  # Start server with nodemon
npm start     # Start production server
```

## Tech stack

- Node.js, Express, and MySQL
- Puppeteer Core and Bright Data Scraping Browser
- HTML, CSS, and JavaScript frontend
- CSV/XLSX import and export support

## License

See the repository's `LICENSE` file if present.