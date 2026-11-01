# Next feature: Expo React Native mobile client (`apps/mobile`)

## 1. Goal

Add a native mobile app in `apps/mobile` using Expo + React Native that gives
signed-in users the same core experience as the web `/responses` dashboard:

- Sign up, sign in, persist the session, and sign out.
- View saved responses in a searchable, tag-filterable, paginated list.
- Paste from the device clipboard, detect Markdown vs plain text, review a
  suggested title/format, add tags, and save.
- Read Markdown or plain text in a mobile-friendly reader.
- Copy raw content, delete an item, and edit per-tag notes.
- Follow the device light/dark appearance, with an in-app theme override.

The mobile app consumes the existing Hono API. It does **not** need a new data
model or new item/tag endpoints. The only server changes are auth/CORS/origin
support for the native client.

### Assumptions / decisions

- Use **Expo Router** with file-based routes and a native stack. Do not port
  `react-router-dom`, DOM components, daisyUI, or Tailwind to React Native.
- Use Expo's managed workflow (CNG) and EAS for native builds. Do not commit
  generated `ios/` or `android/` directories.
- Auth uses better-auth's official Expo integration:
  - `@better-auth/expo` server plugin.
  - `expoClient()` plugin with `expo-secure-store`.
  - Session cookie is stored in SecureStore and attached manually to custom API
    requests through `authClient.getCookie()`.
- The mobile app is **native-only** for v1. Expo Web is not a target and cannot
  use the Cookie-header approach.
- The web app at `apps/client` must keep working unchanged.
- Reuse the existing API shapes and validation limits:
  - title ≤ 200 chars, content ≤ 256 KiB, ≤ 10 tags, tag ≤ 32 chars.
  - tag note ≤ 20,000 chars.
- For the first implementation, copy the small pure helpers (`types.ts`,
  `markdown.ts`, `date.ts`) into `apps/mobile/src/lib`. Extracting a shared
  package can be a follow-up so the web client does not need refactoring in the
  same change.
- Use a small in-house component/theme layer instead of trying to reproduce
  daisyUI. The tokens should map to the web's semantic ideas (`base-100`,
  `base-content`, `primary`, `error`, etc.).
- Markdown rendering uses `@ronradtke/react-native-markdown-display` (the
  maintained fork of `react-native-markdown-display`) with raw HTML disabled.
- No push notifications, offline sync, background upload, or app-store
  submission in v1. EAS build configuration is included so native builds can be
  produced.

---

## 2. Scope

### In scope

- New `apps/mobile` Expo app in the pnpm workspace.
- Expo Router route tree with auth and app groups.
- better-auth Expo server/client integration.
- Native secure session storage.
- Custom mobile API client with cookie, origin, timeout, and typed errors.
- Responses list, search, tag filter, pagination, pull-to-refresh.
- Paste flow with clipboard read and manual-paste fallback.
- Save modal with title, format toggle, tag chips, and validation.
- Markdown/plain content renderer.
- Detail screen with copy, delete, and tag-note cards.
- Tag-note edit modal.
- Light/dark/system theme, persisted locally.
- Toast/snackbar feedback and native confirmation alerts.
- Server origin changes for `expo-origin` requests.
- README, AGENTS.md, root scripts, and CI typecheck updates.
- EAS build config and environment documentation.

### Out of scope (future)

- Offline-first cache and background refresh.
- Push notifications / reminders.
- Share extension or Android intent filters for capturing text from other apps.
- OAuth/social sign-in and password reset flows.
- Tablet split-pane layout (start with stack navigation).
- Full theme parity with every daisyUI theme.
- App Store / Play Store submission.
- Shared package extraction for web/mobile helpers.
- Biometric unlock.
- Web build of the Expo app.

---

## 3. Architecture

```text
apps/mobile/
├── app/                              # Expo Router routes
│   ├── _layout.tsx                   # providers, theme, splash, root stack
│   ├── index.tsx                     # session-aware redirect
│   ├── (auth)/
│   │   ├── _layout.tsx               # redirect signed-in users away
│   │   ├── login.tsx
│   │   └── signup.tsx
│   └── (app)/
│       ├── _layout.tsx               # auth gate + app stack
│       └── responses/
│           ├── _layout.tsx           # ResponsesProvider + nested stack
│           ├── index.tsx             # list screen
│           └── [itemId].tsx          # detail screen
├── src/
│   ├── components/
│   │   ├── auth/AuthForm.tsx
│   │   ├── responses/
│   │   │   ├── ResponsesHeader.tsx
│   │   │   ├── ResponsesList.tsx
│   │   │   ├── SavedItemRow.tsx
│   │   │   ├── TagFilterBar.tsx
│   │   │   ├── PasteButton.tsx
│   │   │   ├── SaveItemModal.tsx
│   │   │   ├── TagInput.tsx
│   │   │   ├── MarkdownContent.tsx
│   │   │   ├── TagNoteCard.tsx
│   │   │   └── TagNoteModal.tsx
│   │   └── ui/
│   │       ├── AppButton.tsx
│   │       ├── TextField.tsx
│   │       ├── Card.tsx
│   │       ├── Badge.tsx
│   │       ├── EmptyState.tsx
│   │       ├── ErrorState.tsx
│   │       ├── LoadingSkeleton.tsx
│   │       └── Toast.tsx
│   ├── hooks/
│   │   ├── useSavedItems.ts
│   │   ├── useSavedItem.ts
│   │   └── useTagNote.ts
│   ├── lib/
│   │   ├── api.ts
│   │   ├── auth-client.ts
│   │   ├── env.ts
│   │   ├── markdown.ts
│   │   ├── date.ts
│   │   └── types.ts
│   ├── providers/
│   │   ├── AuthProvider.tsx
│   │   ├── ResponsesProvider.tsx
│   │   ├── ThemeProvider.tsx
│   │   └── ToastProvider.tsx
│   └── theme/tokens.ts
├── assets/                           # icon, splash, adaptive icon
├── app.config.ts
├── eas.json
├── babel.config.js
├── metro.config.js
├── tsconfig.json
├── .env.example
└── package.json
```

