# Frontend Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade the public-facing frontend to 2026 standards with shadcn/ui components, motion animations, proper accessibility, and polished visual design.

**Architecture:** Install shadcn/ui (Radix-based) component primitives, motion (framer-motion v11) for animations, next-themes for dark mode toggle, sonner for toasts, and Geist font. Replace custom inputs/selects/modals with shadcn equivalents. Add skeleton loading states, page transitions, and consistent design tokens. Admin pages are untouched.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS v4, shadcn/ui, motion, next-themes, sonner, lucide-react, geist font

---

## Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install runtime dependencies**

Run:
```bash
pnpm add motion lucide-react sonner next-themes geist
```

**Step 2: Initialize shadcn/ui**

Run:
```bash
pnpm dlx shadcn@latest init
```

When prompted:
- Style: Default
- Base color: Zinc
- CSS variables: Yes
- CSS file: `src/app/globals.css`
- Tailwind config: (accept default or skip — Tailwind v4 uses CSS-based config)
- Components alias: `@/components/ui`
- Utils alias: `@/lib/utils`
- React Server Components: Yes

**Step 3: Install shadcn components**

Run:
```bash
pnpm dlx shadcn@latest add button badge input select table skeleton dialog sheet separator command collapsible tooltip
```

**Step 4: Install sonner toast (shadcn-compatible)**

Run:
```bash
pnpm dlx shadcn@latest add sonner
```

**Step 5: Verify build passes**

Run: `pnpm build`
Expected: Build succeeds. shadcn components are in `src/components/ui/`.

**Step 6: Commit**

```bash
git add -A
git commit -m "Install shadcn/ui, motion, next-themes, sonner, geist font"
```

---

## Task 2: Foundation — Design Tokens, Font, Theme Provider

**Files:**
- Modify: `src/app/globals.css` (shadcn already updated this during init — verify tokens are present)
- Modify: `src/app/layout.tsx`
- Create: `src/components/theme-provider.tsx`

**Step 1: Create theme provider**

Create `src/components/theme-provider.tsx`:
```tsx
"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>;
}
```

**Step 2: Update root layout with font and theme provider**

Modify `src/app/layout.tsx`:
- Import `GeistSans` from `geist/font/sans` and `GeistMono` from `geist/font/mono`
- Wrap `<body>` children with `<ThemeProvider attribute="class" defaultTheme="system" enableSystem>`
- Add `GeistSans.variable` and `GeistMono.variable` to `<body className>`
- Add `suppressHydrationWarning` to `<html>` (required by next-themes)

The `<html>` tag should become:
```tsx
<html lang="en" suppressHydrationWarning>
```

The `<body>` tag should become:
```tsx
<body className={`${GeistSans.variable} ${GeistMono.variable} font-sans antialiased`}>
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
    {/* existing header, main, footer */}
  </ThemeProvider>
</body>
```

**Step 3: Update globals.css**

Remove the old `font-family: Arial, Helvetica, sans-serif` from body. Ensure shadcn's CSS variables are present for both light and dark themes. The `@theme inline` block should reference `--font-geist-sans` and `--font-geist-mono` (these are now actually defined by the font imports).

Verify that shadcn init added proper `:root` and `.dark` color variables. If using Tailwind v4's `@theme` directive, ensure the shadcn colors are integrated. The key variables needed:
- `--background`, `--foreground`, `--card`, `--card-foreground`
- `--popover`, `--popover-foreground`
- `--primary`, `--primary-foreground`
- `--secondary`, `--secondary-foreground`
- `--muted`, `--muted-foreground`
- `--accent`, `--accent-foreground`
- `--destructive`, `--destructive-foreground`
- `--border`, `--input`, `--ring`
- `--radius`

**Step 4: Add Toaster and dark mode toggle preparation**

In layout.tsx, after `<Analytics />`, add:
```tsx
import { Toaster } from "@/components/ui/sonner";
// ... inside body, after footer:
<Toaster />
```

**Step 5: Verify build passes**

Run: `pnpm build`
Expected: Build succeeds. Font loads via `next/font`.

