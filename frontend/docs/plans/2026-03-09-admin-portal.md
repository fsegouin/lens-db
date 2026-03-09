# Admin Portal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a password-protected admin portal at `/admin/*` for CRUD management of all database entities (lenses, cameras, systems, collections, compatibility).

**Architecture:** Next.js App Router with middleware-protected `/admin/*` routes. Session-based auth using HTTP-only cookies with in-memory token store. Server components for pages, client components for forms and tables. All admin API routes under `/api/admin/`.

**Tech Stack:** Next.js 16, React 19, Drizzle ORM, Tailwind CSS v4, Upstash Redis (rate limiting login). No new dependencies.

---

### Task 1: Auth — Session utilities and login API

**Files:**
- Create: `src/lib/admin-auth.ts`
- Create: `src/app/api/admin/login/route.ts`
- Create: `src/app/api/admin/logout/route.ts`

**Step 1: Create `src/lib/admin-auth.ts`**

```typescript
import { cookies } from "next/headers";

const SESSION_COOKIE = "admin_session";
const SESSION_TTL = 24 * 60 * 60 * 1000; // 24 hours

// In-memory session store (cleared on cold start — acceptable for single-admin)
const sessions = new Map<string, { expiresAt: number }>();

export async function verifyPassword(password: string): Promise<boolean> {
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) return false;
  // Constant-time comparison via hashing both
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(password)),
    crypto.subtle.digest("SHA-256", encoder.encode(adminPassword)),
  ]);
  const viewA = new Uint8Array(a);
  const viewB = new Uint8Array(b);
  if (viewA.length !== viewB.length) return false;
  let result = 0;
  for (let i = 0; i < viewA.length; i++) result |= viewA[i] ^ viewB[i];
  return result === 0;
}

export function createSession(): string {
  const token = crypto.randomUUID() + crypto.randomUUID();
  sessions.set(token, { expiresAt: Date.now() + SESSION_TTL });
  return token;
}

export function validateSession(token: string): boolean {
  const session = sessions.get(token);
  if (!session) return false;
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return false;
  }
  return true;
}

export function deleteSession(token: string): void {
  sessions.delete(token);
}

export async function getSessionToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value;
}

export function sessionCookieOptions(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: SESSION_TTL / 1000,
  };
}
```

**Step 2: Create `src/app/api/admin/login/route.ts`**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { verifyPassword, createSession, sessionCookieOptions } from "@/lib/admin-auth";
import { getClientIP, rateLimitedResponse } from "@/lib/api-utils";
import { createRateLimit } from "@/lib/rate-limit";

const loginLimiter = createRateLimit(5, "60 s");

