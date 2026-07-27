# FieldForce Activity Tracker — Turso backend

This wires the "Log Activity" form (and the rest of the dashboard) up to a
real Turso database instead of an in-memory array. Activities are now
created and read through a small Express API; the browser never talks to
Turso directly.

## 1. Install dependencies

```bash
npm install
```

## 2. Set up your Turso database

If you don't already have one for this project:

```bash
turso db create fieldforce-tracker
turso db show fieldforce-tracker --url
turso db tokens create fieldforce-tracker
```

## 3. Configure environment variables

```bash
cp .env.example .env
```

Fill in `.env`:

```
TURSO_DATABASE_URL=libsql://your-database-name-your-org.turso.io
TURSO_AUTH_TOKEN=your-turso-auth-token
PORT=3000
```

Never commit `.env` — add it to `.gitignore` if it isn't already.

## 4. Run it

```bash
npm start
```

The server creates the `activities` table automatically on first boot if
it doesn't exist yet, then serves the dashboard at `http://localhost:3000`.

## What changed vs. the static version

- `DB.activities` is now just an in-memory **cache** of whatever the API
  returns — the source of truth is Turso.
- On login, the frontend calls `GET /api/activities?userIds=...` scoped to
  whichever user IDs the logged-in person is allowed to see (their own for
  Field Executives, their team's for Team Leads, everyone's for Managers).
- Submitting the "Log Activity" form calls `POST /api/activities`, which
  inserts a row into Turso and returns it; the row is then prepended to the
  local cache so the UI updates immediately.
- The refresh button now re-fetches from the API rather than just
  re-rendering stale local data.
- The random `seedData()` generator is gone — the dashboard now reflects
  whatever's actually in your Turso database (starts empty).

## Known limitation — login is still client-side

The sign-in form still checks username/password against a hardcoded list
inside the page's JavaScript, same as before. That's fine for testing this
permission model, but it isn't real security: anyone who views page source
can read the three passwords, and the `userIds` scoping on the API request
is advisory only — nothing on the server currently verifies who's asking.

The API endpoints in `server.js` are unauthenticated. Before pointing real
users at this outside of a private testing setting, the natural next step
is to move login server-side (e.g. a `/api/login` route that checks a
`users` table with hashed passwords and issues a session cookie or JWT),
then have `/api/activities` require and trust that session instead of a
client-supplied `userIds` list. Happy to build that next if useful.
