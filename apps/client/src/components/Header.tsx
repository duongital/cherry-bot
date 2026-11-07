import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { authClient } from "../lib/auth-client";
import ThemePicker from "./ThemePicker";

function CherryIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M16.5 4.5c-.5 3.5-2.5 6.5-6 9M17 4.5c.5 3.5 2.5 6.5 6 9"
        stroke="#4d7c0f"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M17.5 5.5c1.8-2.2 4.2-2.8 6.5-1.8-1.3 2.6-3.7 3.7-6.5 1.8Z"
        fill="#84cc16"
      />
      <circle cx="9.5" cy="21" r="6.25" fill="#e11d48" />
      <circle cx="22.5" cy="21" r="6.25" fill="#be123c" />
      <circle cx="7.5" cy="18.5" r="1.6" fill="#fda4af" opacity=".8" />
      <circle cx="20.5" cy="18.5" r="1.6" fill="#fda4af" opacity=".8" />
    </svg>
  );
}

const apps = [
  { name: "Cherry Health", to: "/health" },
  { name: "Cherry Responses", to: "/responses" },
] as const;

/**
 * Round profile picture. Google accounts come with `user.image`; password
 * accounts have none, so fall back to the initial of the display name.
 * `referrerPolicy="no-referrer"` keeps Google's CDN from rejecting the image
 * when the page is served from a different origin, and a load error degrades
 * to the initials instead of a broken-image icon.
 */