### Data flow

- `AuthProvider` exposes the better-auth session, sign-in/out actions, and
  splash handling.
- `ResponsesProvider` owns the list, tags, filter/search state, pagination, and
  mutations so the list and detail screens share one source of truth.
- `useSavedItem` fetches full content only for the selected item; the list never
  downloads content.
- Saving prepends the returned summary and navigates to the new detail.
- Deleting removes the item from the provider and returns to the list.

---

## 4. Workspace setup

### 4.1 Create the app

From the repo root:

```bash
pnpm dlx create-expo-app@latest apps/mobile --template default
```

Use the default Expo Router TypeScript template, then:

1. Rename `package.json` to `@bot-cherry/mobile`.
2. Remove the template demo screens/assets that are not used.
3. Confirm the workspace already picks it up (`pnpm-workspace.yaml` contains
   `apps/*`).
4. Run `pnpm install`.

Use the current stable Expo SDK at implementation time. After adding native
packages run:

```bash
pnpm --filter @bot-cherry/mobile exec expo install --fix
```

Do not hand-pick React Native / Expo package versions; let `expo install`
choose the SDK-compatible versions.

### 4.2 Packages

Install native dependencies with Expo so versions match the SDK:

```bash
pnpm --filter @bot-cherry/mobile exec expo install \
  expo-router expo-secure-store expo-clipboard expo-linking expo-constants \
  expo-network expo-web-browser expo-splash-screen expo-status-bar \
  expo-dev-client react-native-safe-area-context react-native-screens \
  react-native-gesture-handler @react-native-async-storage/async-storage
```

Add JS dependencies:

```bash
pnpm --filter @bot-cherry/mobile add \
  @better-auth/expo better-auth \
  @ronradtke/react-native-markdown-display
```

`@better-auth/expo` peer-depends on the same better-auth version. Align all
better-auth packages across the repo:

- `apps/server`: bump `better-auth` to the same `^1.7.x` version as
  `@better-auth/expo` (currently `^1.7.12`).
- `apps/client`: keep its better-auth version aligned to avoid duplicate type
  copies.
- `apps/server`: add `@better-auth/expo` as a regular dependency because the
  server imports the plugin.
- If pnpm reports a missing peer, add `@better-auth/core` at the same version.

### 4.3 Root scripts

Add to root `package.json` without changing the existing web/server workflow:

```json
{
  "scripts": {
    "dev:mobile": "pnpm --filter @bot-cherry/mobile start",
    "mobile:ios": "pnpm --filter @bot-cherry/mobile ios",
    "mobile:android": "pnpm --filter @bot-cherry/mobile android"
  }
}
```

Keep `pnpm dev` as the web+server command. `pnpm typecheck` will include the
mobile app automatically because it uses `pnpm -r typecheck`.

Mobile `package.json` scripts:

```json
{
  "scripts": {
    "start": "expo start",
    "ios": "expo run:ios",
    "android": "expo run:android",
    "typecheck": "tsc --noEmit",
    "doctor": "expo-doctor",
    "export": "expo export --platform ios --platform android"
  }
}
```

Do not add a `build` script that runs Expo export on every root `pnpm build`;
keep native builds explicit.

### 4.4 Metro / monorepo configuration

Expo generally supports pnpm workspaces, but verify Metro resolution before
building UI. If Metro fails to resolve packages from the workspace root, update
`apps/mobile/metro.config.js`:

```js
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");
const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
```

Do not switch the whole repository to `node-linker=hoisted` unless resolution
cannot be fixed otherwise; that changes the web/server install layout.

### 4.5 Environment

Create `apps/mobile/.env.example`, and a local `.env.local` that stays
gitignored:

```bash
# Server URL as seen by the device/emulator.
# iOS simulator: http://localhost:8787
# Android emulator: http://10.0.2.2:8787
# Physical device: http://<your-LAN-IP>:8787
EXPO_PUBLIC_API_URL=http://localhost:8787

# Must match app.config.ts scheme and the server's MOBILE_APP_SCHEME.
EXPO_PUBLIC_APP_SCHEME=botcherry
```

`src/lib/env.ts`:

```ts
export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8787"
).replace(/\/$/, "");

export const APP_SCHEME = process.env.EXPO_PUBLIC_APP_SCHEME ?? "botcherry";
export const APP_ORIGIN = `${APP_SCHEME}://`;
```

- `EXPO_PUBLIC_*` values are embedded in the bundle, so never put secrets there.
- In production/EAS, set `EXPO_PUBLIC_API_URL` to the deployed Worker URL.
- When testing on a physical device, run the Worker on the LAN interface
  (`wrangler dev --ip 0.0.0.0`) and point `EXPO_PUBLIC_API_URL` at the machine's
  LAN IP. If auth callbacks misbehave, also set the server `.dev.vars`
  `BETTER_AUTH_URL` to that LAN URL and restart the Worker.
- Android cleartext HTTP is acceptable only for local development. Production
  must use HTTPS.

---

## 5. Server changes

No database migration is required.

### 5.1 Add the Expo auth plugin

Update `apps/server/src/auth.ts`:

```ts
import { expo } from "@better-auth/expo";

export function createAuth(env: AuthEnv) {
  const db = createDb(env.DATABASE_URL);
  const isProduction = env.BETTER_AUTH_URL.startsWith("https://");
  const mobileScheme = env.MOBILE_APP_SCHEME ?? "botcherry";

  const trustedOrigins = [env.CLIENT_URL, `${mobileScheme}://`];
  if (!isProduction) {
    trustedOrigins.push("exp://", "http://localhost:8081");
  }

  return betterAuth({
    // ...
    trustedOrigins,
    plugins: [expo()],
    // ...existing email/password and cookie config
  });
}
```

Add `MOBILE_APP_SCHEME` to `AuthEnv`, `Bindings`, `.dev.vars.example`, and
`wrangler.toml`:

```toml
[vars]
BETTER_AUTH_URL = "https://cherry-api.flipbee.app"
CLIENT_URL = "https://cherry.flipbee.app"
MOBILE_APP_SCHEME = "botcherry"
```

`MOBILE_APP_SCHEME` is not a secret; it must match the Expo app's URL scheme.

The Expo plugin uses the `expo-origin` header to populate `Origin` for auth
requests. Add it to the CORS allowed headers as well:

```ts
allowHeaders: ["Content-Type", "Authorization", "expo-origin"],
```

### 5.2 Allow native state-changing requests

React Native requests have no browser `Origin` header. The current server
rejects `POST`/`PUT`/`DELETE` on `/api/items` and `/api/tags` when `Origin` is
missing, so the mobile app would receive `403 FORBIDDEN_ORIGIN`.

Replace the origin check in `apps/server/src/index.ts` with a helper that
accepts either the web origin or the native app's `expo-origin`:

```ts
function isTrustedRequestOrigin(c: Context<AppEnv>): boolean {
  const origin = c.req.header("origin");
  if (origin) return origin === c.env.CLIENT_URL;

  const expoOrigin = c.req.header("expo-origin");
  if (!expoOrigin) return false;

  const scheme = c.env.MOBILE_APP_SCHEME ?? "botcherry";
  if (expoOrigin === `${scheme}://`) return true;

  // Expo Go / dev builds use exp:// URLs. Only allow this outside production.
  if (
    !c.env.BETTER_AUTH_URL.startsWith("https://") &&
    expoOrigin.startsWith("exp://")
  ) {
    return true;
  }

  return false;
}
```

Use it only for the existing item/tag mutation routes. Auth routes continue to
use better-auth's trusted-origin checks plus the Expo plugin.

Security note: the native check is intentionally narrow. A website cannot set a
custom `expo-origin` header without a CORS preflight, and the server only allows
`CLIENT_URL` as a CORS origin. Session ownership still comes exclusively from
`requireSession`.

### 5.3 CORS

Native fetch ignores CORS, so no change is needed for iOS/Android. Keep the CORS
middleware for the web client. Optionally allow `http://localhost:8081` as an
Expo web dev origin in local development; do not add it to production.

### 5.4 API contract

The mobile app uses the existing endpoints unchanged:

| Method | Path | Use |
| --- | --- | --- |
| GET | `/api/items` | List, search, tag filter, pagination |
| POST | `/api/items` | Save a pasted item |
| GET | `/api/items/:id` | Full item content |
| DELETE | `/api/items/:id` | Delete an item |
| GET | `/api/tags` | Tag filter and tag suggestions |
| GET | `/api/tags/:id/note` | Read a tag note |
| PUT | `/api/tags/:id/note` | Create/replace a tag note |

No list response should include full content.

---

