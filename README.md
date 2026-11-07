# cherry-bot

pnpm monorepo with three apps:

| App    | Stack                                                | Deploys to            |
| ------ | ---------------------------------------------------- | --------------------- |
| client | React 19 + Vite + better-auth React client           | Cloudflare Pages      |
| server | Hono + better-auth + Drizzle ORM + Neon PostgreSQL   | Cloudflare Workers    |
| mobile | Expo + React Native + Expo Router + better-auth Expo | EAS / native builds   |

**Phase 1 scope:** email + password login only. No email provider / password reset
verification is configured yet.

The app also includes a private **Paste-to-save dashboard** at `/responses`.
Signed-in users can paste Markdown or plain text, add a title and tags, and
browse, search, filter, copy, and delete their saved responses. The same core
experience is available in the native Expo app under `apps/mobile`.

---

## Structure

```
cherry-bot/
├── package.json            # workspace root scripts
├── pnpm-workspace.yaml
└── apps/
    ├── server/             # @bot-cherry/server (Cloudflare Worker)
    │   ├── src/
    │   │   ├── index.ts    # Hono app, CORS, route mounting, /swagger
    │   │   ├── auth.ts     # better-auth instance
    │   │   ├── db.ts       # drizzle + Neon HTTP driver
    │   │   ├── schema.ts   # auth + saved item/tag drizzle schema
    │   │   ├── openapi.ts  # hand-written OpenAPI doc
    │   │   ├── lib/        # session middleware + item validation
    │   │   └── routes/     # /api/items and /api/tags
    │   ├── drizzle/        # generated SQL migration
    │   ├── drizzle.config.ts
    │   ├── wrangler.toml
    │   └── .dev.vars       # local secrets (gitignored)
    ├── client/             # @bot-cherry/client (Cloudflare Pages)
    │   └── src/
    │       ├── App.tsx             # routes, including /responses
    │       ├── components/
    │       │   ├── auth/           # RequireAuth
    │       │   └── responses/      # sidebar, reader, paste modal, tags
    │       ├── hooks/              # saved item list/detail state
    │       ├── lib/                # API client, Markdown detection, types
    │       └── pages/ResponsesPage.tsx
    └── mobile/             # @bot-cherry/mobile (Expo native app)
        ├── src/app/        # Expo Router routes (auth + responses)
        ├── src/components/ # native auth, responses, and UI components
        ├── src/hooks/      # item/detail/tag-note data hooks
        ├── src/lib/        # API client, auth client, helpers, types
        ├── src/providers/  # auth, responses, theme, toast
        ├── app.config.ts   # Expo app config (scheme: botcherry)
        └── eas.json
```

## Prerequisites

