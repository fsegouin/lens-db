# Frontend Redesign Design — 2026 State-of-the-Art

**Date**: 2026-03-09
**Scope**: Public-facing pages only (admin untouched)
**Approach**: "Modern Standard" — shadcn/ui + motion + View Transitions
**Rollout**: All at once (site not live yet)

## Context

Design audit identified the site as functionally solid but visually dated for 2026. The core issues: no animations/motion, generic component design without visual hierarchy, accessibility gaps (missing ARIA, focus rings, keyboard nav), no loading feedback (skeletons), and inconsistent design tokens. The site should remain data-dense and warm — evolving what exists, not a full aesthetic pivot.

## 1. Foundation

### New Dependencies

| Package | Purpose | Bundle Impact |
|---------|---------|---------------|
| shadcn/ui | Accessible component primitives (Radix-based) | Copy-paste, no runtime dep |
| motion (framer-motion v11) | Animations, layout transitions, gestures | ~30KB |
| next-themes | Dark mode toggle with system preference | ~2KB |
| lucide-react | Icon set (shadcn default) | Tree-shakeable |
| sonner | Toast notifications | ~5KB |
| geist (font) | Geist Sans + Mono via next/font | Font files only |

### Design Token System

Replace minimal `globals.css` variables with shadcn's full CSS variable system:
- HSL-based color tokens: background, foreground, card, popover, primary, secondary, muted, accent, destructive, border, input, ring
- Light and dark variants
- `--radius` variable for consistent border-radius
- Enforce spacing consistency: `gap-4` between filter inputs, `space-y-8` between page sections

### Font Loading

```tsx
// layout.tsx
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
```

Remove `font-family: Arial, Helvetica, sans-serif` from globals.css.

### shadcn Components to Install

`skeleton`, `dialog`, `select`, `input`, `button`, `badge`, `sheet`, `table`, `tooltip`, `separator`, `command`, `collapsible`