## 6. Mobile auth

### 6.1 better-auth client

`src/lib/auth-client.ts`:

```ts
import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
import { API_URL, APP_SCHEME } from "./env";

export const authClient = createAuthClient({
  baseURL: API_URL,
  plugins: [
    expoClient({
      scheme: APP_SCHEME,
      storage: SecureStore,
      storagePrefix: "botcherry",
    }),
  ],
});
```

Requirements:

- `app.config.ts` must set `scheme: "botcherry"`, matching `APP_SCHEME`.
- Install all Expo peer packages imported by `@better-auth/expo/client`
  (`expo-constants`, `expo-linking`, `expo-network`, `expo-secure-store`,
  `expo-web-browser`).
- The client plugin stores the better-auth cookie and cached session in
  SecureStore. Never log or persist the cookie elsewhere.

### 6.2 Session provider

`AuthProvider` wraps `authClient.useSession()` and exposes:

- `session`, `user`, `isPending`
- `signIn`, `signUp`, `signOut`
- `refetch`
- `handleUnauthorized()` → clears local auth and redirects to `/login`

Use `expo-splash-screen`:

```ts
SplashScreen.preventAutoHideAsync();
// hide once the first session check resolves
```

### 6.3 Route guards

- `app/index.tsx`: if pending, show splash/loading; if signed in, redirect to
  `/responses`; otherwise redirect to `/login`.
- `app/(app)/_layout.tsx`: if pending show loading; if no session, redirect to
  `/login`; otherwise render the app stack.
- `app/(auth)/_layout.tsx`: if signed in, redirect to `/responses`.
- Preserve the desired route after login if easy: pass a `from` param through
  the login route and `router.replace(from)` after success. A simple default to
  `/responses` is acceptable for v1.

Do not rely on `window`, `document`, `localStorage`, or cookies being set
automatically by React Native.

---

## 7. Mobile API client

`src/lib/api.ts` mirrors the web client but adapts authentication:

```ts
import { authClient } from "./auth-client";
import { API_URL, APP_ORIGIN } from "./env";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const cookie = await authClient.getCookie();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: controller.signal,
      credentials: "omit",
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        "expo-origin": APP_ORIGIN,
        ...(cookie ? { Cookie: cookie } : {}),
        ...init.headers,
      },
    });

    const text = await res.text();
    const data = text ? safeJsonParse(text) : undefined;

    if (!res.ok) {
      const error = (data as { error?: { code?: string; message?: string } })
        ?.error;
      throw new ApiError(
        error?.message ?? `Request failed with status ${res.status}`,
        res.status,
        error?.code,
      );
    }

    return (res.status === 204 ? undefined : data) as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if ((error as Error)?.name === "AbortError") {
      throw new ApiError("The request timed out. Try again.", 0, "TIMEOUT");
    }
    throw new ApiError(
      "Could not reach the server. Check your connection.",
      0,
      "NETWORK_ERROR",
    );
  } finally {
    clearTimeout(timeout);
  }
}
```

Define `itemsApi` and `tagsApi` with the same methods as the web client:

- `itemsApi.list({ q, tag, limit, cursor })`
- `itemsApi.get(id)`
- `itemsApi.create(input)`
- `itemsApi.remove(id)`
- `tagsApi.list()`
- `tagsApi.getNote(tagId)`
- `tagsApi.saveNote(tagId, content)`

Handle `401` centrally:

- In `AuthProvider` or a wrapper, catch `ApiError` with status `401`, call
  `handleUnauthorized()`, and show a “Session expired, please sign in again”
  message.
- Do not silently retry authenticated mutations.

Notes:

- `authClient.getCookie()` is provided by `expoClient`.
- `Cookie` is a forbidden header in browsers, which is why Expo Web is out of
  scope.
- Send `expo-origin` on **all** API requests so the server's native origin check
  accepts mutations.

---

## 8. Theme and design system

React Native has no Tailwind/daisyUI. Build a small token layer:

```ts
export interface ThemeTokens {
  background: string;
  surface: string;
  surfaceMuted: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  primaryText: string;
  error: string;
  errorSurface: string;
}
```

- Provide `light` and `dark` palettes. Use the system scheme by default.
- Persist `"system" | "light" | "dark"` in AsyncStorage.
- Theme provider exposes `colors`, `mode`, `setMode`.
- Set `StatusBar` style from the resolved theme.
- Use `react-native-safe-area-context` for insets; never rely on hardcoded
  status-bar heights.
- Minimum touch target: 44×44 points.
- Respect dynamic type / font scaling. Avoid fixed-height text containers.
- Use `KeyboardAvoidingView` in auth, save modal, and note modal.
- Keep the visual language close to the web: rounded cards, subtle borders,
  muted metadata, primary paste button, tag chips, readable long-form content.

Suggested mappings:

| Web token | Mobile token |
| --- | --- |
| `base-100` | `surface` |
| `base-200` | `background` / `surfaceMuted` |
| `base-300` | `border` |
| `base-content` | `text` |
| `base-content/60` | `textMuted` |
| `primary` | `primary` |
| `primary-content` | `primaryText` |
| `error` | `error` / `errorSurface` |

Use `Pressable` with pressed-state opacity/background, not web `hover` styles.

---

## 9. Screens and components

### 9.1 Login / signup

`AuthForm` handles both modes:

- Name field for signup only.
- Email and password fields.
- Client validation matching the server (password minimum 8).
- Loading state, inline error, disabled submit while pending.
- `KeyboardAvoidingView` + `ScrollView` so small screens and keyboards work.
- Links between login and signup via Expo Router.
- After success: `await authClient.getSession()`/refetch, then
  `router.replace("/responses")`.
- Use `returnKeyType`, `autoComplete`, `textContentType`, and
  `keyboardType="email-address"` for native keyboard behavior.

### 9.2 Responses list

Header:

- Title: `Responses Saved`.
- Count badge (`items.length`, with `+` when more pages exist).
- Account menu button: theme mode, Sign out.
- Primary **Paste** button.

Search and filters:

- `TextInput` with search icon and clear button.
- 250 ms debounced search.
- Horizontal tag chips: `All` + tags from `GET /api/tags`.
- Active chip uses primary background; include accessible selected state.
- Changing search/tag resets the cursor and reloads the first page.
- Keep the existing items visible while a refresh is in flight when possible.

List:

- `FlatList` with `keyExtractor`, `refreshControl`, `onEndReached`, and
  `onEndReachedThreshold`.
- Row: title (2 lines max), tag chips (or `#tag` text), relative saved date,
  format label.
- `onPress` → `router.push({ pathname: "/responses/[itemId]", params: { itemId } })`.
- Loading: skeleton rows.
- Error: inline error card with Retry.
- Empty: explain paste flow with a Paste button.
- Filters with no matches: “No matches” + clear filters.
- `ListFooterComponent`: spinner while `loadingMore`.
- Memoize `SavedItemRow`; avoid inline heavy render functions.

Account menu:

- Simple `Modal` bottom sheet or popover.
- Theme: System / Light / Dark.
- Sign out, with confirmation.
- Show the signed-in name/email.

### 9.3 Paste flow

`PasteButton`:

1. `Clipboard.getStringAsync()` inside the press handler.
2. If the clipboard is empty/whitespace, show an error toast and do not open
   the modal.
3. If content exceeds 256 KiB (UTF-8 bytes), show an error toast.
4. Detect format and suggest a title.
5. Open `SaveItemModal` with the draft.

Fallback conditions:

- Expo Clipboard throws or permission is denied.
- The clipboard contains no text.
- Any unexpected platform error.

On fallback, open `SaveItemModal` in manual mode with:

- An editable multiline `TextInput`.
- A **Paste from clipboard** button that retries `Clipboard.getStringAsync()`.
- Instructions to long-press and choose Paste if programmatic reading fails.

UTF-8 byte length must not depend on `TextEncoder` being present in Hermes.
Implement a small code-point loop in `markdown.ts`:

```ts
export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const char of value) {
    const codePoint = char.codePointAt(0)!;
    bytes +=
      codePoint < 0x80 ? 1 :
      codePoint < 0x800 ? 2 :
      codePoint < 0x10000 ? 3 : 4;
  }
  return bytes;
}
```

### 9.4 Save modal

Use React Native `Modal` with `animationType="slide"` (or a full-screen route
if the content becomes too large for a modal).

Fields and behavior:

- Content textarea (read-only if read from clipboard; editable in manual mode).
- Character count.
- Title input, max 200, auto-focused after the modal opens.
- Format toggle: Markdown / Plain text.
- Tag chip input with suggestions from the user's tags.
- Cancel / Save buttons.
- Saving spinner and disabled submit.
- Inline error from client validation or the server.
- Close button; Android `onRequestClose` closes unless saving.
- Dismissing the modal or cancelling makes no network request and creates no
  row.

Tag input:

- Add on Submit/Enter/comma.
- Remove chip with an × button; Backspace on an empty input removes the last
  chip.
- Normalize lowercase, collapse whitespace, dedupe.
- Enforce ≤ 10 tags and ≤ 32 chars in the UI; the server validates again.
- Suggestions are horizontally scrollable chips; tapping one adds it.

On save:

```ts
const created = await itemsApi.create(input);
prependItem(created);
await refreshTags();
setDraft(null);
router.push({ pathname: "/responses/[itemId]", params: { itemId: created.id } });
showToast("success", "Saved to your responses.");
```

### 9.5 Detail screen

Use the stack header for a native back button, or a custom back row if the
header is hidden. If the user deep-linked directly, back should fall back to
`/responses`.

Content:

- Title, tags, saved date, format.
- Actions: Copy, Delete.
- Tag note cards for each tag that has a note; tapping Edit opens the note
  modal.
