# Recurring Prohibition Refactor: Template/Instance Model

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the "copy a row each day" recurring model with a template/instance split that eliminates client-side orchestration, dedup logic, and RLS workarounds.

**Architecture:** A new `prohibition_templates` table holds the reusable definition (title, emoji, type, etc.). The existing `prohibitions` table becomes a record of completed days only — rows are INSERT-ed when the user marks succeeded/failed, not pre-created. `fetchToday` becomes a pure read: join templates with today's instances, present "active" for any template without a today-instance. The cron job simplifies to just marking unverified (no more row copying). Deletion = `active = false` on the template.

**Tech Stack:** Supabase (PostgreSQL, RLS, pg_cron, RPC), React + TypeScript, Zustand, Vitest

---

## Current Problems This Solves

| Problem | Root Cause | How Template/Instance Fixes It |
|---------|-----------|-------------------------------|
| `fetchToday` is 80 lines doing reads + writes + filters | Pre-creating rows requires dedup, expiry, visibility logic | Read-only: join templates + today's instances |
| 3 duplicate creation points (fetchToday, updateStatus, cron) | Each codepath must ensure tomorrow's row exists | No row pre-creation needed — template IS the recurring definition |
| RLS blocks group deletion of old rows | UPDATE policy: `date >= CURRENT_DATE - 1 day` | Deletion = `UPDATE templates SET active = false` (no old-row updates) |
| SECURITY DEFINER RPCs needed | RLS workaround for group operations | No group operations on instances needed |
| Visibility filter maze (yesterday active groups, dedup sets) | Multiple rows per group per day window | One template = one list item, always |

## File Structure

### New Files
- `supabase/migrations/008_template_instance_refactor.sql` — DDL: create `prohibition_templates`, migrate data, update RLS, update cron, drop unused RPCs
- `src/lib/date-utils.ts` — `getLocalToday()`, `getLocalYesterday()`, `formatLocalDate()` helpers (DRY date formatting used in 4+ places)

### Modified Files
- `src/lib/types.ts` — Add `ProhibitionTemplate` interface, update `Prohibition` to include `template_id`
- `src/stores/prohibition-store.ts` — Complete rewrite: template-based fetch, simplified updateStatus, simplified delete
- `src/pages/HomePage.tsx` — Minor: adapt to new store shape (templates + instances merged)
- `src/pages/ProhibitionNewPage.tsx` — Create/edit targets `prohibition_templates` instead of `prohibitions`
- `src/pages/ProhibitionDetailPage.tsx` — Adapt to template-based data, history uses `template_id`
- `src/pages/FailedPage.tsx` — Adapt prohibition lookup
- `src/components/ProhibitionCard.tsx` — No changes needed (receives same `Prohibition` shape)
- `src/components/WeekHistory.tsx` — Fix UTC date bug (`toISOString` → local date)
- `src/test/prohibition-store.test.ts` — Rewrite tests for new store logic

### Deleted (after migration)
- `supabase/migrations/007_delete_recurring_group.sql` — RPC no longer needed (keep file, but RPC dropped in 008)

## Data Model

```
prohibition_templates                 prohibitions (instances)
├── id uuid PK                        ├── id uuid PK
├── user_id uuid FK → users           ├── template_id uuid FK → prohibition_templates (nullable)
├── title text                        ├── user_id uuid FK → users
├── emoji text                        ├── date date
├── difficulty int 1-5                ├── status prohibition_status
├── type prohibition_type             ├── created_at timestamptz
├── start_time time?                  ├── updated_at timestamptz
├── end_time time?                    └── deleted_at timestamptz?
├── verify_deadline_hours int 0-12    
├── active boolean DEFAULT true       # Kept from old schema for backwards compat:
├── created_at timestamptz            ├── title, emoji, difficulty, type,
└── updated_at timestamptz            │   start_time, end_time, is_recurring,
                                      │   recurring_group_id, verify_deadline_hours
                                      # These are denormalized snapshots for:
                                      # 1. Non-recurring (one-off) prohibitions
                                      # 2. Historical records if template is edited later
                                      # 3. confessions FK compatibility
```

**Key insight:** Non-recurring prohibitions don't need a template. They work exactly as today — a single row in `prohibitions` with `template_id = NULL`. Only recurring prohibitions get a template.

**Display logic:**
- Active templates with no today-instance → show as "active"
- Active templates with today-instance → show instance status (succeeded/failed/unverified)
- Non-recurring today-prohibitions (template_id = NULL) → show as-is (unchanged)
- `active = false` templates → never shown

---

## Task 1: Date Utility Helpers

**Files:**
- Create: `src/lib/date-utils.ts`
- Create: `src/test/date-utils.test.ts`

Currently `fetchToday`, `create`, and `updateStatus` all duplicate the same local date formatting. Extract once.

- [ ] **Step 1: Write failing tests**

```typescript
// src/test/date-utils.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { getLocalToday, getLocalYesterday, formatLocalDate } from '../lib/date-utils'

describe('formatLocalDate', () => {
  it('formats date as YYYY-MM-DD', () => {
    const d = new Date(2026, 3, 27) // April 27
    expect(formatLocalDate(d)).toBe('2026-04-27')
  })

  it('zero-pads single-digit month and day', () => {
    const d = new Date(2026, 0, 5) // Jan 5
    expect(formatLocalDate(d)).toBe('2026-01-05')
  })
})

describe('getLocalToday', () => {
  afterEach(() => vi.useRealTimers())

  it('returns today in YYYY-MM-DD local time', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 3, 27, 23, 59))
    expect(getLocalToday()).toBe('2026-04-27')
  })
})

describe('getLocalYesterday', () => {
  afterEach(() => vi.useRealTimers())

  it('returns yesterday in YYYY-MM-DD local time', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 3, 27, 0, 30))
    expect(getLocalYesterday()).toBe('2026-04-26')
  })

  it('handles month boundary', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 4, 1, 10, 0)) // May 1
    expect(getLocalYesterday()).toBe('2026-04-30')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/test/date-utils.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement date-utils**

```typescript
// src/lib/date-utils.ts
export function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function getLocalToday(): string {
  return formatLocalDate(new Date())
}

