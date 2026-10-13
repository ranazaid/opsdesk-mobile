# OpsDesk Mobile

[![CI](https://github.com/ranazaid/opsdesk-mobile/actions/workflows/ci.yml/badge.svg)](https://github.com/ranazaid/opsdesk-mobile/actions/workflows/ci.yml)
[![Security](https://github.com/ranazaid/opsdesk-mobile/actions/workflows/security.yml/badge.svg)](https://github.com/ranazaid/opsdesk-mobile/actions/workflows/security.yml)
![Expo SDK 57](https://img.shields.io/badge/Expo-SDK%2057-000020?logo=expo)
![TypeScript strict](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)

**An offline-first iOS and Android app for support agents, built with React Native, Expo and TypeScript.**

OpsDesk Mobile is the companion app for **OpsDesk**, a multi-tenant support-ticket SaaS. The web app and REST API live in **[ranazaid/opsdesk-web](https://github.com/ranazaid/opsdesk-web)**. With this app, agents can triage their queue, reply to customers and change ticket status from their phone, including on a train with no signal. Writes made offline are queued, shown straight away and replayed in order when the connection returns.

If no API URL is configured, the app runs in **demo mode** against an in-memory backend with seeded tickets. You can open it in Expo Go and explore every role without setting up a server.

> **Portfolio reference implementation:** patterns from production apps I've shipped to the App Store and Play Store, rebuilt from scratch with demo data.

| Sign in (demo mode) | Ticket queue | Ticket + AI summary | Offline reply (dark) | Role & settings (dark) |
| :---: | :---: | :---: | :---: | :---: |
| ![Login](docs/screenshots/login.png) | ![Ticket list](docs/screenshots/ticket-list.png) | ![Ticket detail](docs/screenshots/ticket-detail.png) | ![Offline reply](docs/screenshots/offline-reply-dark.png) | ![Profile](docs/screenshots/profile-dark.png) |

<sub>I captured these screenshots from the web target (`npx expo start --web`) at phone width in demo mode. The iOS and Android builds render the same React Native UI.</sub>

---

## Features

- **Ticket queue:** debounced search (subject, customer, `#number`, tags), status filter chips, cursor-based infinite scroll and pull-to-refresh. Pull-to-refresh also flushes the outbox.
- **Ticket detail:** the full conversation, a reply composer, and status, priority and assignee controls. Each control is shown or hidden by the shared permission matrix.
- **AI summary card:** calls `POST /ai/summary` and shows a short summary plus a suggested reply. The *Use as reply* button drops the suggestion into the composer.
- **Create ticket:** form validated with zod, with clear messaging when you're offline.
- **Profile & settings:** your role and what it allows, a System/Light/Dark theme picker, sync status, push status, and sign out.
- **Offline-first:**
  - Comments and status/priority/assignee changes go through a persisted **outbox**.
  - The UI updates optimistically.
  - The outbox replays on reconnect, on app foreground and when backoff expires.
  - The query cache is persisted, so the queue opens instantly, even with no connection.
- **Auth:**
  - The JWT is stored in `expo-secure-store` (Keychain/Keystore).
  - The session is restored on launch and revalidated with `GET /me`.
  - Any `401` signs the user out automatically.
- **Role-aware UI:** a single permission matrix shared with the web app.
- **Push notifications:** handles permissions, sets up the Android channel and registers an Expo push token with the backend. Tapping a notification opens the ticket.
- **Datadog RUM:** errors, resources, interactions and route-based views. It only switches on when credentials are configured.
- **Light and dark themes:** built from semantic design tokens, with accessibility roles, labels and states on interactive components.

## Architecture

```mermaid
flowchart LR
  subgraph Device["OpsDesk Mobile (iOS / Android, Expo)"]
    UI["Screens<br/>expo-router"] --> Hooks["TanStack Query hooks"]
    UI --> Sync["SyncProvider"]
    Sync --> Outbox[("Outbox<br/>AsyncStorage")]
    Hooks --> Cache[("Query cache<br/>AsyncStorage")]
    Hooks --> Client["Typed API client<br/>fetch + timeout + zod"]
    Sync --> Client
    Auth["AuthProvider"] --> Secure[("expo-secure-store<br/>JWT")]
    Client -. "401" .-> Auth
    Net["NetInfo"] --> Sync
    Push["expo-notifications"] -->|deep link| UI
  end

  Client -->|"HTTPS /api/v1<br/>Bearer JWT"| API["OpsDesk API<br/>Next.js (opsdesk-web)"]
  API --> PG[("Postgres<br/>multi-tenant")]
  API --> Stripe["Stripe<br/>billing"]
  API --> LLM["LLM provider<br/>/ai/summary"]
  API -->|"Expo Push"| Push
  Device -->|"RUM: views, errors,<br/>resources, actions"| DD["Datadog RUM"]
```

If `EXPO_PUBLIC_API_URL` is empty, `src/api/index.ts` swaps the HTTP client for `createMockApi()`. Both implement the same `OpsDeskApi` interface and validate responses against the same zod schemas, so the rest of the app can't tell them apart.

### Project layout

```
src/
  app/            expo-router routes (thin: they render feature screens)
  api/            zod schemas, HTTP client, OpsDeskApi, mock backend + seed data
  auth/           AuthProvider, secure token storage, session + 401 signal
  offline/        Outbox, SyncProvider, optimistic overlay, NetInfo status
  features/       tickets (list/detail/create + hooks), auth (login), settings
  permissions/    shared role permission matrix
  notifications/  push registration + notification deep links
  monitoring/     monitoring.ts: Datadog RUM wrapper
  components/     UI kit + ticket components
  theme/          design tokens, ThemeProvider (System/Light/Dark)
```

## Tech stack

| Area | Choice |
| --- | --- |
| Framework | Expo SDK 57, React Native 0.86, React 19 |
| Language | TypeScript (`strict`, `noUncheckedIndexedAccess`) |
| Navigation | expo-router (file-based, `Stack.Protected` auth gating, `opsdesk://` deep links) |
| Server state | TanStack Query v5 + AsyncStorage persister |
| Validation | zod 4 (API responses and form input) |
| Offline | Custom outbox on AsyncStorage + `@react-native-community/netinfo` |
| Auth storage | `expo-secure-store` |
| Push | `expo-notifications`, `expo-device` |
| Monitoring | `@datadog/mobile-react-native` (RUM) |
| Testing | Jest (`jest-expo`) + React Native Testing Library 14 |
| Tooling | ESLint (`eslint-config-expo`), `tsc --noEmit`, GitHub Actions, Snyk, Dependabot, EAS Build |

## API contract

This is the v1 mobile contract the app is written against, served under `${EXPO_PUBLIC_API_URL}/api/v1`. Every request except login sends `Authorization: Bearer <jwt>`. All HTTP mapping lives in [`src/api/httpApi.ts`](src/api/httpApi.ts) and [`src/api/schemas.ts`](src/api/schemas.ts) (see [Known limitations](#known-limitations) for how this lines up with opsdesk-web today).

| Method | Path | Response |
| --- | --- | --- |
| `POST` | `/auth/login` | `{ token, user: { id, name, email, role, orgId, orgName } }` |
| `GET` | `/me` | `User` |
| `GET` | `/tickets?status=&q=&cursor=` | `{ items: Ticket[], nextCursor: string \| null }` |
| `GET` | `/tickets/:id` | `Ticket & { comments: Comment[] }` |
| `POST` | `/tickets` | `Ticket` |
| `PATCH` | `/tickets/:id` | `Ticket` (body: any of `status`, `priority`, `assigneeId`) |
| `POST` | `/tickets/:id/comments` | `Comment` (body: `{ body, clientId }`; `clientId` is an idempotency key) |
| `POST` | `/ai/summary` | `{ summary, suggestedReply }` (body: `{ ticketId }`) |
| `GET` | `/members` | `{ items: Member[] }`, used to pick an assignee when reassigning |
| `POST` | `/devices/push-token` | `{ ok: true }` (body: `{ token, platform }`) |

The schemas in [`src/api/schemas.ts`](src/api/schemas.ts) are the source of truth for these types. Roles are `owner | admin | agent | viewer`, statuses are `open | pending | resolved`, and priorities are `low | medium | high | urgent`.

Errors are normalised into a single `ApiError` with one of five kinds: `network`, `timeout`, `unauthorized`, `http` or `validation`. Each error also carries a `retryable` flag, which both the TanStack retry policy and the outbox use. The client understands three error body shapes: `{ error: { code, message } }`, `{ message }` and plain text.

## Offline queue design

The app is **outbox-first**: comments and ticket updates always go through the queue, whether you're online or offline. That keeps a single code path for both cases.

```
user action ──► outbox.enqueue(op) ──► persisted to AsyncStorage
                     │
                     ├─► UI renders  server data + pending ops  (optimistic overlay)
                     │
                     └─► online? replay now : wait for NetInfo / foreground / backoff timer
                                   │
             executor(op) ──► API ──► write confirmed entity into query cache ──► dequeue
```

- **Strict FIFO and single-flight:**
  - The head entry must finish before the next one is sent, so the server sees writes in the order the user made them.
  - If a NetInfo event and a pull-to-refresh both trigger a replay, they share one run.
- **Retryable failures** (network, timeout, 408/429/5xx):
  - The entry stays at the head of the queue.
  - `attempts` is incremented and capped exponential backoff is scheduled.
  - After `maxAttempts`, the entry is dropped and reported.
  - When connectivity returns, the backoff timer is skipped and the queue flushes immediately.
- **Permanent failures** (400/403/404/409/validation), for example a role change while offline:
  - The entry is dropped immediately, so it can't block the queue.
  - The user sees a dismissible banner.
  - The error is sent to Datadog.
- **Coalescing:** repeated updates to the same ticket are merged into the queued entry (last write wins per field). An entry that is in flight is never changed.
- **Idempotency:** comments carry a client-generated `clientId`. If a replay happens after a lost response, the server returns the existing comment instead of creating a duplicate.
- **Optimistic overlay, not cache surgery:** screens render `server data + pending ops` (`src/offline/pending.ts`), so a refetch or an app restart can't wipe pending changes.
- **Durability:**
  - Each change is persisted before it is acknowledged, and storage writes are serialised.
  - Corrupt persisted data is discarded instead of crashing the app.
  - On a cold start, the queue is hydrated before replay.
  - The queue is cleared on sign-out.
- **Online-only actions:** creating a ticket (the server assigns the ticket number) and AI summaries are disabled while offline, with an explanation.

In demo mode, **Profile → Simulate offline** makes the mock API unreachable. This exercises the same queue path as a real outage, without toggling airplane mode.

## Role matrix

[`src/permissions/matrix.ts`](src/permissions/matrix.ts) is data-only, so it can be shared with the backend or generated from it. The server is the security boundary, the client uses the matrix to decide what to show, and the demo backend enforces it too.

| Capability | Owner | Admin | Agent | Viewer |
| --- | :---: | :---: | :---: | :---: |
| View tickets and conversations | ✅ | ✅ | ✅ | ✅ |
| Create tickets | ✅ | ✅ | ✅ | ❌ |
| Reply to customers | ✅ | ✅ | ✅ | ❌ |
| Change status / priority | ✅ | ✅ | ✅ | ❌ |
| Reassign tickets | ✅ | ✅ | ❌ | ❌ |
| Generate AI summaries | ✅ | ✅ | ✅ | ❌ |

Viewers get a read-only ticket view with no composer and no controls. Agents see an "Admins can reassign" hint in place of the assignee picker.

## Run locally

Requirements: Node 22.13 or newer, and npm.

```bash
npm i
npx expo start
```

Then scan the QR code with **Expo Go** (iOS or Android), or press `i` / `a` / `w` for the iOS simulator, an Android emulator or the web.

**Demo mode** is the default, because `EXPO_PUBLIC_API_URL` is unset:

- Tap **Owner / Admin / Agent / Viewer** on the sign-in screen, or use `agent@opsdesk.demo` / `demo1234`.
- Try the role-aware UI.
- Turn on **Profile → Simulate offline**, reply to a ticket and change its status, then turn it off and watch the changes sync.

To point the app at a real OpsDesk backend:

```bash
cp .env.example .env
# set EXPO_PUBLIC_API_URL=https://your-opsdesk-host
npx expo start --clear
```

All variables are documented in [`.env.example`](.env.example).

### Native builds (EAS)

Datadog RUM and remote push need a native build. Neither is available in Expo Go: Expo removed Android remote push from Expo Go in SDK 53, and the Datadog native SDK isn't bundled with Expo Go.

```bash
npx eas-cli@latest init                          # sets the EAS project id (use as EAS_PROJECT_ID)
npx eas-cli@latest build --profile development   # internal debug build (iOS simulator / Android APK)
npx eas-cli@latest build --profile preview       # internal release build for testers
npx eas-cli@latest build --profile production    # store build, auto-incremented version
```

`app.config.ts` reads `APP_VARIANT` from the profile, so the dev, preview and production builds get separate bundle IDs and app names and can be installed side by side.

### Push notifications

After sign-in on a physical device, the app:

1. Asks for notification permission.
2. Creates the Android `ticket-updates` channel.
3. Gets an Expo push token.
4. Registers the token with `POST /api/v1/devices/push-token`, sending `{ token: "ExponentPushToken[...]", platform: "ios" | "android" }`.

To deep-link to a ticket, the server sends either `data: { ticketId: "tkt_123" }` or `data: { url: "opsdesk://tickets/tkt_123" }`. Taps are routed to `/tickets/:id`, including the tap that launched the app from a killed state. Payloads that don't match a strict ticket-id pattern are ignored. Sending pushes is server-side work and out of scope for this repo.

### Monitoring (Datadog RUM)

To turn on monitoring, set `EXPO_PUBLIC_DD_CLIENT_TOKEN` and `EXPO_PUBLIC_DD_APPLICATION_ID`, and optionally `EXPO_PUBLIC_DD_SITE` and `EXPO_PUBLIC_DD_ENV`. Monitoring then initialises with:

- JS error and native crash tracking
- resource and interaction tracking
- trace-header propagation to the API host
- user context: id, role and org

Views are tracked from the expo-router pathname, with dynamic segments collapsed (for example, `/tickets/[id]`).

All of this sits behind [`src/monitoring/monitoring.ts`](src/monitoring/monitoring.ts). Without credentials, on web, or in Expo Go, every call is a no-op.

## Testing

```bash
npm test             # jest (jest-expo preset)
npm run test:ci      # with coverage
npm run lint         # eslint, zero warnings allowed
npm run typecheck    # tsc --noEmit
npm run verify       # all of the above
```

There are **117 tests in 10 suites**, covering:

| Suite | What it proves |
| --- | --- |
| `permissions/matrix` | Every role × permission cell, privileges never decrease from viewer to owner, and patch-level checks (agents can't reassign) |
| `offline/outbox` | Persistence across "restarts", corrupt-data recovery, FIFO replay, stop-on-retryable with backoff, max attempts, dropping permanent failures, single-flight, coalescing (never into the in-flight entry), optimistic overlay |
| `api/httpClient` | URL/query building, bearer header, **401 → `unauthorized` + logout hook** (but not for login), **zod validation failure → `validation` error**, error-envelope normalisation, network/timeout mapping |
| `api/mockApi` | Login/401s, cursor pagination without duplicates, filters and search, server-side permission enforcement, idempotent comments, ticket creation, AI summary, simulated offline |
| `auth/AuthProvider` | Sign-in stores the token in secure storage, session restore, **automatic logout on 401** that clears storage and per-user data, manual sign-out |
| `TicketListScreen` | **Renders tickets, filters by status chip**, debounced search plus empty state, infinite scroll, navigation, an offline status change leaving the filtered list |
| `TicketDetailScreen` | Role-aware UI for viewer, agent and admin; offline reply shown as pending and synced on reconnect; optimistic status change; AI summary used as a reply; replay of a queue persisted before an app restart |
| `notifications/deepLink`, `monitoring`, `utils/time` | Push payload → route (rejects unsafe ids and foreign URLs), monitoring no-ops when disabled, relative time formatting |

Screen tests render the real provider stack (theme, API, query client, auth, sync) against the mock backend. They don't use snapshots.

## CI

- **[`ci.yml`](.github/workflows/ci.yml)** runs on every push and PR. It does `npm ci`, then lint, typecheck and Jest with coverage, then a web bundle smoke test (`expo export --platform web`).
- **[`security.yml`](.github/workflows/security.yml)** runs a Snyk dependency scan (`snyk/actions/node`) on every push and PR, and weekly. It needs the `SNYK_TOKEN` repository secret and is report-only (`continue-on-error: true`) until a baseline has been triaged.
- **[Dependabot](.github/dependabot.yml)** opens weekly npm and GitHub Actions updates. Expo SDK packages are grouped so they move together, and major Expo upgrades are left for a human to do.

## Known limitations

- **Creating tickets needs a connection.** Ticket numbers come from the server, so offline creation would need temporary IDs and remapping. That's deliberately out of scope.
- **Demo mode data is in-memory.** It resets on reload. The outbox and query cache are still persisted, so the offline flows behave the same.
- **On web, the session uses `sessionStorage`.** `expo-secure-store` has no web implementation. The web target is only used for previews and screenshots; iOS and Android use the Keychain/Keystore.
- **The contract above doesn't yet match opsdesk-web exactly.** The two repos were built independently. The mobile app follows the contract documented above. opsdesk-web's current `/api/v1` differs in a few places:
  - responses are wrapped (`{ ticket }`, `{ comment }`);
  - lists use page/pageSize pagination instead of a cursor;
  - login returns `accessToken` + `organization`;
  - AI returns `{ text }`;
  - its RBAC also lets agents assign tickets.

  Pointing the app at it means updating the adapter in `src/api/httpApi.ts` and `src/api/schemas.ts`. Nothing else in the app needs to change. Demo mode is unaffected.
- **`GET /members` and `POST /devices/push-token` aren't in opsdesk-web yet.** The app uses them for the assignee picker and push registration.

## License

[MIT](LICENSE) © 2026 Zaid Mubbashar