**Step 6: Commit**

```bash
git add -A
git commit -m "Add design tokens, Geist font, theme provider, and toast setup"
```

---

## Task 3: Header — Mobile Nav, Theme Toggle, Active Links, Search Animation

**Files:**
- Modify: `src/app/layout.tsx`
- Create: `src/components/mobile-nav.tsx`
- Create: `src/components/theme-toggle.tsx`
- Modify: `src/components/HeaderSearch.tsx`

**Step 1: Create theme toggle component**

Create `src/components/theme-toggle.tsx`:
```tsx
"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return <Button variant="ghost" size="icon" className="h-9 w-9" />;

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-9 w-9"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} mode`}
    >
      {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
```

**Step 2: Create mobile nav component**

Create `src/components/mobile-nav.tsx`:
```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/systems", label: "Systems" },
  { href: "/lenses", label: "Lenses" },
  { href: "/cameras", label: "Cameras" },
  { href: "/collections", label: "Collections" },
  { href: "/search", label: "Search" },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 sm:hidden" aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-64">
        <SheetTitle className="text-lg font-bold">Menu</SheetTitle>
        <nav className="mt-6 flex flex-col gap-1">
          {navLinks.map((link) => {
            const isActive = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href));
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                    : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
```

**Step 3: Create header nav client component with active link highlighting**

Since `layout.tsx` is a server component and `usePathname()` needs client context, create `src/components/header-nav.tsx`:
```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/systems", label: "Systems" },
  { href: "/lenses", label: "Lenses" },
  { href: "/cameras", label: "Cameras" },
  { href: "/collections", label: "Collections" },
  { href: "/search", label: "Search" },
];

export function HeaderNav() {
  const pathname = usePathname();

  return (
    <nav className="hidden gap-1 sm:flex" aria-label="Main navigation">
      {navLinks.map((link) => {
        const isActive = pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href));
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

**Step 4: Update layout.tsx header**

Replace the inline nav links in `layout.tsx` with the new components:
- Remove the `navLinks` const from layout.tsx
- Import `HeaderNav`, `MobileNav`, `ThemeToggle`, and `HeaderSearch`
- The header right section should be: `<div className="flex items-center gap-1"><HeaderSearch /><ThemeToggle /><MobileNav /></div>`
- Upgrade backdrop-blur: `bg-white/80 backdrop-blur` → `bg-background/80 backdrop-blur-xl`
- Change border to use token: `border-zinc-200` → `border-border`

**Step 5: Upgrade HeaderSearch with motion animation**

Modify `src/components/HeaderSearch.tsx`:
- Import `{ motion, AnimatePresence }` from `motion/react`
- Replace the inline SVG search icon with `import { Search } from "lucide-react"` and `<Button variant="ghost" size="icon">`
- Wrap the open search input + dropdown in `<AnimatePresence>` and `<motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.15 }}>`
- Replace the raw `<input>` with shadcn `Input` component
- Replace loading text "Searching..." with a small spinner or skeleton

**Step 6: Verify build passes**

Run: `pnpm build`

**Step 7: Commit**

```bash
git add -A
git commit -m "Upgrade header with mobile nav, theme toggle, active links, and animated search"
```

---

## Task 4: Shared Badge Component Variants

**Files:**
- Modify: `src/components/ui/badge.tsx` (shadcn-generated, add color variants)

**Step 1: Extend badge with color variants**

The shadcn Badge has `default`, `secondary`, `destructive`, `outline` variants. Add custom color variants for lens metadata:

In `src/components/ui/badge.tsx`, add these variants to the `badgeVariants` cva config:
- `brand`: zinc background (existing neutral style)
- `system`: blue background (`bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300`)
- `lensType`: green background (`bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300`)
- `era`: amber background (`bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300`)
- `status`: purple background (`bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300`)
- `zoom`: blue background (same as system)
- `prime`: green background (same as lensType)
- `macro`: purple background (same as status)

Ensure minimum sizing: `px-2.5 py-1` in the base styles (up from `px-2 py-0.5`).

Also add an `asChild` pattern or make Badge optionally render as a link/button by accepting `onClick` and wrapping with `<Link>` when `href` is provided. Or simply use Badge as a styled wrapper and let consumers wrap it in `<Link>`.

**Step 2: Verify build passes**

Run: `pnpm build`

**Step 3: Commit**

```bash
git add -A
git commit -m "Extend shadcn Badge with color variants for lens metadata"
```

---

## Task 5: Page Transition Wrapper

**Files:**
- Create: `src/components/page-transition.tsx`

**Step 1: Create a reusable page transition wrapper**

Create `src/components/page-transition.tsx`:
```tsx
"use client";

import { motion } from "motion/react";

export function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
```

This will be used by wrapping page content in each page file. Do NOT wrap in layout.tsx (it would re-animate on every nav within the same layout).

**Step 2: Verify build passes**

Run: `pnpm build`

**Step 3: Commit**

```bash
git add -A
git commit -m "Add page transition wrapper component"
```

---

## Task 6: Skeleton Components

**Files:**
- Create: `src/components/table-skeleton.tsx`

**Step 1: Create table skeleton for infinite scroll loading**

Create `src/components/table-skeleton.tsx`:
```tsx
import { Skeleton } from "@/components/ui/skeleton";

export function TableSkeleton({ columns, rows = 5 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <tr key={i} className="border-b border-border">
          {Array.from({ length: columns }, (_, j) => (
            <td key={j} className="py-3 pr-4">
              <Skeleton className="h-4 w-full" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
```

**Step 2: Verify build passes**

Run: `pnpm build`

**Step 3: Commit**

```bash
git add -A
git commit -m "Add table skeleton component for loading states"
```

---

## Task 7: Scroll-to-Top Button

**Files:**
- Create: `src/components/scroll-to-top.tsx`

**Step 1: Create scroll-to-top component**

Create `src/components/scroll-to-top.tsx`:
```tsx
"use client";

import { useState, useEffect } from "react";
import { ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";

export function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > 500);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          className="fixed bottom-6 right-6 z-40"
        >
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 rounded-full shadow-md"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            aria-label="Scroll to top"
          >
            <ChevronUp className="h-5 w-5" />
          </Button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

**Step 2: Verify build passes**

Run: `pnpm build`

**Step 3: Commit**

```bash
git add -A
git commit -m "Add animated scroll-to-top button component"
```

---

## Task 8: Home Page Redesign

**Files:**
- Modify: `src/app/page.tsx`

**Step 1: Upgrade the home page**

Apply these changes to `src/app/page.tsx`:

1. **Wrap all content** in `<PageTransition>` (import from `@/components/page-transition`)

2. **Hero section**:
   - Add subtle radial gradient background: wrap hero in a `<div>` with `bg-gradient-to-b from-zinc-50 to-transparent dark:from-zinc-900/50 dark:to-transparent -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 pt-8 pb-12 rounded-2xl`
   - Responsive typography: `text-4xl sm:text-5xl` → `text-2xl sm:text-3xl md:text-4xl lg:text-5xl`
   - Replace CTA links with shadcn `Button` components:
     - "Browse Lenses": `<Button asChild><Link href="/lenses">Browse Lenses</Link></Button>`
     - "Compare Lenses": `<Button variant="outline" asChild><Link ...>Compare Lenses</Link></Button>`
     - "Advanced Search": `<Button variant="outline" asChild><Link ...>Advanced Search</Link></Button>`

3. **Section cards**:
   - Add lucide icons: import `{ Aperture, Camera, Layers, BookOpen }` from `lucide-react`
   - Map icons: Systems→Layers, Lenses→Aperture, Cameras→Camera, Collections→BookOpen
   - Add icon as first element in card: `<div className="mb-3 text-muted-foreground"><IconComponent className="h-6 w-6" /></div>`
   - Upgrade card hover: add `hover:shadow-md` (up from `hover:shadow-sm`) and add `transition-all duration-200`
   - Add motion: wrap card grid in a stagger container

4. **Popular lenses**:
   - Add rank number: before lens name, add `<span className="text-3xl font-bold text-muted-foreground/30">#{i+1}</span>` in a flex layout
   - Add star icon next to rating: `import { Star } from "lucide-react"` → `<Star className="inline h-3 w-3 fill-amber-500 text-amber-500" />`

5. **Most Compared**:
   - Change layout: each item shows lens names stacked with a `<Badge variant="secondary">vs</Badge>` between them instead of inline text

6. **About section**:
   - Wrap in muted background card: `<div className="rounded-2xl bg-muted/50 p-8">`

**Step 2: Verify build passes**

Run: `pnpm build`

**Step 3: Visual check**

Run: `pnpm dev` — verify home page renders with icons, gradient hero, rank numbers, Button CTAs.

**Step 4: Commit**

```bash
git add -A
git commit -m "Redesign home page with icons, gradient hero, ranked lenses, and motion"
```

---

## Task 9: LensList Component Upgrade

**Files:**
- Modify: `src/components/LensList.tsx`

**Step 1: Upgrade filters to shadcn components**

Replace raw `<input>` and `<select>` elements:
- `<input type="text" placeholder="Search lenses...">` → shadcn `<Input>` with `<label className="sr-only">Search lenses</label>` before it
- `<select>` elements → shadcn `<Select><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{options}</SelectContent></Select>`
  - Note: shadcn Select is a controlled Radix component. Wire `onValueChange` to the existing filter handlers.
- Numeric inputs → shadcn `<Input type="number">` with `sr-only` labels
- Wrap filters in a `<Collapsible>` on mobile: on screens < sm, show `<CollapsibleTrigger>` that says "Filters" with active count badge, and `<CollapsibleContent>` wrapping the filter grid. On sm+, always show filters.

**Step 2: Upgrade table to shadcn Table**

Replace raw `<table>` with shadcn `<Table>`, `<TableHeader>`, `<TableBody>`, `<TableRow>`, `<TableHead>`, `<TableCell>`.

For sortable headers, add lucide `ChevronUp`/`ChevronDown` icons:
```tsx
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";
// In header:
{sort === col.key ? (order === "desc" ? <ChevronDown className="ml-1 inline h-3 w-3" /> : <ChevronUp className="ml-1 inline h-3 w-3" />) : <ChevronsUpDown className="ml-1 inline h-3 w-3 text-muted-foreground/50" />}
```

Add `scope="col"` to all `<TableHead>` elements. Add `tabIndex={0}` and `onKeyDown` (Enter/Space triggers sort) to sortable headers. Add `aria-sort` attribute.

**Step 3: Replace type badges with shadcn Badge**

Replace inline badge buttons for Zoom/Prime/Macro with:
```tsx
import { Badge } from "@/components/ui/badge";
// In table cell:
<Badge variant="zoom" className="cursor-pointer" onClick={...}>Zoom</Badge>
```

Ensure minimum touch target (the Badge's `px-2.5 py-1` from Task 4 handles this).

**Step 4: Replace loading indicator with skeleton**

Replace:
```tsx
{loading && <p className="text-sm text-zinc-500">Loading more...</p>}
```
With:
```tsx
import { TableSkeleton } from "@/components/table-skeleton";
// Inside the table tbody, after existing rows:
{loading && <TableSkeleton columns={9} rows={3} />}
```

**Step 5: Add ScrollToTop**

At the end of the component, add `<ScrollToTop />`.

**Step 6: Verify build passes**

Run: `pnpm build`

**Step 7: Commit**

```bash
git add -A
git commit -m "Upgrade LensList with shadcn inputs, table, badges, and skeleton loading"
```

---

## Task 10: CameraList Component Upgrade

**Files:**
- Modify: `src/components/CameraList.tsx`

**Step 1: Apply same upgrades as LensList**

- Replace `<input>` with shadcn `<Input>` + `sr-only` label
- Replace `<table>` with shadcn `Table` primitives
- Add sort icons (lucide) to sortable headers
- Add `scope="col"` and `aria-sort` to headers
- Replace "Loading more..." with `<TableSkeleton>`
- Add `<ScrollToTop />`

**Step 2: Verify build passes**

Run: `pnpm build`

**Step 3: Commit**

```bash
git add -A
git commit -m "Upgrade CameraList with shadcn table, input, and skeleton loading"
```

---

## Task 11: ImageGallery + Lightbox Upgrade

**Files:**
- Modify: `src/components/ImageGallery.tsx`

**Step 1: Replace custom lightbox with shadcn Dialog**

Replace the custom lightbox (`div.fixed.inset-0`) with:
```tsx
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
```

The lightbox becomes:
```tsx
<Dialog open={lightboxIdx !== null} onOpenChange={(open) => !open && setLightboxIdx(null)}>
  <DialogContent className="max-w-[90vw] max-h-[90vh] p-2 border-none bg-transparent shadow-none">
    <DialogTitle className="sr-only">Image {(lightboxIdx ?? 0) + 1} of {safeImages.length}</DialogTitle>
    {/* Image + nav buttons */}
  </DialogContent>
</Dialog>
```

This gives:
- Proper ARIA `role="dialog"` and `aria-modal="true"`
- Focus trap (Radix handles this)
- ESC to close (Radix handles this)
- `backdrop-blur-sm` on overlay (configure via DialogOverlay className)

**Step 2: Add keyboard navigation**

Add `useEffect` inside the Dialog-controlled state to listen for arrow keys:
```tsx
useEffect(() => {
  if (lightboxIdx === null) return;
  function handleKey(e: KeyboardEvent) {
    if (e.key === "ArrowLeft") setLightboxIdx((prev) => prev !== null ? (prev - 1 + safeImages.length) % safeImages.length : null);
    if (e.key === "ArrowRight") setLightboxIdx((prev) => prev !== null ? (prev + 1) % safeImages.length : null);
  }
  document.addEventListener("keydown", handleKey);
  return () => document.removeEventListener("keydown", handleKey);
}, [lightboxIdx, safeImages.length]);
```

**Step 3: Add motion transition between images**

Wrap the Image in `<AnimatePresence mode="wait">` with `<motion.div key={lightboxIdx}>` so images crossfade on prev/next.

**Step 4: Make nav buttons accessible**

- Close button: `<Button variant="ghost" size="icon" className="absolute top-2 right-2 h-11 w-11">` (44px)
- Prev/Next: `<Button variant="ghost" size="icon" className="h-11 w-11">` with `aria-label="Previous image"` / `aria-label="Next image"`
- Replace "Prev"/"Next" text with lucide `ChevronLeft`/`ChevronRight` icons

**Step 5: Add hover scale transition to gallery thumbnails**

The existing `group-hover:scale-105` is good but add explicit duration:
`transition-transform duration-200 group-hover:scale-105`

**Step 6: Verify build passes**

Run: `pnpm build`

**Step 7: Commit**

```bash
git add -A
git commit -m "Upgrade ImageGallery with shadcn Dialog, keyboard nav, and motion transitions"
```

---

## Task 12: RatingWidget Upgrade

**Files:**
- Modify: `src/components/RatingWidget.tsx`

**Step 1: Increase button size and add ARIA labels**

Change rating buttons from `h-8 w-8` to `h-10 w-10`. Add `aria-label={`Rate ${n} out of 10`}`.

**Step 2: Add motion hover animation**

```tsx
import { motion } from "motion/react";

// Replace <button> with:
<motion.button
  whileHover={{ scale: 1.15 }}
  whileTap={{ scale: 0.95 }}
  // ... existing props
>
```

**Step 3: Add toast notifications**

```tsx
import { toast } from "sonner";

// In submit success:
toast.success("Rating submitted");

// In delete success:
toast.success("Rating removed");

// In catch blocks (replace empty catch):
toast.error("Something went wrong");
```

**Step 4: Verify build passes**

Run: `pnpm build`

**Step 5: Commit**

```bash
git add -A
git commit -m "Upgrade RatingWidget with larger buttons, motion hover, ARIA labels, and toasts"
```

---

## Task 13: ReportIssueButton + SpecsTable Modal Upgrades

**Files:**
- Modify: `src/components/ReportIssueButton.tsx`
- Modify: `src/components/SpecsTable.tsx`

**Step 1: Replace custom modal in ReportIssueButton with shadcn Dialog**

Replace the `div.fixed.inset-0` overlay with:
```tsx
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Flag } from "lucide-react";
```

- Trigger: `<Button variant="ghost" size="sm" className="text-muted-foreground"><Flag className="mr-1.5 h-4 w-4" /> Report an issue</Button>`
- Replace `<button onClick={() => setOpen(true)}>` with Dialog controlled open state
- Replace custom textarea with HTML textarea (shadcn doesn't have textarea, keep raw but style with shadcn Input classes)
- Replace form buttons with shadcn `Button` components
- Add `toast.success("Thanks for the report!")` on successful submit instead of the inline success message + auto-close

**Step 2: Replace custom modal in SpecsTable with shadcn Dialog**

Same pattern: replace `div.fixed.inset-0` overlay with shadcn `Dialog`.
- Use `<Dialog open={!!editingField} onOpenChange={(open) => !open && closeModal()}>`
- Replace raw inputs with shadcn `Input`
- Replace buttons with shadcn `Button`
- Add toast on success instead of inline success message

**Step 3: Replace inline SVG icons with lucide**

- ReportIssueButton: flag icon → `import { Flag } from "lucide-react"`
- SpecsTable: edit icon → `import { Pencil } from "lucide-react"`

**Step 4: Verify build passes**

Run: `pnpm build`

**Step 5: Commit**

```bash
git add -A
git commit -m "Upgrade ReportIssueButton and SpecsTable modals to shadcn Dialog"
```

---

## Task 14: Lens Detail Page Upgrade

**Files:**
- Modify: `src/app/lenses/[slug]/page.tsx`

**Step 1: Add page transition**

Wrap page content in `<PageTransition>`.

**Step 2: Replace tag links with Badge components**

Replace the inline styled `<Link>` tags (brand, system, lensType, era, productionStatus) with shadcn Badge:
```tsx
import { Badge } from "@/components/ui/badge";
// Example:
{lens.brand && (
  <Link href={`/lenses?brand=${encodeURIComponent(lens.brand)}`}>
    <Badge variant="brand">{lens.brand}</Badge>
  </Link>
)}
```

**Step 3: Group specs into sections**

Replace the single "Specifications" heading + table with two grouped sections:

```tsx
import { Separator } from "@/components/ui/separator";

// Optical Specs
<div>
  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Optical</h3>
  <SpecsTable rows={opticalRows} ... />
</div>
<Separator />
// Physical Specs
<div>
  <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Physical</h3>
  <SpecsTable rows={physicalRows} ... />
</div>
```

Split the specRows array:
- **Optical**: Focal Length, Maximum Aperture, Minimum Aperture, Lens Elements, Lens Groups, Min Focus Distance, Max Magnification, Autofocus, Stabilization, 35mm Equiv, Teleconverters
- **Physical**: Weight, Filter Size, Diaphragm Blades, Lens Hood, Year Introduced, Year Discontinued

**Step 4: Improve description typography**

The description already uses `leading-relaxed`. Update color from `text-zinc-600 dark:text-zinc-400` to `text-zinc-700 dark:text-zinc-300` for slightly warmer readability.

**Step 5: Replace back link with Button**

```tsx
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

<Button variant="ghost" size="sm" asChild>
  <Link href="/lenses"><ArrowLeft className="mr-1 h-4 w-4" /> Back to lenses</Link>
</Button>
```

**Step 6: Verify build passes**

Run: `pnpm build`

**Step 7: Commit**

```bash
git add -A
git commit -m "Upgrade lens detail page with badges, grouped specs, and page transition"
```

---

## Task 15: Compare Page Upgrade

**Files:**
- Modify: `src/app/lenses/compare/CompareClient.tsx`

**Step 1: Replace custom LensSearch with shadcn Command**

Replace the `LensSearch` subcomponent with a Command-based combobox:
```tsx
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
```

Note: This requires also installing the `popover` shadcn component: `pnpm dlx shadcn@latest add popover`

The search becomes:
```tsx
<Popover open={open} onOpenChange={setOpen}>
  <PopoverTrigger asChild>
    <Button variant="outline" className="w-full justify-start">
      {selected ? selected.name : "Search for a lens..."}
    </Button>
  </PopoverTrigger>
  <PopoverContent className="w-full p-0" align="start">
    <Command shouldFilter={false}>
      <CommandInput placeholder="Search..." onValueChange={handleSearch} />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup>
          {results.map(({ lens }) => (
            <CommandItem key={lens.id} onSelect={() => { onSelect(lens); setOpen(false); }}>
              {lens.name}
              {lens.brand && <span className="ml-2 text-muted-foreground">{lens.brand}</span>}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  </PopoverContent>
</Popover>
```

Keep the existing debounced search logic (`300ms`), but wire it through `CommandInput`'s `onValueChange`.

**Step 2: Upgrade comparison table**

Replace raw `<table>` with shadcn `Table` primitives. Add difference highlighting with left border accent:
```tsx
// Instead of just bg-amber-50:
className={isDiff ? "bg-amber-50/50 dark:bg-amber-950/20 border-l-2 border-amber-400" : ""}
```

**Step 3: Add empty state with icon**

When no lenses are selected, show:
```tsx
import { ArrowUpDown } from "lucide-react";
<div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
  <ArrowUpDown className="h-10 w-10" />
  <p>Select two lenses above to compare specs</p>
</div>
```

**Step 4: Add toast for comparison tracking**

Replace silent `catch(() => {})` on the comparison POST with `toast.error(...)`.

**Step 5: Verify build passes**

Run: `pnpm build`

**Step 6: Commit**

```bash
git add -A
git commit -m "Upgrade compare page with shadcn Command search and styled comparison table"
```

---

## Task 16: Camera Detail Page Upgrade

**Files:**
- Modify: `src/app/cameras/[...slug]/page.tsx`

**Step 1: Apply same patterns as lens detail**

- Wrap in `<PageTransition>`
- Replace back link with shadcn Button + ArrowLeft icon
- Replace tag links with Badge components (if any exist)
- Improve description typography (zinc-700/300)
- Group specs into sections if there are enough rows

**Step 2: Verify build passes**

Run: `pnpm build`

**Step 3: Commit**

```bash
git add -A
git commit -m "Upgrade camera detail page with page transition, badges, and improved typography"
```

---

## Task 17: Collections & Systems List Pages

**Files:**
- Modify: `src/app/collections/page.tsx`
- Modify: `src/app/systems/page.tsx`

**Step 1: Upgrade collection cards**

- Wrap in `<PageTransition>`
- Add card hover animation: `hover:shadow-md transition-all duration-200` (up from `hover:shadow-sm`)
- Replace plain lens count text with `<Badge variant="secondary">{lensCount} lenses</Badge>`
- Add motion stagger on the card grid (wrap grid items)

**Step 2: Upgrade system cards**

- Wrap in `<PageTransition>`
- Same hover shadow upgrade
- Add manufacturer as `<Badge variant="outline">{system.manufacturer}</Badge>` if present

**Step 3: Verify build passes**

Run: `pnpm build`

**Step 4: Commit**

```bash
git add -A
git commit -m "Upgrade collections and systems list pages with improved cards and badges"
```

---

## Task 18: Collection & System Detail Pages

**Files:**
- Modify: `src/app/collections/[slug]/page.tsx`
- Modify: `src/app/systems/[slug]/page.tsx`

**Step 1: Upgrade collection detail**

- Wrap in `<PageTransition>`
- Replace back link with Button + ArrowLeft
- Replace lens count text with `<Badge>`
- Upgrade table to shadcn `Table` primitives
- Replace type badges (Zoom/Prime/Macro) with shadcn `Badge` variants

**Step 2: Upgrade system detail**

- Wrap in `<PageTransition>`
- Replace back link with Button + ArrowLeft
- Replace manufacturer/mount type text with `<Badge>` components
- Upgrade both lenses and cameras tables to shadcn `Table` primitives
- Replace type badges with shadcn `Badge` variants

**Step 3: Verify build passes**

Run: `pnpm build`

**Step 4: Commit**

```bash
git add -A
git commit -m "Upgrade collection and system detail pages with shadcn Table and badges"
```

---

## Task 19: Search Page Upgrade

**Files:**
- Modify: `src/app/search/page.tsx`
- Modify: `src/components/SearchInput.tsx`

**Step 1: Upgrade SearchInput**

Replace raw `<input>` with shadcn `<Input>` + lucide `Search` icon:
```tsx
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

<div className="relative">
  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
  <Input className="pl-10" ... />
</div>
```

Add `<label className="sr-only" htmlFor="search-input">Search</label>`.

**Step 2: Upgrade search page**

- Wrap in `<PageTransition>`
- Add result count badges in section headings: `Systems <Badge variant="secondary">{count}</Badge>`
- Replace suggestion links with `<Badge variant="outline" className="cursor-pointer">` wrapped in `<Link>`
- Replace cards with slightly improved styling (add `hover:shadow-sm transition-all`)

**Step 3: Verify build passes**

Run: `pnpm build`

**Step 4: Commit**

```bash
git add -A
git commit -m "Upgrade search page with shadcn Input, badges, and page transition"
```

---

## Task 20: Lenses & Cameras List Pages (Server Components)

**Files:**
- Modify: `src/app/lenses/page.tsx`
- Modify: `src/app/cameras/page.tsx`

**Step 1: Add page transitions**

Wrap page content in `<PageTransition>` on both pages.

**Step 2: Verify build passes**

Run: `pnpm build`

**Step 3: Commit**

```bash
git add -A
git commit -m "Add page transitions to lenses and cameras list pages"
```

---

## Task 21: Compare Page (Server Wrapper)

**Files:**
- Modify: `src/app/lenses/compare/page.tsx`

**Step 1: Add page transition**

Wrap content in `<PageTransition>`.

**Step 2: Verify build passes**

Run: `pnpm build`

**Step 3: Commit**

```bash
git add -A
git commit -m "Add page transition to compare page"
```

---

## Task 22: Footer Upgrade

**Files:**
- Modify: `src/app/layout.tsx`

**Step 1: Replace border-t with Separator**

```tsx
import { Separator } from "@/components/ui/separator";

// Replace <footer className="border-t border-zinc-200 dark:border-zinc-800"> with:
<Separator />
<footer>
```

**Step 2: Verify build passes**

Run: `pnpm build`

**Step 3: Commit**

```bash
git add -A
git commit -m "Replace footer border with shadcn Separator"
```

---

## Task 23: Final Build Verification and Lint

**Files:** None (verification only)

**Step 1: Full build**

Run: `pnpm build`
Expected: Build succeeds with no errors.

**Step 2: Lint**

Run: `pnpm lint`
Expected: No lint errors (or only pre-existing ones).

**Step 3: Visual verification**

Run: `pnpm dev` and check every page:
- [ ] Home page: gradient hero, icons on cards, ranked popular lenses, Button CTAs
- [ ] Lenses list: shadcn filters, table with sort icons, skeleton loading, scroll-to-top
- [ ] Lens detail: badges, grouped specs, dialog lightbox, larger rating buttons
- [ ] Compare: Command combobox search, styled diff table, empty state
- [ ] Cameras list: shadcn input, table with skeletons
- [ ] Camera detail: page transition, back button
- [ ] Collections list: hover shadow, badge lens count
- [ ] Collection detail: shadcn table
- [ ] Systems list: hover shadow, manufacturer badge
- [ ] System detail: shadcn tables, badges
- [ ] Search: search icon input, badge suggestions, section count badges
- [ ] Header: mobile nav sheet, theme toggle, active link, animated search
- [ ] Dark mode toggle works
- [ ] Toasts appear on rating submit/delete
- [ ] Lightbox: ESC closes, arrows navigate, focus trapped

**Step 4: Commit any remaining fixes**

```bash
git add -A
git commit -m "Fix any remaining issues from visual verification"
```
