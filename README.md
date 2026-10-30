# RSchedule

Create your UCR schedule in seconds.

RSchedule is a free schedule builder for UC Riverside students. Pick your courses, set your preferred hours and any busy times (work, practice, etc.), and it generates up to three conflict-free schedules ranked by fewest gaps between classes, with live seat counts pulled from UCR's registration system.

> RSchedule is an independent student project. It is not affiliated with, endorsed by, or sponsored by UCR. Seat counts can be stale by a few minutes. Always register through UCR's official system.

## Features

- **Live seat counts** from UCR, with a "Refresh seats" button for fresh numbers during registration.
- **No overlapping classes.** Lectures, discussions, and labs are linked correctly, so every schedule is registrable as shown.
- **Busy times.** Block out recurring commitments; the scheduler never places a class on top of them.
- **Time range preference** for the earliest and latest class you'll accept.
- **Calendar view** with class details, GE fulfillments, and a one-click copy for each CRN.
- **PNG export** of any generated schedule.
- **Remembers your setup** (courses, hours, busy times) between visits.

## How it works

```
frontend (React + Vite)  ->  backend (Express)  ->  UCR registration (Banner)
                                  |
                              Upstash Redis (cache + rate limit)
```

- The **backend** fetches section data from UCR, groups sections into registrable bundles (a lecture plus its linked discussion/lab options), and runs the scheduler. The scheduler is a backtracking search with arc-consistency pruning; see `backend/src/services/scheduler.ts`.
- UCR searches are stateful and run one at a time per term, so results are cached in Redis (bundles for 6 hours, seat counts for 3 minutes) and identical in-flight lookups share a single UCR search.
- The **frontend** is a single-page React app. A `/generate` call is pure computation on data already fetched, so tweaking preferences never re-queries UCR.

## Repository layout

```
backend/    Express API, scheduler, UCR client, cache, tests
frontend/   React + TypeScript + Vite + Tailwind app
.github/    CI (tests), nightly cache warm-up, keep-warm ping
```

## Running locally

Requires Node 22+.

```bash
# Backend (http://localhost:3001)
cd backend
cp .env.example .env     # optional, see below
npm ci
npm run dev

# Frontend (http://localhost:5173), in a second terminal
cd frontend
npm ci
npm run dev
```

In dev, Vite proxies `/terms`, `/subjects`, `/course-codes`, `/section-attributes`, `/courses`, and `/generate` to the backend, so no frontend configuration is needed.

### Environment variables

Backend (`backend/.env`):

| Variable | Purpose |
|---|---|
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis credentials for caching and rate limiting. Optional locally: without them the app still runs, but nothing is cached and Redis errors are logged. |
| `RATE_LIMIT_MAX` | Max requests per IP per minute. Optional, defaults to 600. |

Frontend:

| Variable | Purpose |
|---|---|
| `VITE_API_BASE_URL` | Backend URL, set at build time for production (the frontend and backend are separate deployments). Leave unset locally. |

## Tests

```bash
cd backend && npm test        # scheduler, validation, rate limiter, cache fallbacks
cd frontend && npm run lint && npm run build
```

CI runs type-checks, tests, and builds for both projects on every pull request to `main`.

## Deployment

Both projects deploy to Vercel from `main` as separate projects:

- **Backend:** the Express app is exported as a serverless function (`backend/api/index.ts`) with a 20-second max duration.
- **Frontend:** a static Vite build; set `VITE_API_BASE_URL` to the backend's URL.

Scheduled GitHub Actions keep things fast:

- `warm-cache.yml` warms the autocomplete cache (subjects and course codes) for open terms nightly. It can also be run by hand from the Actions tab, for example right before registration opens. Requires the Upstash secrets in the repository settings.
- `keep-warm.yml` pings `/health` every 10 minutes to avoid serverless cold starts.

## Limits and design choices

- Schedules are limited to **6 courses**, because each uncached course is a serialized live UCR search.
- The API is rate limited per IP (default 600/min). If Redis is unavailable, the limiter and cache fail open so the app keeps working, just more slowly and with more load on UCR.
- Seat counts are intentionally cached for only 3 minutes so they stay close to live.

## Contributing

Issues and pull requests are welcome. Please branch from `main`, keep changes focused, and make sure the tests and build pass before opening a PR.