export async function POST(request: NextRequest) {
  const ip = getClientIP(request);
  const { success } = await loginLimiter.limit(ip);
  if (!success) return rateLimitedResponse();

  try {
    const { password } = await request.json();
    if (!password || typeof password !== "string") {
      return NextResponse.json({ error: "Password required" }, { status: 400 });
    }

    const valid = await verifyPassword(password);
    if (!valid) {
      return NextResponse.json({ error: "Invalid password" }, { status: 401 });
    }

    const token = createSession();
    const response = NextResponse.json({ success: true });
    response.cookies.set(sessionCookieOptions(token));
    return response;
  } catch {
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
```

**Step 3: Create `src/app/api/admin/logout/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { getSessionToken, deleteSession } from "@/lib/admin-auth";

export async function POST() {
  const token = await getSessionToken();
  if (token) deleteSession(token);

  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: "admin_session",
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
```

**Step 4: Commit**

```bash
git add src/lib/admin-auth.ts src/app/api/admin/login/route.ts src/app/api/admin/logout/route.ts
git commit -m "Add admin auth: session management, login/logout API"
```

---

### Task 2: Middleware — Protect `/admin/*` routes

**Files:**
- Create: `src/middleware.ts`

**Step 1: Create `src/middleware.ts`**

Next.js middleware runs on the edge. We cannot import the in-memory session store here directly (edge runtime). Instead, we'll validate the cookie exists and check it via an internal fetch, OR we use a simpler approach: validate the cookie token format in middleware and do full validation in the API/page layer.

Better approach: use middleware only for redirect logic, validate session in a shared helper used by admin pages and API routes.

```typescript
import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only protect /admin routes (except /admin/login)
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const session = request.cookies.get("admin_session")?.value;
    if (!session) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
```

**Step 2: Add a server-side guard helper to `src/lib/admin-auth.ts`**

Append to the existing file:

```typescript
import { redirect } from "next/navigation";

export async function requireAdmin(): Promise<void> {
  const token = await getSessionToken();
  if (!token || !validateSession(token)) {
    redirect("/admin/login");
  }
}

export function requireAdminAPI(token: string | undefined): NextResponse | null {
  if (!token || !validateSession(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
```

**Step 3: Commit**

```bash
git add src/middleware.ts src/lib/admin-auth.ts
git commit -m "Add middleware to protect admin routes"
```

---

### Task 3: Admin layout, login page, and dashboard

**Files:**
- Create: `src/app/admin/login/page.tsx`
- Create: `src/app/admin/layout.tsx`
- Create: `src/app/admin/page.tsx`

**Step 1: Create login page `src/app/admin/login/page.tsx`**

Client component with password form, POST to `/api/admin/login`, redirect on success.

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push("/admin");
      } else {
        const data = await res.json();
        setError(data.error || "Login failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Admin Login</h1>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-lg border border-zinc-300 px-4 py-2 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          autoFocus
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
```

**Step 2: Create admin layout `src/app/admin/layout.tsx`**

Sidebar navigation for all admin sections. Login page uses root layout instead (no sidebar).

```typescript
import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";

const adminNav = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/lenses", label: "Lenses" },
  { href: "/admin/cameras", label: "Cameras" },
  { href: "/admin/systems", label: "Systems" },
  { href: "/admin/collections", label: "Collections" },
  { href: "/admin/compatibility", label: "Compatibility" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
        <div className="p-4">
          <Link href="/admin" className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
            Admin
          </Link>
          <Link href="/" className="ml-2 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300">
            ← Site
          </Link>
        </div>
        <nav className="space-y-1 px-2">
          {adminNav.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block rounded-md px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-200 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto p-4">
          <LogoutButton />
        </div>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}

function LogoutButton() {
  // This needs to be a client component - extract inline
  return (
    <form action="/api/admin/logout" method="POST">
      <button
        type="submit"
        className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
      >
        Logout
      </button>
    </form>
  );
}
```

Note: The `LogoutButton` needs refinement — a form POST to an API route won't redirect automatically. We'll make it a proper client component:

Create a `src/components/admin/LogoutButton.tsx`:

```typescript
"use client";

import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
  }

  return (
    <button
      onClick={handleLogout}
      className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
    >
      Logout
    </button>
  );
}
```

Update the layout to import it.

**Step 3: Create admin dashboard `src/app/admin/page.tsx`**

```typescript
import Link from "next/link";
import { db } from "@/db";
import { lenses, cameras, systems, collections, lensCompatibility } from "@/db/schema";
import { sql } from "drizzle-orm";

export default async function AdminDashboard() {
  const [lensCount, cameraCount, systemCount, collectionCount, compatCount] = await Promise.all([
    db.select({ count: sql<number>`count(*)::integer` }).from(lenses).then((r) => r[0].count),
    db.select({ count: sql<number>`count(*)::integer` }).from(cameras).then((r) => r[0].count),
    db.select({ count: sql<number>`count(*)::integer` }).from(systems).then((r) => r[0].count),
    db.select({ count: sql<number>`count(*)::integer` }).from(collections).then((r) => r[0].count),
    db.select({ count: sql<number>`count(*)::integer` }).from(lensCompatibility).then((r) => r[0].count),
  ]);

  const cards = [
    { label: "Lenses", count: lensCount, href: "/admin/lenses" },
    { label: "Cameras", count: cameraCount, href: "/admin/cameras" },
    { label: "Systems", count: systemCount, href: "/admin/systems" },
    { label: "Collections", count: collectionCount, href: "/admin/collections" },
    { label: "Compatibility", count: compatCount, href: "/admin/compatibility" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Dashboard</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-lg border border-zinc-200 p-6 transition-all hover:border-zinc-400 hover:shadow-sm dark:border-zinc-800 dark:hover:border-zinc-600"
          >
            <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
              {card.count.toLocaleString()}
            </div>
            <div className="mt-1 text-sm text-zinc-500">{card.label}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

**Step 4: Commit**

```bash
git add src/app/admin/ src/components/admin/
git commit -m "Add admin login page, layout with sidebar, and dashboard"
```

---

### Task 4: Reusable AdminTable component

**Files:**
- Create: `src/components/admin/AdminTable.tsx`

**Step 1: Create `src/components/admin/AdminTable.tsx`**

A client component that displays a searchable, paginated table with links to edit pages.

```typescript
"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface Column {
  key: string;
  label: string;
  render?: (value: unknown, row: Record<string, unknown>) => React.ReactNode;
}

interface AdminTableProps {
  title: string;
  apiPath: string;         // e.g. "/api/admin/lenses"
  editPath: string;        // e.g. "/admin/lenses"
  columns: Column[];
  newHref: string;         // e.g. "/admin/lenses/new"
}

const PAGE_SIZE = 50;

export default function AdminTable({ title, apiPath, editPath, columns, newHref }: AdminTableProps) {
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    params.set("cursor", String(page * PAGE_SIZE));
    try {
      const res = await fetch(`${apiPath}?${params}`);
      const data = await res.json();
      setItems(data.items || []);
      setTotal(data.total || 0);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [apiPath, search, page]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Reset page when search changes
  useEffect(() => { setPage(0); }, [search]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{title}</h1>
        <Link
          href={newHref}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          + New
        </Link>
      </div>

      <input
        type="text"
        placeholder="Search..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-sm rounded-lg border border-zinc-300 px-4 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
      />

      <div className="text-sm text-zinc-500">{total.toLocaleString()} results</div>

      {loading ? (
        <p className="text-zinc-400">Loading...</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-800">
                {columns.map((col) => (
                  <th key={col.key} className="px-3 py-2 text-left font-medium text-zinc-500">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {items.map((item) => (
                <tr key={String(item.id)} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50">
                  {columns.map((col, i) => (
                    <td key={col.key} className="px-3 py-2 text-zinc-700 dark:text-zinc-300">
                      {i === 0 ? (
                        <Link
                          href={`${editPath}/${item.id}/edit`}
                          className="font-medium text-zinc-900 hover:underline dark:text-zinc-100"
                        >
                          {col.render ? col.render(item[col.key], item) : String(item[col.key] ?? "")}
                        </Link>
                      ) : (
                        col.render ? col.render(item[col.key], item) : String(item[col.key] ?? "")
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="px-3 py-8 text-center text-zinc-400">
                    No results found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded border border-zinc-300 px-3 py-1 text-sm disabled:opacity-50 dark:border-zinc-700"
          >
            Prev
          </button>
          <span className="text-sm text-zinc-500">
            Page {page + 1} of {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="rounded border border-zinc-300 px-3 py-1 text-sm disabled:opacity-50 dark:border-zinc-700"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/components/admin/AdminTable.tsx
git commit -m "Add reusable AdminTable component with search and pagination"
```

---

### Task 5: Systems CRUD (simplest entity — build the pattern)

**Files:**
- Create: `src/app/api/admin/systems/route.ts`
- Create: `src/app/api/admin/systems/[id]/route.ts`
- Create: `src/app/admin/systems/page.tsx`
- Create: `src/app/admin/systems/new/page.tsx`
- Create: `src/app/admin/systems/[id]/edit/page.tsx`
- Create: `src/components/admin/SystemForm.tsx`

**Step 1: Create API routes**

`src/app/api/admin/systems/route.ts`:
- GET: list systems with optional `q` search (ilike on name/manufacturer), pagination via `cursor`
- POST: create system (name, slug, description, mountType, manufacturer). Auto-generate slug from name if not provided.

`src/app/api/admin/systems/[id]/route.ts`:
- GET: single system by id
- PUT: update system fields
- DELETE: delete system by id

All routes call `requireAdminAPI` by reading the cookie from the request.

**Step 2: Create list page `src/app/admin/systems/page.tsx`**

Server component that renders `<AdminTable>` with columns: ID, Name, Manufacturer, Mount Type.

**Step 3: Create `src/components/admin/SystemForm.tsx`**

Client component with fields: name, slug (auto-generated), manufacturer, mountType, description (textarea). Handles both create (POST) and edit (PUT) modes via a `mode` prop. On success, redirects to `/admin/systems`.

**Step 4: Create new/edit pages**

- `src/app/admin/systems/new/page.tsx` — renders `<SystemForm mode="create" />`
- `src/app/admin/systems/[id]/edit/page.tsx` — fetches system by id, renders `<SystemForm mode="edit" system={data} />`

**Step 5: Commit**

```bash
git add src/app/api/admin/systems/ src/app/admin/systems/ src/components/admin/SystemForm.tsx
git commit -m "Add systems CRUD: API routes, list/create/edit pages"
```

---

### Task 6: Lenses CRUD

**Files:**
- Create: `src/app/api/admin/lenses/route.ts`
- Create: `src/app/api/admin/lenses/[id]/route.ts`
- Create: `src/app/admin/lenses/page.tsx`
- Create: `src/app/admin/lenses/new/page.tsx`
- Create: `src/app/admin/lenses/[id]/edit/page.tsx`
- Create: `src/components/admin/LensForm.tsx`

**Step 1: Create API routes**

Same pattern as systems. GET list with search + pagination. POST create. GET/PUT/DELETE by id.

Slug auto-generation from name. System dropdown populated from systems table.

**Step 2: Create `src/components/admin/LensForm.tsx`**

Large form with all lens fields organized in sections:
- **Basic**: name, slug, brand, systemId (dropdown), url, description (textarea)
- **Classification**: lensType, era, productionStatus
- **Optical**: focalLengthMin/Max, apertureMin/Max, lensElements, lensGroups, diaphragmBlades
- **Physical**: weightG, filterSizeMm, minFocusDistanceM, maxMagnification
- **Production**: yearIntroduced, yearDiscontinued
- **Flags**: isZoom, isMacro, isPrime, hasStabilization, hasAutofocus (toggles)
- **Data**: specs (JSON textarea), images (JSON textarea)

**Step 3: Create list/new/edit pages**

Table columns: ID, Name, Brand, System, Focal Length, Year.

**Step 4: Commit**

```bash
git add src/app/api/admin/lenses/ src/app/admin/lenses/ src/components/admin/LensForm.tsx
git commit -m "Add lenses CRUD: API routes, list/create/edit pages"
```

---

### Task 7: Cameras CRUD

**Files:**
- Create: `src/app/api/admin/cameras/route.ts`
- Create: `src/app/api/admin/cameras/[id]/route.ts`
- Create: `src/app/admin/cameras/page.tsx`
- Create: `src/app/admin/cameras/new/page.tsx`
- Create: `src/app/admin/cameras/[id]/edit/page.tsx`
- Create: `src/components/admin/CameraForm.tsx`

Same pattern as lenses but simpler. Fields: name, slug, systemId, description, url, sensorType, sensorSize, megapixels, resolution, yearIntroduced, bodyType, weightG, specs (JSON), images (JSON).

Table columns: ID, Name, System, Sensor, Megapixels, Year.

**Commit:**

```bash
git add src/app/api/admin/cameras/ src/app/admin/cameras/ src/components/admin/CameraForm.tsx
git commit -m "Add cameras CRUD: API routes, list/create/edit pages"
```

---

### Task 8: Collections CRUD with lens membership management

**Files:**
- Create: `src/app/api/admin/collections/route.ts`
- Create: `src/app/api/admin/collections/[id]/route.ts`
- Create: `src/app/admin/collections/page.tsx`
- Create: `src/app/admin/collections/new/page.tsx`
- Create: `src/app/admin/collections/[id]/edit/page.tsx`
- Create: `src/components/admin/CollectionForm.tsx`
- Create: `src/components/admin/CollectionLensManager.tsx`

**Step 1: API routes**

Standard CRUD plus:
- `GET /api/admin/collections/[id]` also returns the list of lenses in the collection
- `PUT /api/admin/collections/[id]` accepts a `lensIds` array to sync membership (delete removed, insert added)

**Step 2: `CollectionLensManager.tsx`**

Client component embedded in the collection edit page:
- Shows current lenses in collection as a list with remove buttons
- Search input to find lenses by name
- "Add" button to add a lens to the collection
- Uses `/api/admin/lenses?q=...` for search

**Step 3: Pages**

Table columns: ID, Name, Lens Count.

**Commit:**

```bash
git add src/app/api/admin/collections/ src/app/admin/collections/ src/components/admin/CollectionForm.tsx src/components/admin/CollectionLensManager.tsx
git commit -m "Add collections CRUD with lens membership management"
```

---

### Task 9: Lens-camera compatibility management

**Files:**
- Create: `src/app/api/admin/compatibility/route.ts`
- Create: `src/app/admin/compatibility/page.tsx`
- Create: `src/app/admin/compatibility/new/page.tsx`
- Create: `src/components/admin/CompatibilityForm.tsx`

**Step 1: API routes**

- GET: list compatibility entries with lens/camera names (joined), search, pagination
- POST: create entry (lensId, cameraId, isNative, notes)
- DELETE: delete by lensId + cameraId

**Step 2: `CompatibilityForm.tsx`**

- Lens search input (typeahead searching `/api/admin/lenses?q=...`)
- Camera search input (typeahead searching `/api/admin/cameras?q=...`)
- isNative toggle
- Notes textarea

**Step 3: List page**

Table columns: Lens Name, Camera Name, Native, Notes. Each row has a delete button with confirmation.

No edit page needed — delete and re-create is sufficient for this simple junction table.

**Commit:**

```bash
git add src/app/api/admin/compatibility/ src/app/admin/compatibility/ src/components/admin/CompatibilityForm.tsx
git commit -m "Add lens-camera compatibility management"
```

---

### Task 10: Add `ADMIN_PASSWORD` to env config and update CLAUDE.md

**Files:**
- Modify: `.env.example`
- Modify: `CLAUDE.md`

**Step 1: Update `.env.example`**

Add:
```
# Admin portal password
# Generate with: openssl rand -base64 32
ADMIN_PASSWORD=""
```

**Step 2: Update CLAUDE.md**

Add admin portal section documenting routes, auth flow, and env var.

**Step 3: Commit**

```bash
git add .env.example CLAUDE.md
git commit -m "Document admin portal setup in env example and CLAUDE.md"
```