Toast via `sonner` (shadcn's recommended toast library).

## 2. Layout & Navigation

### Header

- **Mobile nav**: Replace `hidden sm:flex` with a shadcn `Sheet` slide-out menu triggered by hamburger icon. Currently zero mobile navigation.
- **Active link indicator**: Highlight current page's nav link using `usePathname()`
- **Theme toggle**: Sun/moon icon button using `next-themes` for manual dark mode control
- **Search icon → animated search popover**: Lucide `Search` icon in the header. On click, a shadcn `Command` dialog (cmdk) animates open (motion scale + fade from the icon origin) with full-site search across lenses, cameras, and systems. Results grouped by type. ESC or click outside to dismiss. This replaces navigating to `/search` for quick lookups — the `/search` page still exists for advanced use.
- **Refined blur**: Upgrade to `backdrop-blur-xl` with slightly more opacity

### Footer

Keep minimal. Replace raw `border-t` with shadcn `Separator`.

### Page Container

Keep `max-w-7xl` pattern. No change.

## 3. Shared Components

### DataTable

Extract from `LensList`/`CameraList` (inspired by admin's `AdminTable` architecture):
- Configurable columns via definition array
- Built-in sorting with lucide `ChevronUp`/`ChevronDown` icons (always visible, muted when inactive)
- Infinite scroll with skeleton rows (shadcn `Skeleton`) replacing "Loading more..." text
- Row hover animation via motion
- shadcn `Table` primitives with proper `scope` attributes on headers

### FilterBar

Extract filter pattern from `LensList`:
- shadcn `Input` (with `sr-only` labels) and `Select` (Radix-powered, keyboard navigable)
- Responsive: horizontal wrap on desktop, collapsible on mobile (shadcn `Collapsible` with "Filters (N active)" summary)
- Active filter count badge

### Badge

Replace inconsistent colored tag buttons with shadcn `Badge`:
- Variants: `blue` (system), `green` (prime/lens type), `purple` (macro), `amber` (era), `zinc` (brand)
- Consistent `px-2.5 py-1` sizing (fixes small mobile touch targets)
- Optional `onClick` for filter-on-click behavior

### ImageGallery → Dialog

Replace custom lightbox with shadcn `Dialog`:
- Proper ARIA `role="dialog"`, focus trap, ESC to close
- Arrow key navigation between images
- Motion `AnimatePresence` for enter/exit transitions
- `backdrop-blur-sm` instead of solid `bg-black/80`
- Close button ≥44px touch target

### RatingWidget

- Increase buttons to `h-10 w-10` (40px)
- `aria-label={`Rate ${n} out of 10`}` on each button
- Motion scale animation on hover/tap
- Sonner toast on successful submit/delete

### SearchInput

Replace with shadcn `Input` + lucide `Search` icon. `focus-visible:ring-2` styling. Keep debounce logic.

## 4. Animations & Motion

### Philosophy

Motion communicates state changes and guides attention — it doesn't decorate. No parallax, no scroll-driven reveals, no 3D effects, no particle textures.

### Page-Level

- **Fade-in on mount**: Main content fades in + slides up (`y: 8px`, `opacity: 0→1`, 300ms ease-out)
- **View Transitions API**: Crossfade on navigation between list → detail pages (native browser API, no bundle cost)

### List & Table

- **Skeleton rows**: 3-5 skeleton rows matching table column layout during infinite scroll load
- **Row stagger on initial render**: First batch staggers in (`staggerChildren: 0.02`). Subsequent batches fade in as a group.
- **Filter transitions**: `AnimatePresence` with `layout` prop for smooth result swaps

### Interactive Elements

- **Cards**: `scale(1.01)` + shadow elevation on hover, 200ms ease
- **Primary buttons**: `scale(0.98)` on press (motion `whileTap`)
- **Rating buttons**: `scale(1.15)` on hover
- **Image gallery lightbox**: Motion `AnimatePresence` fade + scale enter/exit. Crossfade between prev/next images.
- **Header search**: Command dialog scales + fades in from the search icon origin point (motion `initial={{ opacity: 0, scale: 0.95 }}` → `animate={{ opacity: 1, scale: 1 }}`), with backdrop fade. Results animate in with stagger.
- **Badges/tags**: No animation (stable, data-like)

### NOT Doing

- Parallax
- Scroll-driven reveal animations
- 3D card tilt effects
- Particle/grain backgrounds

## 5. Page-by-Page Changes

### Home Page (`/`)

- **Hero**: Subtle radial gradient behind heading. Responsive typography: `text-2xl sm:text-3xl md:text-4xl lg:text-5xl`
- **Section cards**: Shadow-sm with stronger hover shadow-md. Lucide icons (Aperture, Camera, Layers, BookOpen)
- **Popular lenses**: Rank numbers (#1-#10) as muted large text. Mini star icon next to ratings.
- **Most Compared**: Lens names on two lines with styled "vs" divider badge
- **About section**: Muted background card (`bg-zinc-50 dark:bg-zinc-900/50`, rounded-xl)

### Lenses List (`/lenses`)

- **Filters**: shadcn `Select` + `Input`. Collapsible on mobile with active filter count.
- **Table**: shadcn `Table`, persistent sort icons, skeleton loading rows
- **Empty state**: Lucide `SearchX` icon above message

### Lens Detail (`/lenses/[slug]`)

- **Specs**: Grouped into "Optical" and "Physical" sections with heading + separator
- **Tags**: shadcn `Badge` with consistent sizing
- **Gallery**: shadcn `Dialog` lightbox with motion transitions
- **Rating**: Larger buttons, toast feedback, motion hover
- **Description**: `leading-relaxed`, warmer text color (`zinc-700`/`zinc-300`)

### Compare Page (`/lenses/compare`)

- **Lens search**: shadcn `Command` (cmdk combobox) replacing custom dropdown
- **Comparison table**: shadcn `Table`. Difference highlighting with `border-l-2 border-amber-400` accent
- **Empty state**: Icon + prompt text

### Cameras (`/cameras`, `/cameras/[...slug]`)

- Same DataTable + Skeleton treatment as lenses
- Detail: same specs grouping, image gallery upgrade

### Collections & Systems Lists

- Cards: hover shadow + scale(1.01) transition
- Lens/camera count as `Badge`

### Collection & System Detail

- shadcn `Table`, sort icons, skeletons
- System: badge styling for manufacturer + mount type

### Search (`/search`)

- shadcn `Input` + search icon
- Section count badges in headings
- Suggestion chips as `Badge` variants

### Global

- **Toast**: Sonner for rating submit/delete, comparison recorded, API errors (replacing silent catches)
- **Scroll to top**: Appears after 500px scroll on list pages. Lucide `ChevronUp`, circular, fixed bottom-right, motion fade.

## 6. Accessibility

### Keyboard Navigation

- Lightbox: ESC close, Left/Right arrow key image navigation
- Compare search: Full keyboard via shadcn `Command`
- All shadcn components: Built-in keyboard support
- Sortable headers: `tabIndex={0}`, Enter/Space to sort

### Focus Management

- Focus rings: `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2` (shadcn defaults)
- Dialog/Sheet: Focus trapped, returns focus on close

### Semantic HTML & ARIA

- `<label>` on every filter input (`sr-only` where placeholder is visual label)
- `scope="col"` on all `<th>`
- `<nav aria-label="Main navigation">`
- `aria-sort` on sortable headers
- `aria-busy="true"` on table during fetch
- `aria-label` on rating buttons

### Touch Targets

- Rating buttons: 40px (up from 32px)
- Tag badges: minimum `py-1 px-2.5` (up from `py-0.5 px-2`)
- Lightbox close/nav: minimum 44px
- Mobile hamburger: 44x44px