- Content card:
  - Markdown → `MarkdownContent`.
  - Plain text → selectable monospaced `Text` with preserved line breaks.
- Loading skeleton while `GET /api/items/:id` is in flight.
- `404` → “This saved item is gone” with a Back button.
- Network error → retry.
- Delete uses `Alert.alert` confirmation; after success remove from the provider
  and `router.back()`/`router.replace("/responses")`.

Copy:

```ts
await Clipboard.setStringAsync(item.content);
showToast("success", "Raw content copied to clipboard.");
```

### 9.6 Tag note modal

- Fetch the note when the card is expanded or the modal opens.
- Multiline `TextInput`, max 20,000 chars.
- Dirty-state-aware Save button.
- Show character count and inline error.
- `PUT /api/tags/:id/note` on save.
- Disable saving while in flight.
- Update the card after success.

### 9.7 Markdown rendering

Use:

```tsx
import Markdown from "@ronradtke/react-native-markdown-display";

<Markdown
  style={markdownStyles}
  markdownit={{ html: false, linkify: true, typographer: true }}
  onLinkPress={(url) => {
    Linking.openURL(url).catch(() => showToast("error", "Could not open link"));
    return false;
  }}
>
  {content}
</Markdown>
```

Style requirements:

- Headings, paragraphs, lists, blockquotes, links, inline code, fenced blocks.
- Code blocks use a monospaced font and horizontal scroll.
- Tables use a horizontal `ScrollView` wrapper; do not shrink columns until
  text is unreadable.
- Do not enable raw HTML.
- Handle very large documents: test a ~256 KiB Markdown item; if rendering
  becomes unusable, consider a “show full content” action or a future
  virtualized renderer.

### 9.8 Toast

Implement a small `ToastProvider`:

- `success` / `error` / `info`.
- Positioned above the safe-area bottom inset.
- Auto-dismiss after ~3 seconds.
- One toast at a time is enough; queue or replace.
- Use `accessibilityLiveRegion="polite"` on Android and an accessible label.

---

## 10. State management details

`ResponsesProvider`:

```ts
interface ResponsesState {
  items: SavedItemSummary[];
  tags: Tag[];
  nextCursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  search: string;
  activeTag: string;
  setSearch(value: string): void;
  setActiveTag(value: string): void;
  refresh(): Promise<void>;
  loadMore(): Promise<void>;
  refreshTags(): Promise<void>;
  prependItem(item: SavedItemSummary): void;
  removeItem(id: string): void;
}
```

Implementation requirements:

- Debounce search by 250 ms.
- Use a request sequence/abort controller so stale responses cannot overwrite
  newer filters.
- Reset pagination when `q` or `tag` changes.
- Keep existing items on refresh errors; show a non-destructive error toast or
  inline banner.
- `useFocusEffect` can refresh tags when returning from a save, but avoid
  reloading the entire list and losing scroll position unnecessarily.
- Scroll to top when search/tag changes.

Detail data:

- Fetch by `itemId` on mount and when the route param changes.
- Handle rapid navigation/unmounts with a cancellation flag.
- Cache the last fetched item in the provider only if it avoids a visible
  flicker; do not cache across sign-out/user changes.

---

## 11. Configuration and native metadata

`app.config.ts`:

```ts
import type { ExpoConfig } from "expo/config";

const config: ExpoConfig = {
  name: "bot-cherry",
  slug: "bot-cherry",
  scheme: "botcherry",
  version: "0.1.0",
  orientation: "portrait",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  icon: "./assets/icon.png",
  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: "#f5f5f4",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.botcherry.mobile",
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#f5f5f4",
    },
    package: "com.botcherry.mobile",
  },
  plugins: ["expo-router", "expo-secure-store", "expo-clipboard"],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    // Optional build-time metadata.
  },
};

export default config;
```

- Confirm the bundle identifiers before publishing.
- Use placeholder cherry assets initially; replace with the real brand assets
  before store submission.
- If shipping to the App Store, set
  `ios.config.usesNonExemptEncryption = false` when using only standard
  encryption.
- `scheme` must be identical to `APP_SCHEME` and server `MOBILE_APP_SCHEME`.
- Consider adding `expo-build-properties` only if native build settings are
  needed; not required for v1.

`eas.json`:

```json
{
  "cli": { "version": ">= 12.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": { "distribution": "internal" },
    "production": { "autoIncrement": true }
  },
  "submit": { "production": {} }
}
```

Build environment variables:

- Set `EXPO_PUBLIC_API_URL` for each EAS profile (via EAS environment variables
  or `eas.json` environment-specific config).
- Never put database/auth secrets in the mobile app.

`tsconfig.json`:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

`babel.config.js` should use `babel-preset-expo`. Add the expo-router plugin
only if required by the selected SDK.

---

## 12. Implementation order

### Phase 0 — De-risk auth and networking first

1. Create `apps/mobile` with Expo Router and native dependencies.
2. Add `MOBILE_APP_SCHEME`, `@better-auth/expo`, `expo()` plugin, and the native
   origin check on the server.