export function getLocalYesterday(): string {
  const now = new Date()
  const yd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
  return formatLocalDate(yd)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/date-utils.test.ts`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/date-utils.ts src/test/date-utils.test.ts
git commit -m "feat: extract date-utils helpers (DRY local date formatting)"
```

---

## Task 2: Database Migration — Template Table + Data Migration

**Files:**
- Create: `supabase/migrations/008_template_instance_refactor.sql`

This migration:
1. Creates `prohibition_templates` table
2. Migrates existing recurring groups into templates
3. Adds `template_id` FK to `prohibitions`
4. Backfills `template_id` on existing recurring instances
5. Updates RLS policies for the new table
6. Replaces the cron job (no more row copying — only mark unverified)
7. Drops unused RPCs (`delete_recurring_group`, `set_recurring_group_id` trigger)

- [ ] **Step 1: Write the migration**

```sql
-- supabase/migrations/008_template_instance_refactor.sql

-- 1. Create prohibition_templates table
CREATE TABLE prohibition_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  emoji text NOT NULL DEFAULT '🚫',
  difficulty int NOT NULL DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5),
  type prohibition_type NOT NULL DEFAULT 'all_day',
  start_time time,
  end_time time,
  verify_deadline_hours int NOT NULL DEFAULT 2 CHECK (verify_deadline_hours BETWEEN 0 AND 12),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE prohibition_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own templates" ON prohibition_templates
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own templates" ON prohibition_templates
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own templates" ON prohibition_templates
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own templates" ON prohibition_templates
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_templates_user_active ON prohibition_templates (user_id) WHERE active = true;

-- updated_at trigger (reuse existing function)
CREATE TRIGGER templates_set_updated_at
  BEFORE UPDATE ON prohibition_templates
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

-- Unique: one active template per user per title
CREATE UNIQUE INDEX idx_templates_user_title_active
  ON prohibition_templates (user_id, title)
  WHERE active = true;

-- 2. Add template_id to prohibitions
ALTER TABLE prohibitions
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES prohibition_templates(id) ON DELETE SET NULL;

-- 3. Migrate: create templates from existing recurring groups
INSERT INTO prohibition_templates (id, user_id, title, emoji, difficulty, type, start_time, end_time, verify_deadline_hours, active, created_at)
SELECT DISTINCT ON (recurring_group_id)
  recurring_group_id,
  user_id,
  title,
  emoji,
  difficulty,
  type,
  start_time,
  end_time,
  verify_deadline_hours,
  (deleted_at IS NULL),  -- if all in group are deleted, template is inactive
  MIN(created_at) OVER (PARTITION BY recurring_group_id)
FROM prohibitions
WHERE is_recurring = true
  AND recurring_group_id IS NOT NULL
ORDER BY recurring_group_id, date DESC;

-- For deleted groups: mark template inactive
UPDATE prohibition_templates t
SET active = false
WHERE NOT EXISTS (
  SELECT 1 FROM prohibitions p
  WHERE p.recurring_group_id = t.id
    AND p.deleted_at IS NULL
);

-- 4. Backfill template_id on existing recurring instances
UPDATE prohibitions
SET template_id = recurring_group_id
WHERE is_recurring = true
  AND recurring_group_id IS NOT NULL;

-- 5. Index for template_id lookups
CREATE INDEX idx_prohibitions_template_date ON prohibitions (template_id, date)
  WHERE template_id IS NOT NULL AND deleted_at IS NULL;

-- 6. Replace cron job — only mark unverified, NO row copying
DO $$
DECLARE
  old_job_id integer;
BEGIN
  SELECT jobid INTO old_job_id
  FROM cron.job WHERE jobname = 'mark-unverified' LIMIT 1;
  IF old_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(old_job_id);
  END IF;
END $$;

SELECT cron.schedule(
  'mark-unverified',
  '0 * * * *',
  $$
    UPDATE prohibitions
    SET status = 'unverified', updated_at = now()
    WHERE status = 'active'
      AND deleted_at IS NULL
      AND (
        CASE
          WHEN type = 'timed' AND end_time IS NOT NULL THEN
            ((date + end_time +
              CASE WHEN start_time IS NOT NULL AND end_time < start_time
                THEN INTERVAL '1 day' ELSE INTERVAL '0' END
              + (verify_deadline_hours * INTERVAL '1 hour')
            ) AT TIME ZONE 'Asia/Seoul') < now()
          ELSE
            ((date + INTERVAL '1 day' + (verify_deadline_hours * INTERVAL '1 hour')
            ) AT TIME ZONE 'Asia/Seoul') < now()
        END
      );
  $$
);

-- 7. Drop unused RPCs and triggers
DROP FUNCTION IF EXISTS delete_recurring_group(uuid);
DROP TRIGGER IF EXISTS prohibitions_set_recurring_group_id ON prohibitions;
DROP FUNCTION IF EXISTS set_recurring_group_id();
```

- [ ] **Step 2: Review the migration manually**

Read through the SQL and verify:
- Templates are created from the most recent row per `recurring_group_id`
- `template_id` backfill matches `recurring_group_id`
- Deleted groups produce `active = false` templates
- Cron job no longer copies rows
- FK cascade is SET NULL (not CASCADE) so deleting a template doesn't delete history

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/008_template_instance_refactor.sql
git commit -m "feat: migration 008 — prohibition_templates table + data migration"
```

---

## Task 3: Update TypeScript Types

**Files:**
- Modify: `src/lib/types.ts:1-29`

- [ ] **Step 1: Add ProhibitionTemplate type and update Prohibition**

```typescript
// src/lib/types.ts
export type ProhibitionType = 'all_day' | 'timed'
export type ProhibitionStatus = 'active' | 'succeeded' | 'failed' | 'unverified'
export type BadgeType = 'me_too' | 'tomorrow' | 'fighting'

export interface User {
  id: string
  anonymous_name: string
  anonymous_emoji: string
  created_at: string
}

export interface ProhibitionTemplate {
  id: string
  user_id: string
  title: string
  emoji: string
  difficulty: number
  type: ProhibitionType
  start_time: string | null
  end_time: string | null
  verify_deadline_hours: number
  active: boolean
  created_at: string
  updated_at: string
}

export interface Prohibition {
  id: string
  user_id: string
  template_id: string | null
  title: string
  emoji: string
  difficulty: number
  type: ProhibitionType
  start_time: string | null
  end_time: string | null
  date: string
  status: ProhibitionStatus
  is_recurring: boolean
  recurring_group_id: string | null
  verify_deadline_hours: number
  created_at: string
  updated_at: string
  deleted_at: string | null
}

/** Unified item for the home list — either a template (active) or an instance */
export interface ProhibitionListItem {
  id: string               // template.id for recurring-active, prohibition.id for recorded
  templateId: string | null // template.id if recurring
  title: string
  emoji: string
  difficulty: number
  type: ProhibitionType
  start_time: string | null
  end_time: string | null
  date: string
  status: ProhibitionStatus
  verify_deadline_hours: number
  is_recurring: boolean
}

// ... rest of file unchanged (Confession, Badge, BadgeCounts)
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add ProhibitionTemplate and ProhibitionListItem types"
```

---

## Task 4: Rewrite prohibition-store — fetchToday

**Files:**
- Modify: `src/stores/prohibition-store.ts` (complete rewrite)

This is the core change. The new `fetchToday`:
1. Fetches active templates for the user
2. Fetches today's + yesterday's instances (for deadline window)
3. Fetches one-off (non-template) today prohibitions
4. Merges into a unified list: template without today-instance = "active"
5. Client-side marks expired active instances as unverified (+ DB update)
6. No row creation, no dedup, no visibility filter

- [ ] **Step 1: Write failing tests for the new fetchToday merge logic**

The merge logic is pure — extract it as a testable function.

```typescript
// src/test/prohibition-store.test.ts — replace the entire file
import { describe, it, expect } from 'vitest'
import {
  isValidTransition,
  calculateStreak,
  mergeTemplatesAndInstances,
  getVerifyDeadline,
} from '../stores/prohibition-store'
import type { Prohibition, ProhibitionTemplate, ProhibitionListItem } from '../lib/types'

// -- Existing tests (keep) --
describe('isValidTransition', () => {
  it('allows active → succeeded', () => {
    expect(isValidTransition('active', 'succeeded')).toBe(true)
  })
  it('allows active → failed', () => {
    expect(isValidTransition('active', 'failed')).toBe(true)
  })
  it('rejects succeeded → failed', () => {
    expect(isValidTransition('succeeded', 'failed')).toBe(false)
  })
  it('rejects failed → succeeded', () => {
    expect(isValidTransition('failed', 'succeeded')).toBe(false)
  })
  it('rejects unverified → anything', () => {
    expect(isValidTransition('unverified', 'succeeded')).toBe(false)
    expect(isValidTransition('unverified', 'failed')).toBe(false)
  })
})

describe('calculateStreak', () => {
  const makeProhibition = (date: string, status: Prohibition['status']): Prohibition => ({
    id: '1', user_id: '1', template_id: null, title: 'test', emoji: '🍕', difficulty: 1,
    type: 'all_day', start_time: null, end_time: null,
    date, status, is_recurring: false, recurring_group_id: null, verify_deadline_hours: 2,
    created_at: '', updated_at: '', deleted_at: null,
  })

  it('returns 0 for empty list', () => {
    expect(calculateStreak([])).toBe(0)
  })
  it('counts consecutive succeeded days backwards', () => {
    expect(calculateStreak([
      makeProhibition('2026-04-13', 'succeeded'),
      makeProhibition('2026-04-12', 'succeeded'),
      makeProhibition('2026-04-11', 'succeeded'),
    ])).toBe(3)
  })
  it('stops at first non-succeeded day', () => {
    expect(calculateStreak([
      makeProhibition('2026-04-13', 'succeeded'),
      makeProhibition('2026-04-12', 'failed'),
      makeProhibition('2026-04-11', 'succeeded'),
    ])).toBe(1)
  })
  it('returns 0 if most recent is not succeeded', () => {
    expect(calculateStreak([
      makeProhibition('2026-04-13', 'failed'),
      makeProhibition('2026-04-12', 'succeeded'),
    ])).toBe(0)
  })
})

// -- New tests --
describe('mergeTemplatesAndInstances', () => {
  const today = '2026-04-27'

  const makeTemplate = (overrides: Partial<ProhibitionTemplate> = {}): ProhibitionTemplate => ({
    id: 'tmpl-1',
    user_id: 'u1',
    title: '늦게 자지 않기',
    emoji: '💤',
    difficulty: 3,
    type: 'all_day',
    start_time: null,
    end_time: null,
    verify_deadline_hours: 2,
    active: true,
    created_at: '2026-04-20T00:00:00Z',
    updated_at: '2026-04-20T00:00:00Z',
    ...overrides,
  })

  const makeInstance = (overrides: Partial<Prohibition> = {}): Prohibition => ({
    id: 'inst-1',
    user_id: 'u1',
    template_id: 'tmpl-1',
    title: '늦게 자지 않기',
    emoji: '💤',
    difficulty: 3,
    type: 'all_day',
    start_time: null,
    end_time: null,
    date: today,
    status: 'succeeded',
    is_recurring: true,
    recurring_group_id: 'tmpl-1',
    verify_deadline_hours: 2,
    created_at: '2026-04-27T10:00:00Z',
    updated_at: '2026-04-27T10:00:00Z',
    deleted_at: null,
    ...overrides,
  })

  it('shows template as active when no today-instance exists', () => {
    const result = mergeTemplatesAndInstances(
      [makeTemplate()],
      [],   // no instances
      [],   // no one-offs
      today,
    )
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('active')
    expect(result[0].templateId).toBe('tmpl-1')
    expect(result[0].is_recurring).toBe(true)
  })

  it('shows instance status when today-instance exists', () => {
    const result = mergeTemplatesAndInstances(
      [makeTemplate()],
      [makeInstance({ status: 'succeeded' })],
      [],
      today,
    )
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('succeeded')
    expect(result[0].id).toBe('inst-1')
  })

  it('shows failed instance status', () => {
    const result = mergeTemplatesAndInstances(
      [makeTemplate()],
      [makeInstance({ status: 'failed' })],
      [],
      today,
    )
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('failed')
  })

  it('includes one-off prohibitions alongside templates', () => {
    const oneOff: Prohibition = {
      ...makeInstance({ id: 'oneoff-1', template_id: null, title: '커피 안 마시기', is_recurring: false, recurring_group_id: null }),
    }
    const result = mergeTemplatesAndInstances(
      [makeTemplate()],
      [],
      [oneOff],
      today,
    )
    expect(result).toHaveLength(2)
    expect(result.find(r => r.title === '커피 안 마시기')).toBeTruthy()
    expect(result.find(r => r.title === '늦게 자지 않기')?.status).toBe('active')
  })

  it('never shows duplicate for same template', () => {
    const result = mergeTemplatesAndInstances(
      [makeTemplate(), makeTemplate({ id: 'tmpl-2', title: '야식 안 먹기' })],
      [makeInstance()],
      [],
      today,
    )
    expect(result).toHaveLength(2)
  })

  it('prefers yesterday active instance over today if deadline not passed', () => {
    const yesterdayInstance = makeInstance({
      id: 'inst-yesterday',
      date: '2026-04-26',
      status: 'active',
    })
    const result = mergeTemplatesAndInstances(
      [makeTemplate()],
      [yesterdayInstance],
      [],
      today,
    )
    // Should show yesterday's active (within deadline), not a new "active" from template
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('inst-yesterday')
    expect(result[0].date).toBe('2026-04-26')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/test/prohibition-store.test.ts`
Expected: FAIL — `mergeTemplatesAndInstances` not exported

- [ ] **Step 3: Implement the new prohibition-store**

```typescript
// src/stores/prohibition-store.ts — complete rewrite
import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { getLocalToday, getLocalYesterday } from '../lib/date-utils'
import type {
  Prohibition,
  ProhibitionTemplate,
  ProhibitionListItem,
  ProhibitionStatus,
  ProhibitionType,
} from '../lib/types'

// -- Pure functions (exported for testing) --

export function isValidTransition(from: ProhibitionStatus, to: ProhibitionStatus): boolean {
  return from === 'active' && (to === 'succeeded' || to === 'failed')
}

export function getVerifyDeadline(p: { date: string; type: ProhibitionType; end_time: string | null; start_time: string | null; verify_deadline_hours: number }): Date {
  const date = new Date(p.date + 'T00:00:00')
  if (p.type === 'timed' && p.end_time) {
    const [h, m] = p.end_time.split(':').map(Number)
    date.setHours(h, m, 0, 0)
    if (p.start_time) {
      const [sh] = p.start_time.split(':').map(Number)
      if (h < sh) date.setDate(date.getDate() + 1)
    }
  } else {
    date.setDate(date.getDate() + 1)
    date.setHours(0, 0, 0, 0)
  }
  date.setHours(date.getHours() + (p.verify_deadline_hours ?? 0))
  return date
}

export function isDeadlinePassed(p: { date: string; type: ProhibitionType; end_time: string | null; start_time: string | null; verify_deadline_hours: number }): boolean {
  return new Date() > getVerifyDeadline(p)
}

export function calculateStreak(prohibitions: Prohibition[]): number {
  const sorted = [...prohibitions].sort((a, b) => b.date.localeCompare(a.date))
  let streak = 0
  for (const p of sorted) {
    if (p.status === 'succeeded') streak++
    else break
  }
  return streak
}

/**
 * Pure merge: combines templates + instances into a flat list for display.
 * Rules:
 * - Template with no today-instance → status "active"
 * - Template with today-instance → show instance status
 * - If yesterday's instance is still active (deadline not passed) → show that instead
 * - One-off prohibitions (template_id = null) → show as-is
 * - One item per template, always
 */
export function mergeTemplatesAndInstances(
  templates: ProhibitionTemplate[],
  instances: Prohibition[],
  oneOffs: Prohibition[],
  today: string,
): ProhibitionListItem[] {
  const items: ProhibitionListItem[] = []

  for (const tmpl of templates) {
    const todayInst = instances.find(i => i.template_id === tmpl.id && i.date === today)
    const yesterdayInst = instances.find(
      i => i.template_id === tmpl.id && i.date !== today && i.status === 'active' && !isDeadlinePassed(i)
    )

    if (yesterdayInst) {
      // Yesterday's instance still within deadline — show it
      items.push({
        id: yesterdayInst.id,
        templateId: tmpl.id,
        title: tmpl.title,
        emoji: tmpl.emoji,
        difficulty: tmpl.difficulty,
        type: tmpl.type,
        start_time: tmpl.start_time,
        end_time: tmpl.end_time,
        date: yesterdayInst.date,
        status: 'active',
        verify_deadline_hours: tmpl.verify_deadline_hours,
        is_recurring: true,
      })
    } else if (todayInst) {
      // Today has a recorded instance — show its status
      items.push({
        id: todayInst.id,
        templateId: tmpl.id,
        title: tmpl.title,
        emoji: tmpl.emoji,
        difficulty: tmpl.difficulty,
        type: tmpl.type,
        start_time: tmpl.start_time,
        end_time: tmpl.end_time,
        date: todayInst.date,
        status: todayInst.status,
        verify_deadline_hours: tmpl.verify_deadline_hours,
        is_recurring: true,
      })
    } else {
      // No instance — show as active
      items.push({
        id: tmpl.id,
        templateId: tmpl.id,
        title: tmpl.title,
        emoji: tmpl.emoji,
        difficulty: tmpl.difficulty,
        type: tmpl.type,
        start_time: tmpl.start_time,
        end_time: tmpl.end_time,
        date: today,
        status: 'active',
        verify_deadline_hours: tmpl.verify_deadline_hours,
        is_recurring: true,
      })
    }
  }

  // One-off prohibitions (non-recurring, no template)
  for (const p of oneOffs) {
    items.push({
      id: p.id,
      templateId: null,
      title: p.title,
      emoji: p.emoji,
      difficulty: p.difficulty,
      type: p.type,
      start_time: p.start_time,
      end_time: p.end_time,
      date: p.date,
      status: p.status,
      verify_deadline_hours: p.verify_deadline_hours,
      is_recurring: false,
    })
  }

  return items
}

// -- Store --

interface CreateProhibitionInput {
  title: string
  emoji: string
  difficulty: number
  type: ProhibitionType
  start_time?: string
  end_time?: string
  is_recurring: boolean
  verify_deadline_hours: number
}

interface ProhibitionState {
  items: ProhibitionListItem[]
  loading: boolean
  fetchToday: (userId: string) => Promise<void>
  fetchHistory: (userId: string, templateIdOrTitle: string) => Promise<Prohibition[]>
  create: (userId: string, input: CreateProhibitionInput) => Promise<void>
  updateStatus: (item: ProhibitionListItem, status: ProhibitionStatus) => Promise<void>
  deleteProhibition: (item: ProhibitionListItem) => Promise<void>
}

export const useProhibitionStore = create<ProhibitionState>((set, get) => ({
  items: [],
  loading: false,

  fetchToday: async (userId: string) => {
    set({ loading: true })
    const today = getLocalToday()
    const yesterday = getLocalYesterday()

    // 1. Active templates
    const { data: templates } = await supabase
      .from('prohibition_templates')
      .select('*')
      .eq('user_id', userId)
      .eq('active', true)
      .order('created_at', { ascending: true })

    // 2. Today + yesterday instances for active templates
    const { data: instances } = await supabase
      .from('prohibitions')
      .select('*')
      .eq('user_id', userId)
      .not('template_id', 'is', null)
      .is('deleted_at', null)
      .in('date', [today, yesterday])

    // 3. One-off (non-recurring) today prohibitions
    const { data: oneOffs } = await supabase
      .from('prohibitions')
      .select('*')
      .eq('user_id', userId)
      .is('template_id', null)
      .is('deleted_at', null)
      .eq('date', today)
      .order('created_at', { ascending: true })

    // 4. Mark expired active instances as unverified (client + DB)
    const activeInstances = (instances ?? []).filter(
      (p: Prohibition) => p.status === 'active' && isDeadlinePassed(p)
    )
    for (const p of activeInstances) {
      await supabase.from('prohibitions').update({ status: 'unverified' }).eq('id', p.id)
      p.status = 'unverified'
    }

    // Also mark expired one-off actives
    const expiredOneOffs = (oneOffs ?? []).filter(
      (p: Prohibition) => p.status === 'active' && isDeadlinePassed(p)
    )
    for (const p of expiredOneOffs) {
      await supabase.from('prohibitions').update({ status: 'unverified' }).eq('id', p.id)
      p.status = 'unverified'
    }

    // 5. Merge
    const items = mergeTemplatesAndInstances(
      (templates ?? []) as ProhibitionTemplate[],
      (instances ?? []) as Prohibition[],
      (oneOffs ?? []) as Prohibition[],
      today,
    )

    set({ items, loading: false })
  },

  fetchHistory: async (userId: string, templateIdOrTitle: string) => {
    // Try by template_id first (recurring), fall back to title (one-off)
    let query = supabase
      .from('prohibitions')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('date', { ascending: false })
      .limit(30)

    // UUID format check
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(templateIdOrTitle)
    if (isUuid) {
      query = query.eq('template_id', templateIdOrTitle)
    } else {
      query = query.eq('title', templateIdOrTitle)
    }

    const { data, error } = await query
    if (error) throw error
    return (data ?? []) as Prohibition[]
  },

  create: async (userId: string, input: CreateProhibitionInput) => {
    const today = getLocalToday()

    if (input.is_recurring) {
      // Create template, then let fetchToday show it as active
      const { error } = await supabase
        .from('prohibition_templates')
        .insert({
          user_id: userId,
          title: input.title,
          emoji: input.emoji,
          difficulty: input.difficulty,
          type: input.type,
          start_time: input.type === 'timed' ? input.start_time : null,
          end_time: input.type === 'timed' ? input.end_time : null,
          verify_deadline_hours: input.verify_deadline_hours,
        })
      if (error) throw error
    } else {
      // One-off: insert directly into prohibitions
      const { error } = await supabase
        .from('prohibitions')
        .insert({
          user_id: userId,
          title: input.title,
          emoji: input.emoji,
          difficulty: input.difficulty,
          type: input.type,
          start_time: input.type === 'timed' ? input.start_time : null,
          end_time: input.type === 'timed' ? input.end_time : null,
          date: today,
          is_recurring: false,
          verify_deadline_hours: input.verify_deadline_hours,
        })
      if (error) throw error
    }

    // Refresh list
    await get().fetchToday(userId)
  },

  updateStatus: async (item: ProhibitionListItem, status: ProhibitionStatus) => {
    if (!isValidTransition(item.status, status)) {
      throw new Error(`Invalid transition: ${item.status} → ${status}`)
    }

    if (item.templateId && item.status === 'active' && !item.id.startsWith('inst-')) {
      // This is a template shown as "active" (no instance yet) — create the instance
      const today = getLocalToday()
      const { data, error } = await supabase
        .from('prohibitions')
        .insert({
          template_id: item.templateId,
          user_id: (await supabase.auth.getUser()).data.user!.id,
          title: item.title,
          emoji: item.emoji,
          difficulty: item.difficulty,
          type: item.type,
          start_time: item.start_time,
          end_time: item.end_time,
          date: item.date || today,
          status,
          is_recurring: true,
          verify_deadline_hours: item.verify_deadline_hours,
        })
        .select()
        .single()
      if (error) throw error

      // Update list item with new instance
      set({
        items: get().items.map(i =>
          i.id === item.id ? { ...i, id: data.id, status } : i
        ),
      })
    } else {
      // Existing instance — use RPC for safe transition
      const { error } = await supabase.rpc('update_prohibition_status', {
        prohibition_id: item.id,
        new_status: status,
      })
      if (error) throw error

      set({
        items: get().items.map(i =>
          i.id === item.id ? { ...i, status } : i
        ),
      })
    }
  },

  deleteProhibition: async (item: ProhibitionListItem) => {
    if (item.templateId) {
      // Recurring: deactivate template
      const { error } = await supabase
        .from('prohibition_templates')
        .update({ active: false })
        .eq('id', item.templateId)
      if (error) throw error
    } else {
      // One-off: soft delete the instance
      const { error } = await supabase
        .from('prohibitions')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', item.id)
      if (error) throw error
    }

    set({ items: get().items.filter(i => i.id !== item.id) })
  },
}))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/test/prohibition-store.test.ts`
Expected: PASS (all tests including new mergeTemplatesAndInstances tests)

- [ ] **Step 5: Commit**

```bash
git add src/stores/prohibition-store.ts src/test/prohibition-store.test.ts
git commit -m "feat: rewrite prohibition-store with template/instance model"
```

---

## Task 5: Update ProhibitionCard and HomePage

**Files:**
- Modify: `src/components/ProhibitionCard.tsx:1-48`
- Modify: `src/pages/HomePage.tsx:1-62`

The card and home page need to use `ProhibitionListItem` instead of `Prohibition`.

- [ ] **Step 1: Update ProhibitionCard**

```typescript
// src/components/ProhibitionCard.tsx
import { Link } from 'react-router-dom'
import type { ProhibitionListItem } from '../lib/types'

const statusConfig = {
  active: { label: '진행중', bg: 'bg-gray-100', text: 'text-gray-400' },
  succeeded: { label: '성공! ✨', bg: 'bg-success', text: 'text-success-text' },
  failed: { label: '실패', bg: 'bg-fail', text: 'text-accent' },
  unverified: { label: '미인증', bg: 'bg-gray-100', text: 'text-gray-400' },
} as const

interface Props {
  prohibition: ProhibitionListItem
}

export default function ProhibitionCard({ prohibition }: Props) {
  const { id, title, emoji, difficulty, type, start_time, end_time, status } = prohibition
  const config = statusConfig[status]

  const timeLabel = type === 'timed' && start_time && end_time
    ? `${start_time.slice(0, 5)}~${end_time.slice(0, 5)}`
    : '하루종일'

  return (
    <Link
      to={`/prohibition/${id}`}
      className={`flex items-center p-4 bg-white rounded-2xl gap-3 border-[1.5px] ${
        status === 'succeeded' ? 'border-success' : status === 'failed' ? 'border-fail-border' : 'border-gray-100'
      }`}
    >
      <div className={`w-11 h-11 rounded-full flex items-center justify-center text-lg font-black ${
        status === 'succeeded' ? 'bg-success text-success-text line-through' : 'bg-cream border-2 border-dashed border-gray-300 text-primary'
      }`}>
        {status === 'failed' ? '😵' : '✕'}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`font-bold text-sm ${status === 'succeeded' ? 'text-gray-400 line-through' : status === 'failed' ? 'text-accent' : 'text-primary'}`}>
          {title}
        </div>
        <div className="text-xs text-gray-400 mt-0.5">
          Lv.{difficulty} · {timeLabel} · <span>{emoji}</span>
        </div>
      </div>
      <div className={`text-xs px-2.5 py-1 rounded-full font-semibold ${config.bg} ${config.text}`}>
        {config.label}
      </div>
    </Link>
  )
}
```

- [ ] **Step 2: Update HomePage**

```typescript
// src/pages/HomePage.tsx
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../stores/auth-store'
import { useProhibitionStore } from '../stores/prohibition-store'
import ProhibitionCard from '../components/ProhibitionCard'
import StreakBadge from '../components/StreakBadge'

export default function HomePage() {
  const user = useAuthStore(s => s.user)
  const { items, loading, fetchToday } = useProhibitionStore()

  useEffect(() => {
    if (!user) return
    fetchToday(user.id)
    const interval = setInterval(() => fetchToday(user.id), 60_000)
    return () => clearInterval(interval)
  }, [user, fetchToday])

  const today = new Date()
  const dateStr = `${today.getMonth() + 1}월 ${today.getDate()}일 ${['일', '월', '화', '수', '목', '금', '토'][today.getDay()]}요일`

  const succeededCount = items.filter(p => p.status === 'succeeded').length

  return (
    <div className="p-5">
      <div className="flex justify-between items-center mb-5">
        <div>
          <div className="text-xs text-gray-400">{dateStr}</div>
          <h1 className="text-2xl font-black font-serif text-primary">오늘의 금기</h1>
        </div>
        <div className="w-9 h-9 rounded-full bg-cream-orange border-[1.5px] border-dashed border-gray-300 flex items-center justify-center text-base">
          {user?.anonymous_emoji ?? '😊'}
        </div>
      </div>

      {succeededCount > 0 && <div className="mb-4"><StreakBadge count={succeededCount} /></div>}

      {loading ? (
        <div className="text-center text-gray-400 py-12">불러오는 중...</div>
      ) : items.length === 0 ? (
        <div className="text-center text-gray-400 py-12">
          <div className="text-4xl mb-3">✕</div>
          <div className="text-sm">아직 금기가 없어요</div>
          <div className="text-xs mt-1">오늘 하지 않을 일을 추가해보세요</div>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {items.map(p => (
            <ProhibitionCard key={p.id} prohibition={p} />
          ))}
        </div>
      )}

      <Link
        to="/prohibition/new"
        className="block mt-4 py-3.5 bg-primary rounded-full text-center"
      >
        <span className="text-white font-bold text-sm">+ 오늘의 금기 추가 ✏️</span>
      </Link>
    </div>
  )
}
```

- [ ] **Step 3: Update ProhibitionCard test**

In `src/test/ProhibitionCard.test.tsx`, update the mock prohibition to include `template_id` field and match `ProhibitionListItem`:

```typescript
// Update the mock object in the test to add templateId and is_recurring fields
// The test creates a prohibition object — add the new required fields:
//   templateId: null, is_recurring: false
```

- [ ] **Step 4: Run all tests**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/ProhibitionCard.tsx src/pages/HomePage.tsx src/test/ProhibitionCard.test.tsx
git commit -m "feat: update HomePage and ProhibitionCard for template/instance model"
```

---

## Task 6: Update ProhibitionDetailPage

**Files:**
- Modify: `src/pages/ProhibitionDetailPage.tsx:1-132`

The detail page needs to find the item from the new `items` array (which uses `ProhibitionListItem`), and pass it to `updateStatus` with the new signature.

- [ ] **Step 1: Rewrite ProhibitionDetailPage**

```typescript
// src/pages/ProhibitionDetailPage.tsx
import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/auth-store'
import { useProhibitionStore, calculateStreak, getVerifyDeadline } from '../stores/prohibition-store'
import WeekHistory from '../components/WeekHistory'
import CountdownTimer from '../components/CountdownTimer'
import type { Prohibition } from '../lib/types'

export default function ProhibitionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const { items, updateStatus, fetchHistory } = useProhibitionStore()
  const item = items.find(p => p.id === id)

  const [history, setHistory] = useState<Prohibition[]>([])
  const [maxStreak, setMaxStreak] = useState(0)

  useEffect(() => {
    if (user && item) {
      const historyKey = item.templateId ?? item.title
      fetchHistory(user.id, historyKey).then(data => {
        setHistory(data)
        let max = 0
        let current = 0
        for (const p of [...data].sort((a, b) => a.date.localeCompare(b.date))) {
          if (p.status === 'succeeded') { current++; max = Math.max(max, current) }
          else { current = 0 }
        }
        setMaxStreak(max)
      })
    }
  }, [user, item, fetchHistory])

  if (!item) {
    return <div className="p-5 text-center text-gray-400">금기를 찾을 수 없어요</div>
  }

  const streak = calculateStreak(history)

  const handleSuccess = async () => {
    await updateStatus(item, 'succeeded')
    navigate('/')
  }

  const handleFail = async () => {
    await updateStatus(item, 'failed')
    navigate(`/prohibition/${item.id}/failed`)
  }

  const [timerDone, setTimerDone] = useState(false)

  const handleTimerComplete = () => {
    setTimerDone(true)
  }

  return (
    <div className="p-5">
      <div className="flex justify-between items-center mb-5">
        <button onClick={() => navigate(-1)} className="text-lg">← 뒤로</button>
        <button onClick={() => navigate(`/prohibition/new?edit=${item.id}`)} className="text-sm text-gray-400">수정</button>
      </div>

      {/* Header */}
      <div className="text-center mb-6">
        <div className="w-[72px] h-[72px] rounded-full bg-cream border-[2.5px] border-dashed border-gray-300 flex items-center justify-center text-3xl font-black text-primary mx-auto mb-3">
          {item.status === 'failed' ? '😵' : '✕'}
        </div>
        <h1 className="text-xl font-black font-serif text-primary">{item.title}</h1>
        <div className="text-sm text-gray-400 mt-1">
          {item.emoji} Lv.{item.difficulty} · {item.type === 'timed' ? '시간 지정' : '하루종일'}
        </div>
      </div>

      {/* Timer (timed type) */}
      {item.type === 'timed' && item.status === 'active' && item.end_time && (
        <div className={`p-6 bg-white rounded-2xl border-[1.5px] ${timerDone ? 'border-gray-200' : 'border-success'} text-center mb-3`}>
          {timerDone ? (
            <>
              <div className="text-xs text-gray-400 font-semibold mb-2">⏰ 금기 시간 종료</div>
              <div className="text-sm text-gray-500 leading-relaxed">시간이 끝났어요!<br />성공했다면 아래 버튼을 눌러주세요.</div>
            </>
          ) : (
            <>
              <div className="text-xs text-success-text font-semibold mb-2">🟢 금기 시간 진행중</div>
              <CountdownTimer endTime={item.end_time} onComplete={handleTimerComplete} />
              <div className="text-xs text-gray-400 mt-2">
                {item.start_time?.slice(0, 5)} ~ {item.end_time?.slice(0, 5)}
              </div>
            </>
          )}
        </div>
      )}

      {/* Streak */}
      <div className="p-4 bg-cream-dark rounded-2xl text-center mb-3">
        <div className="text-xs text-gray-400 mb-1">연속 성공</div>
        <div className="text-3xl font-black text-primary">🔥 {streak}일</div>
        <div className="text-xs text-gray-400 mt-1">최고 기록: {maxStreak}일</div>
      </div>

      {/* Week History */}
      <div className="mb-4">
        <WeekHistory history={history} />
      </div>

      {/* Actions */}
      {item.status === 'active' && (
        <div className="flex gap-2.5">
          <button onClick={handleSuccess} className="flex-1 py-3.5 bg-primary rounded-full text-white font-bold text-sm">
            오늘 성공! ✨
          </button>
          <button onClick={handleFail} className="flex-1 py-3.5 bg-white border-[1.5px] border-fail-border rounded-full text-accent font-bold text-sm">
            실패했어... 😵
          </button>
        </div>
      )}

      {item.status === 'active' && (
        <div className="text-center mt-2 text-xs text-gray-300">
          {(() => {
            const deadline = getVerifyDeadline(item)
            const h = deadline.getHours()
            const m = deadline.getMinutes()
            const dateStr = deadline.getDate() !== new Date().getDate() ? '내일 ' : ''
            return `인증 마감: ${dateStr}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}까지`
          })()}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/pages/ProhibitionDetailPage.tsx
git commit -m "feat: update ProhibitionDetailPage for template/instance model"
```

---

## Task 7: Update ProhibitionNewPage

**Files:**
- Modify: `src/pages/ProhibitionNewPage.tsx:1-250`

The new page now:
- For recurring: creates/edits a `prohibition_template`
- For one-off: creates/edits a `prohibition` row (as before)
- Delete: calls `deleteProhibition(item)` with the list item

- [ ] **Step 1: Rewrite ProhibitionNewPage**

```typescript
// src/pages/ProhibitionNewPage.tsx
import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../stores/auth-store'
import { useProhibitionStore } from '../stores/prohibition-store'
import { supabase } from '../lib/supabase'
import type { ProhibitionType } from '../lib/types'

const EMOJI_OPTIONS = ['🍕', '📱', '💸', '🍺', '🛒', '🎮', '☕', '🚬', '💤', '🚫']

export default function ProhibitionNewPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const editId = searchParams.get('edit')
  const user = useAuthStore(s => s.user)
  const { create, items, deleteProhibition } = useProhibitionStore()
  const editTarget = editId ? items.find(p => p.id === editId) : null

  const [title, setTitle] = useState('')
  const [emoji, setEmoji] = useState('🚫')
  const [difficulty, setDifficulty] = useState(1)
  const [type, setType] = useState<ProhibitionType>('all_day')
  const [startTime, setStartTime] = useState('22:00')
  const [endTime, setEndTime] = useState('08:00')
  const [isRecurring, setIsRecurring] = useState(false)
  const [verifyDeadlineHours, setVerifyDeadlineHours] = useState(2)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (editTarget) {
      setTitle(editTarget.title)
      setEmoji(editTarget.emoji)
      setDifficulty(editTarget.difficulty)
      setType(editTarget.type)
      if (editTarget.start_time) setStartTime(editTarget.start_time.slice(0, 5))
      if (editTarget.end_time) setEndTime(editTarget.end_time.slice(0, 5))
      setIsRecurring(editTarget.is_recurring)
      setVerifyDeadlineHours(editTarget.verify_deadline_hours ?? 2)
    }
  }, [editTarget])

  const handleSubmit = async () => {
    if (!user || !title.trim() || saving) return
    setSaving(true)
    try {
      if (editTarget) {
        const updates = {
          title: title.trim(),
          emoji,
          difficulty,
          type,
          start_time: type === 'timed' ? startTime : null,
          end_time: type === 'timed' ? endTime : null,
          verify_deadline_hours: verifyDeadlineHours,
        }
        if (editTarget.templateId) {
          // Edit template
          const { error } = await supabase
            .from('prohibition_templates')
            .update(updates)
            .eq('id', editTarget.templateId)
          if (error) throw error
        } else {
          // Edit one-off prohibition
          const { error } = await supabase
            .from('prohibitions')
            .update({ ...updates, is_recurring: isRecurring })
            .eq('id', editTarget.id)
          if (error) throw error
        }
        // Refresh to pick up changes
        await useProhibitionStore.getState().fetchToday(user.id)
      } else {
        await create(user.id, {
          title: title.trim(),
          emoji,
          difficulty,
          type,
          start_time: type === 'timed' ? startTime : undefined,
          end_time: type === 'timed' ? endTime : undefined,
          is_recurring: isRecurring,
          verify_deadline_hours: verifyDeadlineHours,
        })
      }
      navigate('/')
    } catch {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!editTarget) return
    if (!window.confirm('이 금기를 삭제할까요?')) return
    try {
      await deleteProhibition(editTarget)
    } catch (e) {
      console.error('삭제 실패:', e)
    }
    navigate('/')
  }

  return (
    <div className="p-5 pb-32">
      <div className="flex items-center justify-between mb-6">
        <button onClick={() => navigate(-1)} className="text-lg">← 뒤로</button>
        <h1 className="text-lg font-black font-serif text-primary">{editTarget ? '금기 수정' : '금기 추가'}</h1>
        <div className="w-10" />
      </div>

      {/* Title */}
      <label className="block mb-4">
        <span className="text-sm font-bold text-primary mb-1.5 block">오늘 하지 않을 일</span>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="예: 야식 먹지 않기"
          maxLength={30}
          className="w-full px-4 py-3 bg-white border-[1.5px] border-dashed border-gray-300 rounded-2xl text-sm text-primary placeholder-gray-300 outline-none focus:border-primary"
        />
      </label>

      {/* Emoji */}
      <div className="mb-4">
        <span className="text-sm font-bold text-primary mb-1.5 block">카테고리</span>
        <div className="flex flex-wrap gap-2">
          {EMOJI_OPTIONS.map(e => (
            <button
              key={e}
              onClick={() => setEmoji(e)}
              className={`w-10 h-10 rounded-full text-lg flex items-center justify-center border-[1.5px] ${
                emoji === e ? 'border-primary bg-cream-dark' : 'border-gray-200 bg-white'
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      {/* Difficulty */}
      <div className="mb-4">
        <span className="text-sm font-bold text-primary mb-1.5 block">난이도 Lv.{difficulty}</span>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map(lv => (
            <button
              key={lv}
              onClick={() => setDifficulty(lv)}
              className={`flex-1 py-2 rounded-full text-sm font-semibold ${
                difficulty === lv ? 'bg-primary text-white' : 'bg-white border-[1.5px] border-gray-200 text-gray-400'
              }`}
            >
              {lv}
            </button>
          ))}
        </div>
      </div>

      {/* Type */}
      <div className="mb-4">
        <span className="text-sm font-bold text-primary mb-1.5 block">타입</span>
        <div className="flex gap-2">
          <button
            onClick={() => setType('all_day')}
            className={`flex-1 py-2.5 rounded-full text-sm font-semibold ${
              type === 'all_day' ? 'bg-primary text-white' : 'bg-white border-[1.5px] border-gray-200 text-gray-400'
            }`}
          >
            하루종일
          </button>
          <button
            onClick={() => setType('timed')}
            className={`flex-1 py-2.5 rounded-full text-sm font-semibold ${
              type === 'timed' ? 'bg-primary text-white' : 'bg-white border-[1.5px] border-gray-200 text-gray-400'
            }`}
          >
            시간 지정
          </button>
        </div>
      </div>

      {/* Time Picker (timed only) */}
      {type === 'timed' && (
        <div className="flex gap-3 mb-4">
          <label className="flex-1">
            <span className="text-xs text-gray-400 block mb-1">시작</span>
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
              className="w-full px-3 py-2 bg-white border-[1.5px] border-gray-200 rounded-xl text-sm" />
          </label>
          <label className="flex-1">
            <span className="text-xs text-gray-400 block mb-1">종료</span>
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
              className="w-full px-3 py-2 bg-white border-[1.5px] border-gray-200 rounded-xl text-sm" />
          </label>
        </div>
      )}

      {/* Verify Deadline */}
      <div className="mb-4">
        <span className="text-sm font-bold text-primary mb-1.5 block">
          인증 마감 시간
          <span className="font-normal text-gray-400 ml-1">
            ({type === 'timed' ? '종료' : '자정'} 후 {verifyDeadlineHours}시간)
          </span>
        </span>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={12}
            value={verifyDeadlineHours}
            onChange={e => setVerifyDeadlineHours(Number(e.target.value))}
            className="flex-1 accent-primary"
          />
          <span className="text-sm font-semibold text-primary w-16 text-right">{verifyDeadlineHours}시간</span>
        </div>
        <div className="text-xs text-gray-400 mt-1">
          {verifyDeadlineHours === 0
            ? `${type === 'timed' ? '금기 종료 즉시' : '자정에'} 미인증 처리`
            : `${type === 'timed' ? '금기 종료' : '자정'} 후 ${verifyDeadlineHours}시간까지 인증 가능`
          }
        </div>
      </div>

      {/* Recurring */}
      {!editTarget && (
        <label className="flex items-center gap-3 mb-8 cursor-pointer">
          <div
            onClick={() => setIsRecurring(!isRecurring)}
            className={`w-6 h-6 rounded-lg border-[1.5px] flex items-center justify-center text-xs ${
              isRecurring ? 'bg-primary border-primary text-white' : 'border-gray-300 bg-white'
            }`}
          >
            {isRecurring && '✓'}
          </div>
          <span className="text-sm text-primary">매일 반복</span>
        </label>
      )}

      {editTarget && (
        <div className="flex items-center gap-3 mb-8">
          <span className="text-sm text-gray-400">
            {editTarget.is_recurring ? '매일 반복' : '일회성'}
          </span>
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!title.trim() || saving}
        className="w-full py-3.5 bg-primary text-white rounded-full font-bold text-sm disabled:opacity-40"
      >
        {saving ? '저장 중...' : editTarget ? '수정하기' : '금기 추가하기'}
      </button>

      {editTarget && (
        <button
          onClick={handleDelete}
          className="w-full mt-2 py-3.5 bg-white border-[1.5px] border-fail-border rounded-full text-accent font-semibold text-sm"
        >
          금기 삭제하기
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/pages/ProhibitionNewPage.tsx
git commit -m "feat: update ProhibitionNewPage for template/instance model"
```

---

## Task 8: Update FailedPage

**Files:**
- Modify: `src/pages/FailedPage.tsx:1-129`

FailedPage finds the prohibition by `id` from the store's `items` array. With the new model, the `id` on the list item might be a template id (if no instance was created yet). But by the time we reach FailedPage, `updateStatus` has already created the instance and updated the item's `id`. So the lookup should still work.

- [ ] **Step 1: Update FailedPage to use items**

Change line 12 from:
```typescript
const prohibition = prohibitions.find(p => p.id === id)
```
to:
```typescript
const { items, fetchHistory } = useProhibitionStore()
const item = items.find(p => p.id === id)
```

And update all references from `prohibition` to `item`, and from `prohibitions`/`fetchHistory` destructuring. The `fetchHistory` call should use `item.templateId ?? item.title` for the history key.

Full replacement of lines 1-129:

```typescript
// src/pages/FailedPage.tsx
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/auth-store'
import { useProhibitionStore } from '../stores/prohibition-store'
import { supabase } from '../lib/supabase'

export default function FailedPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const { items, fetchHistory } = useProhibitionStore()
  const item = items.find(p => p.id === id)

  const [content, setContent] = useState('')
  const [posting, setPosting] = useState(false)
  const [alreadyConfessed, setAlreadyConfessed] = useState(false)
  const [stats, setStats] = useState({ total: 0, succeeded: 0, failed: 0 })

  useEffect(() => {
    if (user && item) {
      const historyKey = item.templateId ?? item.title
      fetchHistory(user.id, historyKey).then(data => {
        setStats({
          total: data.length,
          succeeded: data.filter(p => p.status === 'succeeded').length,
          failed: data.filter(p => p.status === 'failed').length,
        })
      })
      supabase
        .from('confessions')
        .select('id')
        .eq('user_id', user.id)
        .eq('prohibition_id', item.id)
        .limit(1)
        .then(({ data }) => {
          if (data && data.length > 0) setAlreadyConfessed(true)
        })
    }
  }, [user, item, fetchHistory])

  if (!item) {
    return <div className="p-5 text-center text-gray-400">금기를 찾을 수 없어요</div>
  }

  const successRate = stats.total > 0 ? Math.round((stats.succeeded / stats.total) * 100) : 0

  const handleConfess = async () => {
    if (!user || !content.trim() || content.trim().length > 300 || posting) return
    setPosting(true)
    const { error } = await supabase.from('confessions').insert({
      user_id: user.id,
      prohibition_id: item.id,
      content: content.trim(),
      category: item.emoji,
    })
    if (!error) navigate('/')
    else setPosting(false)
  }

  return (
    <div className="p-5">
      <div className="flex items-center mb-5">
        <button onClick={() => navigate('/')} className="text-lg">← 뒤로</button>
      </div>

      {/* Fail Header */}
      <div className="text-center mb-6">
        <div className="w-[72px] h-[72px] rounded-full bg-cream-orange flex items-center justify-center text-4xl mx-auto mb-3">😵</div>
        <h1 className="text-xl font-black font-serif text-accent">{item.title}</h1>
        <div className="inline-block mt-2 px-3 py-1 bg-fail rounded-xl text-xs text-accent font-semibold">실패</div>
      </div>

      {/* Confession prompt */}
      {alreadyConfessed ? (
        <div className="p-5 bg-white rounded-2xl border-[1.5px] border-gray-200 mb-3 text-center">
          <div className="text-sm text-gray-400">이미 고백을 작성했어요 ✅</div>
        </div>
      ) : (
        <div className="p-5 bg-white rounded-2xl border-[1.5px] border-fail-border mb-3">
          <div className="text-sm font-bold text-primary mb-3">무슨 일이 있었나요? ✏️</div>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            maxLength={300}
            rows={3}
            placeholder="솔직하게 적어보세요. 익명이니까 괜찮아요!"
            className="w-full p-3.5 bg-gray-50 border-[1.5px] border-dashed border-gray-200 rounded-xl text-sm text-primary placeholder-gray-300 outline-none resize-none leading-relaxed"
          />
          <div className="flex items-center gap-2 mt-3">
            <div className="w-5 h-5 rounded-full bg-cream-orange flex items-center justify-center text-[10px]">
              {user?.anonymous_emoji}
            </div>
            <span className="text-xs text-gray-400">{user?.anonymous_name}로 익명 게시</span>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="p-4 bg-white rounded-2xl border-[1.5px] border-gray-100 mb-4">
        <div className="text-sm font-bold text-primary mb-2.5">이 금기 통계</div>
        <div className="flex justify-around text-center">
          <div><div className="text-xl font-black text-primary">{stats.total}</div><div className="text-[11px] text-gray-400">도전</div></div>
          <div className="w-px bg-gray-100" />
          <div><div className="text-xl font-black text-success-text">{stats.succeeded}</div><div className="text-[11px] text-gray-400">성공</div></div>
          <div className="w-px bg-gray-100" />
          <div><div className="text-xl font-black text-accent">{stats.failed}</div><div className="text-[11px] text-gray-400">실패</div></div>
          <div className="w-px bg-gray-100" />
          <div><div className="text-xl font-black text-primary">{successRate}%</div><div className="text-[11px] text-gray-400">성공률</div></div>
        </div>
      </div>

      {/* CTAs */}
      {!alreadyConfessed && (
        <button
          onClick={handleConfess}
          disabled={!content.trim() || posting}
          className="w-full py-3.5 bg-primary text-white rounded-full font-bold text-sm disabled:opacity-40 mb-2"
        >
          {posting ? '게시 중...' : '실패의 방에 고백하기 💬'}
        </button>
      )}
      <button
        onClick={() => navigate('/')}
        className="w-full py-3.5 bg-white border-[1.5px] border-gray-200 rounded-full text-gray-400 font-semibold text-sm"
      >
        {alreadyConfessed ? '돌아가기' : '조용히 넘어가기'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/pages/FailedPage.tsx
git commit -m "feat: update FailedPage for template/instance model"
```

---

## Task 9: Fix WeekHistory UTC Bug

**Files:**
- Modify: `src/components/WeekHistory.tsx:36-37`

`toISOString().split('T')[0]` uses UTC. Replace with `formatLocalDate`.

- [ ] **Step 1: Fix the date comparison**

Change:
```typescript
const dateStr = d.toISOString().split('T')[0]
const isToday = dateStr === today.toISOString().split('T')[0]
```

To:
```typescript
import { formatLocalDate } from '../lib/date-utils'
// ...
const dateStr = formatLocalDate(d)
const isToday = dateStr === formatLocalDate(today)
```

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/WeekHistory.tsx
git commit -m "fix: WeekHistory UTC date bug — use local date formatting"
```

---

## Task 10: Final Integration Test + Cleanup

**Files:**
- All modified files

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 2: Manual smoke test checklist**

Verify in the browser:
1. Home page shows active templates as "진행중"
2. Mark a recurring prohibition as "성공" → shows "성공! ✨", next day shows "진행중" again
3. Mark a recurring prohibition as "실패" → navigates to FailedPage, shows correctly
4. Create a new recurring prohibition → appears in list as "진행중"
5. Create a one-off prohibition → appears and works as before
6. Delete a recurring prohibition → disappears, doesn't come back tomorrow
7. Delete a one-off prohibition → disappears
8. Edit a recurring prohibition's title → reflected in list
9. Yesterday's unrecorded recurring shows as "진행중" until deadline passes

- [ ] **Step 3: Apply migration to Supabase**

Run: `supabase db push`

Verify in Supabase dashboard:
- `prohibition_templates` table exists with migrated data
- `prohibitions.template_id` column exists with backfilled values
- Cron job updated (no INSERT in the cron SQL)
- `delete_recurring_group` function dropped
- `set_recurring_group_id` trigger dropped

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: final cleanup after template/instance refactor"
```

---

## Complexity Comparison

| Metric | Before | After |
|--------|--------|-------|
| `fetchToday` lines | ~80 | ~30 |
| Row creation points | 3 (fetchToday, updateStatus, cron) | 1 (updateStatus only) |
| RPC functions needed | 2 (update_status, delete_group) | 1 (update_status) |
| Dedup/visibility logic | 15+ lines of Set-based filtering | 0 (one template = one item) |
| Cron job SQL | 45 lines (mark + copy) | 25 lines (mark only) |
| RLS workarounds | SECURITY DEFINER for group delete | None |
| Store field | `prohibitions: Prohibition[]` | `items: ProhibitionListItem[]` |
