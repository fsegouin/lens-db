# Admin Portal Design

## Overview

A password-protected admin portal for managing all database entities: lenses, cameras, systems, collections, and lens-camera compatibility. Accessible at `/admin/*` routes.

## Authentication

- `ADMIN_PASSWORD` env var, hashed with SHA-256 at comparison time
- `POST /api/admin/login` — validates password, rate-limited (5 req/60s), sets HTTP-only secure cookie
- Session token: random 32-byte hex stored in-memory with 24h expiry
- `src/middleware.ts` — protects all `/admin/*` routes (except `/admin/login`), redirects if no valid session
- `POST /api/admin/logout` — clears cookie
- Cookie flags: HttpOnly, Secure, SameSite=Strict, Path=/

## Routes

| Route | Purpose |
|-------|---------|
| `/admin/login` | Login page |
| `/admin` | Dashboard (entity counts + quick links) |
| `/admin/lenses` | Lenses table (paginated, searchable) |
| `/admin/lenses/new` | Create lens form |
| `/admin/lenses/[id]/edit` | Edit lens form |
| `/admin/cameras` | Cameras table |
| `/admin/cameras/new` | Create camera form |
| `/admin/cameras/[id]/edit` | Edit camera form |
| `/admin/systems` | Systems table |
| `/admin/systems/new` | Create system form |
| `/admin/systems/[id]/edit` | Edit system form |
| `/admin/collections` | Collections table |
| `/admin/collections/new` | Create collection form |
| `/admin/collections/[id]/edit` | Edit collection + manage lenses |
| `/admin/compatibility` | Lens-camera compatibility table |
| `/admin/compatibility/new` | Add compatibility entry |

## API Routes

All under `/api/admin/`, protected by session middleware:

- `GET/POST /api/admin/lenses` — list (search + pagination) / create
- `GET/PUT/DELETE /api/admin/lenses/[id]` — read / update / delete
- `GET/POST /api/admin/cameras` — list / create
- `GET/PUT/DELETE /api/admin/cameras/[id]`
- `GET/POST /api/admin/systems` — list / create
- `GET/PUT/DELETE /api/admin/systems/[id]`
- `GET/POST /api/admin/collections` — list / create
- `GET/PUT/DELETE /api/admin/collections/[id]` — includes managing collection lenses
- `GET/POST/DELETE /api/admin/compatibility` — list / create / delete

## UI Components

- **AdminLayout** — sidebar nav (entity links + logout), wraps all admin pages
- **AdminTable** — reusable: search, pagination, column sorting, "New" button, row click → edit
- **AdminForm** — renders fields from config (text, number, boolean toggle, select, textarea, JSON editor)
- **CollectionLensManager** — search/add/remove lenses within a collection
- **CompatibilityManager** — search lenses + cameras, toggle native/adapted, add notes

## Tech Decisions

- No new dependencies — React forms, native fetch, existing Tailwind + Drizzle
- Slug auto-generated from name on create (with manual override field)
- JSON fields (specs, images) editable as formatted JSON textarea with validation
- Delete actions require confirmation dialog
- All admin pages are client components (dynamic, no caching)

## Entity Form Fields

### Lenses
name, slug, brand, systemId (dropdown), description, url, lensType, era, productionStatus, focalLengthMin/Max, apertureMin/Max, lensElements, lensGroups, diaphragmBlades, weightG, filterSizeMm, minFocusDistanceM, maxMagnification, yearIntroduced, yearDiscontinued, isZoom, isMacro, isPrime, hasStabilization, hasAutofocus, specs (JSON), images (JSON)

### Cameras
name, slug, systemId (dropdown), description, url, sensorType, sensorSize, megapixels, resolution, yearIntroduced, bodyType, weightG, specs (JSON), images (JSON)

### Systems
name, slug, manufacturer, mountType, description

### Collections
name, slug, description + lens membership management

### Compatibility
lensId (search), cameraId (search), isNative (toggle), notes
