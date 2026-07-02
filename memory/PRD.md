# walkFellas — PRD

**Tagline:** Every bottle sold, tracked. Every shift, auditable.

## Product
Mobile POS + distributed inventory management + temporary workforce operations tool for ambulant sales at events (festivals, stadiums). Auditable traceability of every product unit from base bag → sale/waste/return.

## Roles
- **Walker** — Fast PIN + event-code login. POS grid, restock request, waste log with camera, shift close-out with reconciliation.
- **Supervisor** — Assigns bags, active-walker panel, restock queue, waste validation, shift-close confirmation.
- **Admin** — Events CRUD, product catalog per event, walker/staff management, dashboard (sales, waste, discrepancies, active shifts).

## Data model (audit ledger)
`movements` collection is a single source of truth. Every stock change is one row: `initial | restock | sale | waste | return_in | discrepancy`. Discrepancy is **never** user-declared — always computed at close-out as `physical - (initial + restocks - sales - waste)`.

## Backend (FastAPI + MongoDB)
- JWT hybrid auth (walker PIN + event, staff email/password), bcrypt hashes, role-based access
- `/api/auth/walker/login`, `/api/auth/staff/login`, `/api/auth/me`
- Events, Products, Walkers, Staff CRUD
- Shifts: assign-bag, current, close, confirm
- Sales, Waste (+ photo base64), Restocks (request → approve/reject)
- Dashboard overview + active-walkers with computed stock per shift
- Idempotent seed on startup

## Frontend (Expo Router / React Native)
- Brutalist Mobile design — 2pt hard black borders, 0 radius, JetBrains Mono style for numbers, red brand #E63946
- Auth screen with segmented Walker PIN | Staff Login + PIN numpad
- Role-based tab groups: (walker) / (supervisor) / (admin)
- SecureStore token storage (localStorage on web)
- Camera capture for waste (expo-camera)

## MVP scope (delivered)
✅ Roles, hybrid auth, POS, restock, waste with camera, shift reconciliation, supervisor queue, admin dashboard, seed data

## Deferred (roadmap)
- Offline-first with sync queue
- Native payment terminal integration
- Automatic restock suggestions
- Compliance module (age verification, training)
- Location/step tracking — **explicitly NOT in scope** per legal/reputational risk analysis
