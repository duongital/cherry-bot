# AGENTS.md

Guidance for coding agents working in this repository.

## Project layout

- `apps/client` — React 19 + Vite + Tailwind/daisyUI frontend.
- `apps/server` — Hono + better-auth + Drizzle ORM on Cloudflare Workers.
- `apps/mobile` — Expo + React Native + Expo Router native client.
- `apps/server/drizzle` — generated SQL migrations and snapshots.
- Database is PostgreSQL on Neon.

## Common commands

```bash
pnpm dev                 # run client + server
pnpm dev:mobile          # run the Expo dev server
pnpm typecheck           # typecheck all packages
pnpm build               # build all packages
pnpm deploy              # deploy Worker + Pages via Wrangler CLI
pnpm deploy:server       # typecheck + wrangler deploy
pnpm deploy:client       # build + wrangler pages deploy
pnpm --filter @bot-cherry/client typecheck
pnpm --filter @bot-cherry/server typecheck
pnpm --filter @bot-cherry/mobile typecheck
pnpm --filter @bot-cherry/server db:generate
pnpm --filter @bot-cherry/server db:push
pnpm mobile:doctor       # expo-doctor
```

## Deployment

Deploys happen locally through the Wrangler CLI; there are no deploy
workflows under `.github/workflows`. Non-secret Worker vars live in
`apps/server/wrangler.toml`; `DATABASE_URL`, `BETTER_AUTH_SECRET`, and
`DEEPSEEK_API_KEY` are stored as Worker secrets (`wrangler secret list`).
`pnpm deploy:client` reads `BETTER_AUTH_URL` from `apps/server/wrangler.toml`,
so keep that value authoritative.

## Database migrations

Use the schema in `apps/server/src/schema.ts` as the source of truth.

1. Edit the Drizzle schema.
2. Generate a migration with `pnpm --filter @bot-cherry/server db:generate`.
3. Review the generated SQL in `apps/server/drizzle/`.
4. Apply it with `pnpm --filter @bot-cherry/server db:push` (this targets the
   remote Neon database configured in `apps/server/.dev.vars`).

Never commit `apps/server/.dev.vars` or other secrets.

### PostgreSQL 18 / Drizzle compatibility

The production Neon database runs PostgreSQL 18. Older `drizzle-kit` versions
mishandle PostgreSQL 18's named `NOT NULL` constraints during `db:push`,
producing errors such as:

```text
error: column "id" is in a primary key
code: 42P16
routine: dropconstraint_internal
```

Do **not** downgrade `drizzle-kit` below `0.31.11`. The project requires
`drizzle-kit@^0.31.11` (or newer) for PostgreSQL 18 compatibility.

If this error appears again:

1. Check the installed version with `pnpm exec drizzle-kit --version`.
2. Upgrade with:
   ```bash
   pnpm --filter @bot-cherry/server add -D drizzle-kit@^0.31.11
   ```
3. Re-run `pnpm --filter @bot-cherry/server db:push`.
4. Verify the generated migration and the actual database constraints.

On PostgreSQL 18, an otherwise successful repeated `db:push` may still report a
harmless drop/re-add of an existing composite primary key. Treat it as a
`drizzle-kit` introspection quirk unless the command fails.

## Mobile conventions

- Use Expo Router under `apps/mobile/src/app`; do not port DOM/React Router code.
- Store auth state only through `@better-auth/expo` + Expo SecureStore.
- Custom API calls must send the better-auth cookie via
  `authClient.getCookie()` and the `expo-origin` header.
- Keep `app.config.ts` `scheme`, `EXPO_PUBLIC_APP_SCHEME`, and server
  `MOBILE_APP_SCHEME` in sync (`botcherry`).
- Android share-sheet capture uses `expo-share-intent` and requires a native
  development/production build; it is disabled in Expo Go. Shared text is
  converted to a paste draft by `ShareCaptureProvider`; do not persist it until
  the user submits the save modal.
- Use `expo install` for native dependencies so versions match the Expo SDK.
- Do not commit generated `ios/`, `android/`, `.expo/`, or `.env.local`.

## Conventions

- Keep API routes scoped to the authenticated user from `requireSession`.
- Validate server inputs with Zod and return structured `{ error: { code, message } }`
  responses.
- Keep client API types in `apps/client/src/lib/types.ts`.
- Follow the existing daisyUI theme tokens rather than hardcoded colors.
- Run the relevant typecheck and build after changes.