- Node 20+ and [pnpm](https://pnpm.io) 10+
- A Cloudflare account (for `wrangler deploy`)
- The Neon database already created (connection string below)

## Setup

```bash
pnpm install

# 1. Create the auth tables in Neon (reads DATABASE_URL from apps/server/.dev.vars)
pnpm db:push

# 2. Run locally
pnpm dev
```

- Client: http://localhost:5173
- Server: http://localhost:8787
- Swagger UI: http://localhost:8787/swagger (OpenAPI JSON at `/doc`)
- Mobile: `pnpm dev:mobile` (Expo dev server / QR code)

## Environment variables

### Server (`apps/server`)

Set locally in `apps/server/.dev.vars` (copy from `.dev.vars.example`) and in
production with `wrangler secret put`:

| Var                 | Description                                        |
| ------------------- | -------------------------------------------------- |
| `DATABASE_URL`      | Neon PostgreSQL connection string (HTTP pooler)     |
| `BETTER_AUTH_SECRET`| Long random string used to sign sessions            |
| `DEEPSEEK_API_KEY`  | DeepSeek API key used by the health agent           |
| `HEALTH_AGENT_MODEL`| Optional model override (default `deepseek-v4-flash`) |
| `BETTER_AUTH_URL`   | Public URL of the Worker (http://localhost:8787 locally) |
| `CLIENT_URL`        | Origin of the React app (http://localhost:5173 locally) |
| `MOBILE_APP_SCHEME` | Expo deep-link scheme, `botcherry` (non-secret, in `wrangler.toml`) |

`BETTER_AUTH_URL`, `CLIENT_URL`, and `MOBILE_APP_SCHEME` are also declared
(non-secret) in `wrangler.toml`; update them to your real `*.workers.dev` /
`*.pages.dev` URLs after deploying.

### Client (`apps/client`)

| Var                      | Description                                      |
| ------------------------ | ------------------------------------------------ |
| `VITE_BETTER_AUTH_URL`   | Local override for the server Worker URL only    |

Production builds do not read this variable. `pnpm deploy:client` takes
`BETTER_AUTH_URL` from `apps/server/wrangler.toml` so the web app and Worker
can never drift onto different hosts.

### Mobile (`apps/mobile`)

Copy `apps/mobile/.env.example` to `apps/mobile/.env.local`:

| Var                      | Description                                                    |
| ------------------------ | -------------------------------------------------------------- |
| `EXPO_PUBLIC_API_URL`    | Server URL as seen by the device (LAN IP for physical devices) |
| `EXPO_PUBLIC_APP_SCHEME` | Must match `app.config.ts` and server `MOBILE_APP_SCHEME`      |

`EXPO_PUBLIC_*` values are embedded in the JS bundle, so never put secrets
there. For a physical device, point `EXPO_PUBLIC_API_URL` at the machine's LAN
IP. The server dev script already binds all interfaces with
`wrangler dev --ip 0.0.0.0`; if the device still cannot connect, check the macOS
firewall and make sure both devices are on the same Wi-Fi.

### Android share sheet

Other apps can share text or links directly to cherry-bot. After the native app
is installed, choose **cherry-bot** in Android's share sheet; the app opens
`/responses` with the save modal already filled in. Nothing is sent to the API
until the user taps **Save**.

This uses the `expo-share-intent` native module, so it **does not work in Expo
Go** and requires a development/production build after changing the plugin:

```bash
pnpm --filter @bot-cherry/mobile android
# or build a preview with EAS
```

The Android filter is `text/*` in `apps/mobile/app.config.ts`. Shared files,
images, and videos are intentionally ignored for now. iOS share settings are
also configured, but iOS requires a new native build as well.

## Database

The connection string uses the Neon **pooler** endpoint (HTTP driver), which
works on Cloudflare Workers because it needs no raw TCP sockets. Store it in
`apps/server/.dev.vars` (see `.dev.vars.example`), for example:

```
postgresql://USER:PASSWORD@ep-xxxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

Schema is managed with `drizzle-kit`:

```bash
pnpm db:push        # create/update tables directly
pnpm db:generate    # generate SQL migrations to apps/server/drizzle
```

The saved responses feature uses four tables:

- `saved_item` — one row per pasted document, scoped to `user_id`.
- `tag` — per-user lowercase tags with a unique `(user_id, name)` index.
- `saved_item_tag` — many-to-many links; deleting an item cascades its links.
- `tag_note` — one optional free-form note per tag (`tag_id` is the primary
  key); deleting a tag cascades its note.

## Deploy

Deploys run from your machine with the Wrangler CLI; there is no deployment
workflow in CI. Log in once with `wrangler login` (or export
`CLOUDFLARE_API_TOKEN`); runtime secrets already stored on the Worker do not
need to be present locally at deploy time.

```bash
pnpm deploy            # server (Worker) then client (Pages)
pnpm deploy:server     # typecheck + wrangler deploy
pnpm deploy:client     # build + wrangler pages deploy
```

### Server -> Cloudflare Worker

`pnpm deploy:server` runs the server typecheck and then `wrangler deploy` from
`apps/server`. Non-secret vars (`BETTER_AUTH_URL`, `CLIENT_URL`,
`MOBILE_APP_SCHEME`) come from `apps/server/wrangler.toml` on every deploy.

Runtime secrets live on Cloudflare and persist across deploys; set them once
(and again whenever a value rotates):

```bash
cd apps/server
pnpm exec wrangler secret put DATABASE_URL
pnpm exec wrangler secret put BETTER_AUTH_SECRET
pnpm exec wrangler secret put DEEPSEEK_API_KEY
pnpm exec wrangler secret list   # verify what is currently set
```

Because secrets are stored on the Worker, a deploy does not need them exported
in your shell. `HEALTH_AGENT_MODEL` is optional and defaults to
`deepseek-v4-flash` when unset.

### Mobile -> EAS / native builds

The mobile app uses Expo with CNG (no generated `ios/` or `android/` committed).
For share-sheet testing, use a native development build (`pnpm --filter
@bot-cherry/mobile android`) rather than Expo Go. For preview or production
builds:

```bash
cd apps/mobile
npx eas-cli@latest build --profile preview --platform ios
npx eas-cli@latest build --profile preview --platform android
```

The `development`, `preview`, and `production` profiles in
`apps/mobile/eas.json` set `EXPO_PUBLIC_API_URL` to the deployed Worker
(`https://cherry-api.flipbee.app`), so cloud-built APKs never fall back to
localhost. Local development can override it in `apps/mobile/.env.local`. CI in
`.github/workflows/mobile.yml` runs the mobile typecheck and `expo-doctor` on
changes under `apps/mobile/`.

### Client -> Cloudflare Pages

`pnpm deploy:client` builds the app with `VITE_BETTER_AUTH_URL` read from
`BETTER_AUTH_URL` in `apps/server/wrangler.toml`, then uploads `apps/client/dist`
to the `bot-cherry-client` Pages project (`main` branch). Local development can
still override the URL in `apps/client/.env`.

Use a different branch from the CLI with:

```bash
pnpm deploy:client --branch <name>
```

The Pages project and its custom domain already exist in Cloudflare. If you
ever need to recreate it:

```bash
pnpm --filter @bot-cherry/client exec wrangler pages project create bot-cherry-client --production-branch=main
```

> **Cross-site cookies:** in production the Worker (`*.workers.dev`) and Pages
> (`*.pages.dev`) are cross-site, so `auth.ts` sets the session cookie to
> `SameSite=None; Secure`. For a production setup you'll typically put both
> apps behind a single custom domain (e.g. `api.example.com` +
> `app.example.com`) so cookies behave like normal same-site cookies.

## Responses dashboard

Open `/responses` on the web, or run `pnpm dev:mobile` for the native app.
The mobile client uses the same endpoints and stores the better-auth session
cookie in Expo SecureStore. Native mutations send an `expo-origin` header
instead of a browser `Origin` header; the server allows the configured app
scheme (`MOBILE_APP_SCHEME=botcherry`).

On the web, open `/responses` after signing in. The page reads the clipboard when you click
**Paste**, detects Markdown vs plain text, and opens a modal for the title,
optional tags, and format. Clipboard permission failures fall back to a manual
paste modal. Nothing is written to the database until you submit the modal.

Rendering uses `react-markdown` + `remark-gfm`; raw HTML is escaped. Plain text
keeps its whitespace. Search uses `ILIKE` over title/content.

Select a saved item with a tag to open its tag-only note editor in the lower
half of the sidebar. On mobile, existing tag notes appear as cards in the
response reader with an **Edit** button that opens a note modal. Tag filtering
itself does not open a note.

### Saved responses API

All item/tag routes require a better-auth session cookie. Item queries are
always scoped to the session user; another user's item returns `404`.

| Method | Path              | Purpose                                      |
| ------ | ----------------- | -------------------------------------------- |
| GET    | `/api/items`      | List summaries; `q`, `tag`, `limit`, `cursor` |
| POST   | `/api/items`      | Create an item (title, content, format, tags) |
| GET    | `/api/items/:id`  | Get one item with full content                |
| DELETE | `/api/items/:id`  | Delete one item                               |
| GET    | `/api/tags`       | List the current user's tags                  |
| GET    | `/api/tags/:id/note` | Get the note for a tag                    |
| PUT    | `/api/tags/:id/note` | Create/replace the note for a tag         |

`POST`/`DELETE` require an `Origin` header matching `CLIENT_URL`. This also
applies when testing with `curl`, e.g.:

```bash
curl -b cookies.txt -H 'Origin: http://localhost:5173' \
  -H 'Content-Type: application/json' \
  -d '{"title":"Example","content":"Hello","contentFormat":"plain"}' \
  http://localhost:8787/api/items
```

The full request/response schemas are in Swagger UI at `/swagger`.

## Auth API (better-auth)

| Method | Path                          | Body                                |
| ------ | ----------------------------- | ----------------------------------- |
| POST   | `/api/auth/sign-up/email`     | `{ name, email, password }`         |
| POST   | `/api/auth/sign-in/email`     | `{ email, password }`               |
| POST   | `/api/auth/sign-out`          | `{}`                                |
| GET    | `/api/auth/get-session`       | —                                   |

All endpoints live under `/api/auth/*` and are documented in the Swagger UI.
