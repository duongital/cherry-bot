import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { expo } from "@better-auth/expo";
import { createDb } from "./db";
import { schema } from "./schema";

export interface AuthEnv {
  DATABASE_URL: string;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  CLIENT_URL: string;
  MOBILE_APP_SCHEME?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

export function createAuth(env: AuthEnv) {
  const db = createDb(env.DATABASE_URL);
  const isProduction = env.BETTER_AUTH_URL.startsWith("https://");
  const mobileScheme = env.MOBILE_APP_SCHEME ?? "botcherry";

  // Native Expo requests do not have a browser Origin header. The Expo plugin
  // forwards the app scheme through `expo-origin`, and better-auth checks it
  // against these trusted origins.
  const trustedOrigins = [env.CLIENT_URL, `${mobileScheme}://`];
  if (!isProduction) {
    trustedOrigins.push("exp://", "http://localhost:8081");
  }

  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    // Allow the web app and native mobile app to call the auth API.
    trustedOrigins,
    plugins: [expo()],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
    }),
    emailAndPassword: {
      enabled: true,
      // Phase 1: no email provider, so require no verification.
      requireEmailVerification: false,
    },
    // Google sign-in. Skipped entirely when the credentials are absent (for
    // example a local checkout without a Google OAuth client) so the rest of
    // the auth API keeps working.
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          socialProviders: {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
              prompt: "select_account" as const,
              // Refresh `user.name` / `user.image` from the Google profile on
              // every sign-in, so accounts that were created with a password
              // and only later linked to Google pick up the Google avatar
              // (and stay in sync if the user changes it), not just at the
              // moment of linking.
              overrideUserInfoOnSignIn: true,
            },
          },
        }
      : {}),
    account: {
      accountLinking: {
        // Signing in with Google using an email that already has a local
        // password account links the Google account to that existing user
        // instead of failing with `account_not_linked`. Only providers listed
        // here are auto-linked; better-auth additionally requires the
        // provider to report a verified email, so a Google account created
        // with someone else's address cannot take over the local account.
        enabled: true,
        trustedProviders: ["google"],
        // Existing password accounts were created before any email provider
        // existed, so `user.email_verified` is false for all of them. Better
        // auth otherwise refuses to link them (OAuth error
        // `account_not_linked`) unless the *local* email is verified too.
        // Google only issues a verified email for an address the user
        // controls, so accepting it as proof of ownership is safe for real
        // accounts. Revisit this (set it back to `true`) once we send our own
        // verification emails, so a pre-registered-but-unverified local
        // account cannot be taken over by whoever later proves the address.
        requireLocalEmailVerified: false,
      },
    },
    advanced: {
      // HTTPS in production (Cloudflare), http on localhost.
      useSecureCookies: isProduction,
      // Pages (*.pages.dev) and the Worker (*.workers.dev) are cross-site,
      // so cookies must be SameSite=None there. localhost ports are same-site
      // and keep Lax.
      defaultCookieAttributes: {
        sameSite: isProduction ? "none" : "lax",
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

// Cache the auth instance per isolate. Workers reuse the isolate across
// requests, but `env` bindings are only available inside the fetch handler,
// so we create the instance lazily on first use.
let cachedAuth: Auth | null = null;

export function getAuth(env: AuthEnv): Auth {
  if (!cachedAuth) {
    cachedAuth = createAuth(env);
  }
  return cachedAuth;
}