function Avatar({
  name,
  image,
  className = "size-7",
}: {
  name: string;
  image?: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(image) && !failed;
  const initial = (name.trim()[0] ?? "?").toUpperCase();

  if (showImage) {
    return (
      <img
        src={image ?? undefined}
        alt=""
        aria-hidden="true"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`${className} shrink-0 rounded-full border border-base-300 object-cover`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${className} flex shrink-0 items-center justify-center rounded-full bg-base-200 text-xs font-semibold text-base-content/70`}
    >
      {initial}
    </span>
  );
}

function UserMenu({
  userName,
  userImage,
  signingOut,
  onSignOut,
}: {
  userName: string;
  userImage?: string | null;
  signingOut: boolean;
  onSignOut: () => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${userName}`}
        onClick={() => setOpen((value) => !value)}
        className="flex cursor-pointer items-center gap-2 rounded-full border border-base-300 bg-base-100 py-1 pl-1 pr-3 text-sm font-medium text-base-content/70 shadow-sm transition-colors hover:bg-base-200 hover:text-base-content focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <Avatar name={userName} image={userImage} className="size-7" />
        <span className="max-w-40 truncate">Hi, {userName}</span>
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className={`size-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="m5 7.5 5 5 5-5" />
        </svg>
      </button>

      {open && (
        <ul
          role="menu"
          aria-label="Account actions"
          className="absolute right-0 z-50 mt-2 w-44 rounded-box border border-base-300 bg-base-100 p-1.5 shadow-xl"
        >
          <li role="none">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
              disabled={signingOut}
              className="flex w-full cursor-pointer items-center rounded-field px-3 py-2 text-left text-sm text-base-content transition-colors hover:bg-base-200 focus-visible:bg-base-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

export default function Header() {
  const session = authClient.useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const [signingOut, setSigningOut] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const userName = session.data?.user.name?.trim();
  const userImage = session.data?.user.image;
  const activeApp = apps.find(
    (app) =>
      location.pathname === app.to ||
      location.pathname.startsWith(`${app.to}/`),
  );

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await authClient.signOut();
      await session.refetch();
      navigate("/", { replace: true });
    } finally {
      setSigningOut(false);
      setDrawerOpen(false);
    }
  }

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const desktopQuery = window.matchMedia("(min-width: 768px)");
    function handleDesktopChange(event: MediaQueryListEvent) {
      if (event.matches) setDrawerOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setDrawerOpen(false);
    }

    desktopQuery.addEventListener("change", handleDesktopChange);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      desktopQuery.removeEventListener("change", handleDesktopChange);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [drawerOpen]);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-base-300 bg-base-100/95 backdrop-blur">
        <div className="navbar mx-auto min-h-14 w-full max-w-6xl px-4">
          <div className="navbar-start gap-1">
            <Link
              to="/"
              aria-label="cherry-bot home"
              className="inline-flex items-center rounded-full p-2 transition-colors hover:bg-base-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <CherryIcon className="size-7" />
            </Link>

            {session.data && activeApp && (
              <Link
                to={activeApp.to}
                className="rounded-full px-1.5 py-1.5 text-sm font-semibold text-base-content transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:hidden"
              >
                {activeApp.name}
              </Link>
            )}

            <nav
              aria-label="Main navigation"
              className="hidden items-center gap-0.5 md:flex"
            >
              {session.data &&
                apps.map((app) => (
                  <NavLink
                    key={app.to}
                    to={app.to}
                    className={({ isActive }) =>
                      `rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-base-200 text-base-content"
                          : "text-base-content/70 hover:bg-base-200 hover:text-base-content"
                      }`
                    }
                  >
                    {app.name}
                  </NavLink>
                ))}
            </nav>
          </div>

          <div className="navbar-end gap-2 sm:gap-3">
            <div className="hidden items-center gap-2 sm:gap-3 md:flex">
              {userName && (
                <UserMenu
                  userName={userName}
                  userImage={userImage}
                  signingOut={signingOut}
                  onSignOut={handleSignOut}
                />
              )}
              <ThemePicker />
            </div>

            <button
              type="button"
              aria-label="Open menu"
              aria-haspopup="dialog"
              aria-expanded={drawerOpen}
              aria-controls="mobile-menu"
              onClick={() => setDrawerOpen(true)}
              className="inline-flex size-10 cursor-pointer items-center justify-center rounded-full text-base-content transition-colors hover:bg-base-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:hidden"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
                className="size-6"
              >
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            tabIndex={-1}
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 cursor-default bg-black/40"
          />

          <aside
            id="mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-label="Main menu"
            className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col border-l border-base-300 bg-base-100 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-base-300 px-4 py-3">
              <span className="text-sm font-semibold text-base-content">
                Menu
              </span>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setDrawerOpen(false)}
                className="inline-flex size-9 cursor-pointer items-center justify-center rounded-full text-base-content/70 transition-colors hover:bg-base-200 hover:text-base-content focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  aria-hidden="true"
                  className="size-5"
                >
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-5 overflow-y-auto p-4">
              {session.data && (
                <nav aria-label="Mobile navigation" className="flex flex-col gap-1">
                  <NavLink
                    to="/health"
                    onClick={() => setDrawerOpen(false)}
                    className={({ isActive }) =>
                      `rounded-field px-3 py-2.5 text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-base-200 text-base-content"
                          : "text-base-content/70 hover:bg-base-200 hover:text-base-content"
                      }`
                    }
                  >
                    Cherry Health
                  </NavLink>
                  <NavLink
                    to="/responses"
                    onClick={() => setDrawerOpen(false)}
                    className={({ isActive }) =>
                      `rounded-field px-3 py-2.5 text-sm font-medium transition-colors ${
                        isActive
                          ? "bg-base-200 text-base-content"
                          : "text-base-content/70 hover:bg-base-200 hover:text-base-content"
                      }`
                    }
                  >
                    Cherry Responses
                  </NavLink>
                </nav>
              )}

              <div className="flex flex-col gap-2">
                <span className="px-1 text-xs font-semibold uppercase tracking-wide text-base-content/50">
                  Theme
                </span>
                <ThemePicker className="w-full" />
              </div>

              {userName && (
                <div className="mt-auto rounded-box border border-base-300 bg-base-200/50 p-3">
                  <p className="flex items-center gap-2 truncate text-sm font-medium text-base-content">
                    <Avatar name={userName} image={userImage} className="size-8" />
                    <span className="truncate">Hi, {userName}</span>
                  </p>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    disabled={signingOut}
                    className="mt-2 w-full cursor-pointer rounded-field border border-base-300 bg-base-100 px-3 py-2 text-sm font-medium text-base-content transition-colors hover:bg-base-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {signingOut ? "Signing out…" : "Sign out"}
                  </button>
                </div>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
