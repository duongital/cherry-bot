const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

// Production/preview bundles must never fall back to localhost. Local dev can
// still use the Worker directly when no .env.local is present.
const defaultApiUrl = __DEV__
  ? "http://localhost:8787"
  : "https://cherry-api.flipbee.app";

export const API_URL = (configuredApiUrl || defaultApiUrl).replace(
  /\/$/,
  "",
);

export const APP_SCHEME =
  process.env.EXPO_PUBLIC_APP_SCHEME ?? "botcherry";

export const APP_ORIGIN = `${APP_SCHEME}://`;

if (__DEV__ && !/^https?:\/\//.test(API_URL)) {
  console.warn(
    `EXPO_PUBLIC_API_URL should start with http:// or https:// (got "${API_URL}").`,
  );
}