3. Configure `expoClient`, `AuthProvider`, login/signup screens.
4. Verify on iOS simulator and Android emulator:
   - Sign up.
   - `GET /api/auth/get-session` returns the user.
   - `GET /api/items` with `authClient.getCookie()` returns `200`.
   - `POST /api/items` with `expo-origin` returns `201`.
   - Kill and relaunch the app; the session is restored from SecureStore.
   Do not build the full UI until this flow works.

### Phase 1 — App foundation

5. Add theme tokens, ThemeProvider, SafeArea handling, ToastProvider.
6. Add `types.ts`, `markdown.ts`, `date.ts`, `env.ts`, `api.ts`.
7. Add route guards and the root/app stack.
8. Add account/theme/sign-out menu.
9. Add API error handling and 401 redirect behavior.

### Phase 2 — Responses list and detail

10. Add `useSavedItems`, `ResponsesProvider`, list skeleton/empty/error states.
11. Build the list header, search, tag filter, FlatList rows, pagination, and
    pull-to-refresh.
12. Add `useSavedItem` and the detail screen.
13. Add Markdown/plain rendering.
14. Add copy, delete confirmation, and not-found handling.

### Phase 3 — Paste and save

15. Add `PasteButton` with clipboard read and manual fallback.
16. Add `SaveItemModal`, `TagInput`, and client validation.
17. Wire create → prepend → navigate → success toast.
18. Add format detection and title suggestion parity with the web.

### Phase 4 — Tag notes and parity

19. Add tag-note read cards and the edit modal.
20. Add full date/relative-date formatting parity.
21. Add accessibility labels, hit slop, keyboard behavior, and Android back
    handling.
22. Test large content, long titles, many tags, and long tag notes.

### Phase 5 — Configuration, CI, docs

23. Add `app.config.ts`, `eas.json`, placeholder assets, and `.env.example`.
24. Add a mobile CI workflow that runs install + typecheck on `apps/mobile`
    changes. Optionally run `expo-doctor`.
25. Update the README:
    - Add mobile to the app table and repository structure.
    - Document running the server for LAN/device testing.
    - Document `EXPO_PUBLIC_API_URL`, `MOBILE_APP_SCHEME`, SecureStore auth, and
      the native `expo-origin` requirement.
    - Document EAS build commands and environment variables.
26. Update `AGENTS.md` with mobile commands, layout, and conventions.
27. Run `pnpm typecheck` and `pnpm --filter @bot-cherry/mobile doctor`.

---

## 13. Edge cases

| Case | Expected behavior |
| --- | --- |
| Clipboard read denied | Open manual-paste modal with retry button |
| Clipboard empty/whitespace | Error toast; no modal, no row |
| Content > 256 KiB | Error toast / inline error; no save |
| Manual paste of empty content | Save disabled |
| Title whitespace only | Save disabled; server also rejects |
| > 10 tags | UI prevents adding; server rejects if bypassed |
| Duplicate tags with different case | Normalized and deduped |
| Very long title | Client max length + server 422 |
| Markdown contains raw HTML | Escaped/not rendered |
| Plain text indentation | Preserved and selectable |
| Wide Markdown table | Horizontally scrollable |
| Very large Markdown item | Should not crash; test performance |
| Slow/offline network | Timeout message with retry |
| Session expires while saving | Keep modal open; prompt re-login |
| Session expires on list load | Redirect to login with message |
| Double-tap Save | Button disabled while saving |
| Item deleted from another device | Detail shows not found, back to list |
| User opens another user's item ID | Server returns 404 |
| Deep link to `/responses/:id` while signed out | Login, then target or list |
| Android hardware back inside modal | Closes modal, not the screen |
| Keyboard covers inputs | KeyboardAvoidingView + ScrollView |
| App restarts | Session restored from SecureStore |
| Sign out | SecureStore session cleared; redirect to login |
| Theme changes | Screens update without app restart |
| Physical device uses `localhost` | Document how to set LAN IP; show clear network error |

---

## 14. Security and performance notes

- Keep all item/tag queries scoped to the session user; never trust a user ID
  from the request body.
- Return `404` for items owned by another user.
- Validate request bodies on the server; mobile-side checks are UX only.
- Do not log the session cookie, or any request headers containing it.
- Store only auth/session state in SecureStore. Do not store pasted content
  there.
- Do not enable Markdown raw HTML.
- Keep `Cache-Control: no-store` behavior for private API responses.
- The native origin check must be limited to the configured scheme and dev
  `exp://` origins; do not accept arbitrary `Origin`/`expo-origin` values.
- Use `FlatList` and compact list summaries; never fetch content for every row.
- Debounce search and cancel stale requests.
- Avoid rendering unvirtualized long lists; for large result sets use cursor
  pagination.
- Memoize list rows and theme tokens to reduce re-renders.
- Keep bundle size reasonable: avoid large UI kits or icon packs that are not
  needed.
