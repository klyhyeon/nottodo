# NOT TO DO (낫투두)

"하지 않을 일"을 관리하는 습관 형성 앱. 금기(prohibition)를 설정하고 매일 성공/실패를 기록한다.

## Tech Stack

- **Frontend:** Vite + React 19 + TypeScript + Tailwind CSS v4
- **State:** Zustand (stores in `src/stores/`)
- **Backend:** Supabase (PostgreSQL, Auth, RLS, RPC, pg_cron)
- **Mobile:** Capacitor (iOS)
- **Testing:** Vitest + Testing Library
- **Routing:** React Router v7

## Architecture

```
src/
  App.tsx              # Routes + AuthGuard/GuestOnly wrappers
  main.tsx             # Entry point
  lib/
    supabase.ts        # Supabase client
    types.ts           # Shared TypeScript types
    date-utils.ts      # Local date formatting helpers
  stores/
    auth-store.ts      # Auth state (Zustand)
    prohibition-store.ts  # Prohibition CRUD + business logic (Zustand)
  pages/
    HomePage.tsx       # Today's prohibitions list
    ProhibitionDetailPage.tsx  # Detail + streak + timer + actions
    ProhibitionNewPage.tsx     # Create/edit/delete prohibition
    FailedPage.tsx     # Post-failure confession flow
    ConfessionsPage.tsx  # Public anonymous confessions feed
    LoginPage.tsx      # OAuth login
    SettingsPage.tsx    # User settings
  components/
    Layout.tsx         # Bottom tab nav + Outlet
    ProhibitionCard.tsx  # List item card
    CountdownTimer.tsx   # Timed prohibition countdown
    WeekHistory.tsx      # 7-day status grid
    StreakBadge.tsx       # Success count badge
    ConfessionCard.tsx   # Confession feed item
    BadgeButton.tsx      # Reaction button
    CategoryFilter.tsx   # Emoji category filter
    Toast.tsx            # Toast notifications
supabase/
  migrations/          # Numbered SQL migrations (001-008)
```

## Database Schema

### Tables
- **users** — `id`, `anonymous_name`, `anonymous_emoji`
- **prohibition_templates** — Recurring prohibition definitions. `active = false` = deleted.
- **prohibitions** — Daily records. `template_id` FK links to template for recurring. One-offs have `template_id = NULL`.
- **confessions** — Anonymous failure posts. FK to `prohibitions.id`.
- **badges** — Reactions on confessions (`me_too`, `tomorrow`, `fighting`)

### Key RLS Policies
- Users can only read/write their own data
- **UPDATE on prohibitions restricted to `date >= CURRENT_DATE - 1 day`** — this is intentional, don't try to update older rows directly
- Status transitions enforced server-side via `update_prohibition_status` RPC (SECURITY DEFINER)

### Cron Job (`mark-unverified`)
- Runs hourly via pg_cron
- Marks expired `active` prohibitions as `unverified`
- Uses `Asia/Seoul` timezone for date calculations

## Conventions

### Dates
- Always use local date formatting, never `toISOString().split('T')[0]` (UTC mismatch in KST)
- Use `formatLocalDate()`, `getLocalToday()`, `getLocalYesterday()` from `src/lib/date-utils.ts`
- Korea is UTC+9 with no DST

### Soft Delete
- `deleted_at` column on `prohibitions` — always filter with `.is('deleted_at', null)`
- Templates use `active = false` instead of soft delete

### State Management
- Zustand stores in `src/stores/`
- Store holds display-ready items, not raw DB rows
- `fetchToday` is the primary data loader, called on mount + 60s interval

### Supabase
- Direct client calls from stores (no API layer)
- RPC functions for operations that need to bypass RLS or enforce business rules
- Migrations are numbered sequentially in `supabase/migrations/`

## Commands

```bash
npm run dev          # Vite dev server
npm run build        # TypeScript check + Vite build
npm run lint         # ESLint
npx vitest run       # Run all tests
npx vitest run src/test/file.test.ts  # Run specific test
supabase db push     # Apply migrations
```

## Testing

- Tests in `src/test/` mirror source structure
- Use `vitest` with `jsdom` environment for component tests
- Pure business logic (transitions, streaks, date utils, merge logic) tested without mocks
- Component tests use Testing Library

## Important Gotchas

1. **RLS UPDATE restriction**: `prohibitions` UPDATE is limited to recent rows (`date >= CURRENT_DATE - 1 day`). Use RPC functions for operations on older data.
2. **Unique constraints**: `(user_id, title, date)` on prohibitions, `(user_id, title)` on active templates. Insert failures may be constraint violations, not bugs.
3. **Timezone**: All date logic assumes Asia/Seoul. The cron job uses `AT TIME ZONE 'Asia/Seoul'`. Client uses local date helpers.
4. **Capacitor**: The app runs as iOS native via Capacitor. Deep link handling for OAuth is in `App.tsx`.
