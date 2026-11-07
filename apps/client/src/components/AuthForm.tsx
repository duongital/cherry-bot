import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { authClient } from "../lib/auth-client";

type Mode = "login" | "signup";

export default function AuthForm({ mode }: { mode: Mode }) {
  const session = authClient.useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo =
    (location.state as { from?: string } | null)?.from ?? "/";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function handleGoogle() {
    setError(null);
    setGoogleLoading(true);
    try {
      // Absolute URL so better-auth returns the browser to the web app after
      // the Google callback (the server must have it in `trustedOrigins`).
      const res = await authClient.signIn.social({
        provider: "google",
        callbackURL: `${window.location.origin}${redirectTo}`,
      });
      if (res.error) throw new Error(res.error.message ?? "Google sign in failed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setGoogleLoading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "signup") {
        const res = await authClient.signUp.email({ name, email, password });
        if (res.error) throw new Error(res.error.message ?? "Sign up failed");
      } else {
        const res = await authClient.signIn.email({ email, password });
        if (res.error) throw new Error(res.error.message ?? "Sign in failed");
      }
      await session.refetch();
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  if (session.isPending) {
    return <div className="surface-card">🍒 Loading…</div>;
  }

  if (session.data) {
    return <Navigate to={redirectTo} replace />;
  }

  return (
    <form className="surface-card auth-card" onSubmit={handleSubmit}>
      <h1>
        {mode === "login" ? "🍒 Welcome back" : "🍒 Create your account"}
      </h1>
      <p className="subtitle">
        {mode === "login"
          ? "Sign in to keep chatting with cherry-bot."
          : "One account is all you need to get started."}
      </p>

      <button
        type="button"
        className="app-btn app-btn-ghost"
        onClick={handleGoogle}
        disabled={loading || googleLoading}
      >
        {googleLoading ? "Redirecting…" : "Continue with Google"}
      </button>

      <p className="auth-divider">or use your email</p>

      {mode === "signup" && (
        <label>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ada Lovelace"
            autoComplete="name"
            required
          />
        </label>
      )}

      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          required
        />
      </label>

      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 8 characters"
          minLength={8}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
        />
      </label>

      {error && <p className="error">{error}</p>}

      <button type="submit" className="app-btn" disabled={loading}>
        {loading
          ? "Please wait…"
          : mode === "login"
            ? "Log in"
            : "Create account"}
      </button>

      <p className="switch-mode">
        {mode === "login" ? (
          <>
            Need an account? <Link to="/signup">Sign up</Link>
          </>
        ) : (
          <>
            Already have an account? <Link to="/login">Log in</Link>
          </>
        )}
      </p>
    </form>
  );
}
