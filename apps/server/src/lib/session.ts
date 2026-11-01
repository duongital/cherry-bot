import type { MiddlewareHandler } from "hono";
import { getAuth } from "../auth";
import { logWarn } from "./logger";
import type { AppEnv } from "../types";

/**
 * Require a valid better-auth session. Route handlers must use the user ID
 * stored on the context and never trust one supplied by the client.
 */
export const requireSession: MiddlewareHandler<AppEnv> = async (c, next) => {
  const session = await getAuth(c.env).api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    logWarn("auth.unauthorized", {
      requestId: c.get("requestId"),
      method: c.req.method,
      path: c.req.path,
    });
    return c.json(
      { error: { code: "UNAUTHORIZED", message: "Sign in required" } },
      401,
    );
  }

  c.set("user", session.user);
  c.set("session", session.session);
  await next();
};