- `expo-secure-store` has a value-size limit; better-auth handles chunking in
  the Expo client plugin, but verify session storage with a long session token.

---

## 15. Acceptance criteria

- [ ] `apps/mobile` exists as `@bot-cherry/mobile` and is part of the pnpm
      workspace.
- [ ] `pnpm typecheck` passes for server, web client, and mobile.
- [ ] The web app still signs in and works unchanged.
- [ ] A user can sign up and sign in from the mobile app.
- [ ] The mobile session survives an app restart.
- [ ] The mobile app can call authenticated item/tag APIs, including
      `POST`/`PUT`/`DELETE`, without a browser `Origin` header.
- [ ] The responses list shows items from the current user only.
- [ ] Search, tag filtering, pagination, pull-to-refresh, loading, empty, and
      error states work.
- [ ] Paste reads the clipboard and opens the save modal.
- [ ] Clipboard denial/empty/oversized cases are handled and manual paste
      works.
- [ ] The save modal validates title/content/tags and creates exactly one item.
- [ ] A new item is prepended, selected, and visible after an app restart.
- [ ] Markdown renders headings, lists, tables, code, links, and blockquotes
      without HTML injection.
- [ ] Plain text preserves line breaks and is selectable.
- [ ] Copy raw content works.
- [ ] Delete removes the item and navigates back safely.
- [ ] Tag notes can be read and edited.
- [ ] User A cannot read or delete User B's items.
- [ ] Light/dark/system themes work and persist.
- [ ] Layout works on a small phone, a large phone, and a tablet.
- [ ] Keyboard and Android back behavior are correct.
- [ ] EAS configuration and environment documentation are present.
- [ ] README and AGENTS.md document the mobile app and commands.

---

## 16. Manual test checklist

### Setup

1. Start the server with LAN access:
   `pnpm --filter @bot-cherry/server dev -- --ip 0.0.0.0`.
2. Start the web client to confirm no regression: `pnpm dev`.
3. Set `EXPO_PUBLIC_API_URL` for the target device.
4. Start the mobile app: `pnpm --filter @bot-cherry/mobile start`.
5. Run on an iOS simulator, Android emulator, and at least one physical device.

### Auth

6. Sign up with a new user; confirm the session is created.
7. Kill and reopen the app; confirm the user is still signed in.
8. Sign out; confirm redirect to login and that reopening the app stays signed
   out.
9. Sign in again; confirm the responses list loads.
10. Force a 401 (expire/delete the session) and confirm redirect/message.

### Save and read

11. Copy a Markdown answer with headings, a table, and a code block.
12. Tap Paste; confirm detected format and suggested title.
13. Edit the title, add two tags, and save.
14. Confirm the item opens immediately and the Markdown renders correctly.
15. Reload the app; confirm the item and tags persist.
16. Copy plain text with indentation; save as plain text and confirm
    whitespace is preserved.
17. Deny/disable clipboard access; confirm manual paste still saves.
18. Try an empty clipboard and a > 256 KiB clipboard; confirm errors and no
    row created.
19. Try > 10 tags and a > 200-character title; confirm validation.
20. Double-tap Save; confirm only one item is created.

### Browse and manage

21. Search by title/content and confirm results narrow.
22. Filter by tag and clear the filter.
23. Scroll to trigger pagination; confirm the count/footer are correct.
24. Pull to refresh; confirm the list refreshes.
25. Edit a tag note from the detail screen; reopen and confirm persistence.
26. Copy raw content and compare it with the original.
27. Delete an item; confirm it disappears and the count updates.
28. Delete the currently open item; confirm navigation returns to the list.
29. Open an item ID that no longer exists; confirm the not-found state.

### Security, layout, and polish

30. Sign in as User B and confirm User A's items are absent.
31. Attempt direct API access with User A's item ID using User B's cookie;
    confirm `404`.
32. Test on a 320–375 pt wide phone, a large phone, and a tablet.
33. Test the keyboard over the save and note modals; confirm fields remain
    reachable.
34. Test Android hardware back in modals and detail.
35. Switch System/Light/Dark and confirm the whole app updates without restart.
36. Turn off the network, open the app, and confirm useful retry states.
37. Run `pnpm typecheck`, `pnpm --filter @bot-cherry/mobile doctor`, and a
    release export/build.

---

## 17. Follow-up ideas

- Extract `types.ts`, `markdown.ts`, `date.ts`, and the API wrapper into
  `packages/shared` so web and mobile stay in sync.
- Add a tablet split-pane layout.
- Add share-sheet / Android intent capture for pasting from other apps.
- Add offline read cache and optimistic sync queue.
- Add biometric unlock for the app session.
- Add push notifications or reminders.
- Add image/file attachments.
- Add full-text search ranking on the server.
- Add editable item titles/tags/content on mobile.
- Add EAS Update channels for over-the-air JS updates.
- Add a store-release workflow with `eas submit`.
