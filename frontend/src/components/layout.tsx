import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  BookOpen,
  CalendarCheck,
  CalendarDays,
  ChevronDown,
  LayoutDashboard,
  LogOut,
  Menu,
  NotebookPen,
  Plus,
  Scale,
  Target,
  Sparkles,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { send } from "../lib/api";
import { useAuth } from "../lib/auth-context";
import { LogoMark, Wordmark } from "./logo";
import { ThemeToggle } from "./theme-toggle";

/**
 * The navigation, which differs by role.
 *
 * A student's season is about their own board; an officer's job is publishing
 * to everyone's. So the officer gets one extra destination — the batch's
 * placement policy — and nothing is taken away, because an officer is also a
 * person with a board.
 */
interface NavItem {
  to: string;
  label: string;
  Icon: typeof LayoutDashboard;
  end?: boolean;
  /** Rendered only for a CDC officer. */
  officerOnly?: boolean;
}

/**
 * The navigation, in three groups.
 *
 * Grouped because the sidebar is about to hold a dozen destinations and a flat
 * list of twelve is a list nobody reads. The split follows what the student is
 * actually doing: deciding where to apply, preparing for it, and managing
 * their own account.
 *
 * Every entry here resolves to a real, implemented page. Items are added as
 * their pages land rather than up front — a nav item that routes to an empty
 * shell teaches the student that the sidebar lies, and they stop clicking.
 */
const NAV_GROUPS: { heading: string; items: NavItem[] }[] = [
  {
    heading: "Main",
    items: [
      { to: "/", label: "Overview", Icon: LayoutDashboard, end: true },
      { to: "/drives", label: "Placement drives", Icon: Scale },
      { to: "/calendar", label: "Calendar", Icon: CalendarDays },
      { to: "/simulate", label: "Offer simulator", Icon: Sparkles },
    ],
  },
  {
    heading: "Preparation",
    items: [
      { to: "/prepare", label: "Preparation", Icon: BookOpen },
      { to: "/skills-gap", label: "Skills gap analysis", Icon: Target },
      { to: "/planner", label: "Study planner", Icon: CalendarCheck },
      { to: "/notes", label: "My notes", Icon: NotebookPen },
    ],
  },
  {
    heading: "Account",
    items: [
      { to: "/profile", label: "Profile", Icon: UserRound },
      { to: "/policy", label: "Batch policy", Icon: ShieldCheck, officerOnly: true },
    ],
  },
];

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const { isOfficer } = useAuth();

  return (
    <nav aria-label="Main" className="flex flex-col gap-5">
      {NAV_GROUPS.map((group) => {
        const items = group.items.filter((item) => !item.officerOnly || isOfficer);
        // A group whose every item is officer-only disappears entirely for a
        // student, rather than leaving a heading over nothing.
        if (items.length === 0) return null;
        return (
          <div key={group.heading}>
            <h2 className="px-3 pb-1.5 text-2xs font-semibold uppercase tracking-wider text-faint">
              {group.heading}
            </h2>
            <div className="flex flex-col gap-0.5">
              {items.map(({ to, label, Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={onNavigate}
                  className={({ isActive }) => `nav-item ${isActive ? "nav-item-active" : ""}`}
                >
                  <Icon className="h-[1.05rem] w-[1.05rem] shrink-0" aria-hidden="true" />
                  <span className="truncate">{label}</span>
                </NavLink>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

/**
 * The account menu.
 *
 * A plain button and an absolutely positioned list rather than a library
 * popover: it needs to close on Escape, on outside click and on navigation,
 * and that is about twenty lines. Focus returns to the trigger on Escape so
 * keyboard users are not dropped at the top of the document.
 */
function AccountMenu() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const initials = (user?.name ?? user?.email ?? "?")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  async function signOut() {
    setBusy(true);
    await send("/api/auth/logout", "POST");
    setUser(null);
    navigate("/login", { replace: true });
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm transition-colors hover:bg-edge/40"
      >
        <span
          aria-hidden="true"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-2xs font-semibold text-accent"
        >
          {initials}
        </span>
        <span className="hidden max-w-[10rem] truncate font-medium sm:block">
          {user?.name || user?.email}
        </span>
        <ChevronDown className="hidden h-4 w-4 text-faint sm:block" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-1.5 w-60 origin-top-right animate-slide-up rounded-xl border border-edge bg-raised p-1 shadow-overlay"
        >
          <div className="px-3 py-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="truncate text-sm font-medium">{user?.name}</p>
              {/* Stated rather than inferred from which buttons are present:
                  an officer who finds Add a drive missing should be able to
                  check which account they are in without signing out. */}
              {user?.role === "cdc_officer" && (
                <span className="chip bg-accent/12 text-accent">
                  <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                  CDC officer
                </span>
              )}
            </div>
            <p className="truncate text-xs text-faint">{user?.email}</p>
            {user?.batchId && (
              <p className="mt-1.5 truncate font-mono text-2xs text-faint" title={user.batchId}>
                {user.batchId}
              </p>
            )}
          </div>
          <div className="my-1 h-px bg-edge" />
          <Link
            to="/profile"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-edge/40 hover:text-ink"
          >
            <UserRound className="h-4 w-4" aria-hidden="true" />
            Your profile
          </Link>
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={signOut}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-edge/40 hover:text-ink disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            {busy ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}

export function Layout() {
  const { user, isOfficer } = useAuth();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  // Route changes close the drawer; without this it stays open over the new
  // page on mobile.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // While the drawer is open it is the only thing on screen, so the page
  // behind it must not scroll under the overlay.
  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [drawerOpen]);

  // Signed out (the login route): a plain centred canvas, no shell.
  if (!user) {
    return (
      <div className="min-h-dvh">
        <Outlet />
      </div>
    );
  }

  return (
    <div className="min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-accent-ink"
      >
        Skip to content
      </a>

      {/* ---- Sidebar, large screens only ------------------------------- */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 shrink-0 flex-col border-r border-edge bg-card lg:flex">
        <div className="flex h-14 items-center gap-2 px-4">
          <Link to="/" className="flex items-center gap-2 rounded-lg px-1 py-1">
            <LogoMark className="h-[1.3rem] w-[1.3rem]" />
            <Wordmark className="text-[0.95rem]" />
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-2">
          <NavItems />
        </div>
        {/* Publishing is the officer's job. A student sees no stub and no
            disabled button — an affordance they can never use is just a
            question they have to ask someone about. */}
        {isOfficer && (
          <div className="border-t border-edge p-3">
            <Link to="/drives/new" className="btn-ghost w-full">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add a drive
            </Link>
          </div>
        )}
      </aside>

      {/* ---- Mobile drawer --------------------------------------------- */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={closeDrawer}
            className="absolute inset-0 animate-fade-in bg-ink/40 backdrop-blur-[2px]"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute inset-y-0 left-0 flex w-[17rem] max-w-[85vw] animate-slide-in-left flex-col border-r border-edge bg-card shadow-overlay"
          >
            <div className="flex h-14 items-center justify-between gap-2 border-b border-edge px-4">
              <Link to="/" className="flex items-center gap-2" onClick={closeDrawer}>
                <LogoMark className="h-[1.3rem] w-[1.3rem]" />
                <Wordmark className="text-[0.95rem]" />
              </Link>
              <button
                type="button"
                onClick={closeDrawer}
                className="btn-quiet -mr-1.5 h-9 w-9 p-0"
                aria-label="Close navigation"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-3">
              <NavItems onNavigate={closeDrawer} />
            </div>
            <div className="space-y-3 border-t border-edge p-3">
              {isOfficer && (
                <Link to="/drives/new" className="btn-ghost w-full" onClick={closeDrawer}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Add a drive
                </Link>
              )}
              <div className="flex items-center justify-between gap-2 px-1">
                <span className="text-xs text-faint">Theme</span>
                <ThemeToggle />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---- Main column ------------------------------------------------ */}
      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 border-b border-edge bg-canvas/85 backdrop-blur-md">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation"
              className="btn-quiet -ml-2 h-9 w-9 p-0 lg:hidden"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>

            <Link to="/" className="flex items-center gap-2 lg:hidden">
              <LogoMark className="h-[1.2rem] w-[1.2rem]" />
              <Wordmark className="text-[0.9rem]" />
            </Link>

            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle className="hidden sm:inline-flex" />
              <AccountMenu />
            </div>
          </div>
        </header>

        <main id="main" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
          <Outlet />
        </main>

        <footer className="mx-auto w-full max-w-6xl px-4 pb-10 pt-2 sm:px-6">
          <p className="border-t border-edge pt-4 text-xs text-faint">
            Verdicts are computed from what you entered. Always check the official TPO notice.
            <span className="mx-1.5">·</span>© {new Date().getFullYear()} RoundReady
          </p>
        </footer>
      </div>
    </div>
  );
}
