# Fixlane Task System — Implementation Brief

**Scope:** v1 manual task system. Self-assigned tasks only. Location-attached. Forward-compatible schema for future automation.

---

## Architectural decisions (do not deviate)

1. Tasks always attach to a `location_id`. No account or contact attachment in v1.
2. One table: `tasks`. No templates, no subtasks, no comments.
3. **No `users` table in v1.** Tasks are owned by the creator's email, pulled from the NextAuth session.
4. **Self-assigned only.** Whoever creates a task owns it. No assignee field, no assignee picker.
5. Status enum includes `snoozed` even though no UI exposes it in v1 — cheaper than migrating later.
6. `source` is a text field, not enum. `manual` for v1; future automation populates with strings like `system:contract_signed_stale_7d`.
7. Authorization: any authenticated whitelisted user can view all tasks for a location. Only the creator can edit/delete their own task.
8. Hard deletes. No soft delete in v1.
9. Date-only for `due_date` (Postgres `date` type), not timestamp.
10. Manual task creation does not auto-resolve any future system tasks. Manual and system tasks are siblings.
11. Timezone: all date grouping is client-side, browser timezone.

---

## Step 1: Schema migration

Create migration file `supabase/migrations/[timestamp]_create_tasks.sql`:

```sql
-- Task status enum
create type task_status as enum ('open', 'done', 'snoozed');

-- Tasks table
create table tasks (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references locations(id) on delete cascade,
  title text not null check (length(title) between 1 and 200),
  description text,
  due_date date,
  status task_status not null default 'open',
  snoozed_until date,
  created_by_email text not null,
  program_context text check (program_context in ('vinfast', 'tesla', 'multidrive', 'general')),
  source text not null default 'manual',
  trigger_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,

  constraint resolved_at_consistency check (
    (status = 'done' and resolved_at is not null) or
    (status != 'done' and resolved_at is null)
  ),

  constraint snoozed_until_consistency check (
    (status = 'snoozed' and snoozed_until is not null) or
    (status != 'snoozed')
  )
);

-- Indexes for the queries we'll actually run
create index idx_tasks_created_by_email_status on tasks(created_by_email, status) where status != 'done';
create index idx_tasks_location_id on tasks(location_id);
create index idx_tasks_due_date on tasks(due_date) where status = 'open' and due_date is not null;

-- Auto-update updated_at
create or replace function update_tasks_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger tasks_updated_at
  before update on tasks
  for each row execute function update_tasks_updated_at();

-- Auto-set resolved_at when status becomes 'done'; clear it otherwise
create or replace function set_resolved_at()
returns trigger as $$
begin
  if new.status = 'done' and old.status != 'done' then
    new.resolved_at = now();
  elsif new.status != 'done' then
    new.resolved_at = null;
  end if;
  return new;
end;
$$ language plpgsql;

create trigger tasks_resolved_at
  before update on tasks
  for each row execute function set_resolved_at();
```

**Verification:** Run migration locally. Manually insert a row via SQL, set status to `done`, verify `resolved_at` populates. Set back to `open`, verify it nulls out.

---

## Step 2: TypeScript types

Create `lib/types/task.ts`:

```typescript
export type TaskStatus = 'open' | 'done' | 'snoozed';
export type ProgramContext = 'vinfast' | 'tesla' | 'multidrive' | 'general';

export interface Task {
  id: string;
  location_id: string;
  title: string;
  description: string | null;
  due_date: string | null; // ISO date string YYYY-MM-DD
  status: TaskStatus;
  snoozed_until: string | null;
  created_by_email: string;
  program_context: ProgramContext | null;
  source: string;
  trigger_reason: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

export interface TaskWithLocation extends Task {
  location: {
    id: string;
    name: string;
    chain_name: string | null;
  };
}

export interface CreateTaskInput {
  location_id: string;
  title: string;
  description?: string;
  due_date?: string | null;
  program_context?: ProgramContext;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  due_date?: string | null;
  status?: TaskStatus;
  snoozed_until?: string | null;
  program_context?: ProgramContext | null;
}
```

---

## Step 3: API routes

### `app/api/tasks/route.ts` — POST (create) and GET (list)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';
import type { CreateTaskInput } from '@/lib/types/task';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await req.json()) as CreateTaskInput;

  // Validation
  if (!body.location_id || !body.title?.trim()) {
    return NextResponse.json(
      { error: 'location_id and title are required' },
      { status: 400 }
    );
  }
  if (body.title.length > 200) {
    return NextResponse.json(
      { error: 'Title must be 200 characters or fewer' },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  // Verify location exists (FK would catch it, but better error message here)
  const { data: location } = await supabase
    .from('locations')
    .select('id')
    .eq('id', body.location_id)
    .single();
  if (!location) {
    return NextResponse.json({ error: 'Location not found' }, { status: 404 });
  }

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      location_id: body.location_id,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      due_date: body.due_date || null,
      created_by_email: session.user.email,
      program_context: body.program_context || null,
      source: 'manual',
    })
    .select()
    .single();

  if (error) {
    console.error('Task creation failed:', error);
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const locationId = searchParams.get('location_id');
  const status = searchParams.get('status');
  const dueBefore = searchParams.get('due_before');
  const programContext = searchParams.get('program_context');

  const supabase = createServerClient();

  let query = supabase
    .from('tasks')
    .select(`
      *,
      location:locations(id, name, chain_name)
    `)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });

  // Scope: if location_id is provided, return all tasks for that location
  // (any user looking at a shop sees all tasks for that shop).
  // Otherwise, scope to the current user's own tasks (the home/dashboard query).
  if (locationId) {
    query = query.eq('location_id', locationId);
  } else {
    query = query.eq('created_by_email', session.user.email);
  }

  if (status) query = query.eq('status', status);
  if (dueBefore) query = query.lte('due_date', dueBefore);
  if (programContext) query = query.eq('program_context', programContext);

  const { data, error } = await query;

  if (error) {
    console.error('Task list failed:', error);
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 });
  }

  return NextResponse.json(data);
}
```

### `app/api/tasks/[id]/route.ts` — PATCH (update) and DELETE

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';
import type { UpdateTaskInput } from '@/lib/types/task';

async function loadTaskAndCheckAccess(taskId: string, userEmail: string) {
  const supabase = createServerClient();
  const { data: task, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .single();
  if (error || !task) return { error: 'Task not found', status: 404 as const };
  if (task.created_by_email !== userEmail) {
    return { error: 'Forbidden', status: 403 as const };
  }
  return { task };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const access = await loadTaskAndCheckAccess(params.id, session.user.email);
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const body = (await req.json()) as UpdateTaskInput;

  if (body.title !== undefined) {
    if (!body.title.trim() || body.title.length > 200) {
      return NextResponse.json(
        { error: 'Title must be 1-200 characters' },
        { status: 400 }
      );
    }
  }
  if (body.status === 'snoozed' && !body.snoozed_until) {
    return NextResponse.json(
      { error: 'snoozed_until required when status is snoozed' },
      { status: 400 }
    );
  }

  const updatePayload: Record<string, unknown> = {};
  if (body.title !== undefined) updatePayload.title = body.title.trim();
  if (body.description !== undefined) {
    updatePayload.description = body.description?.trim() || null;
  }
  if (body.due_date !== undefined) updatePayload.due_date = body.due_date;
  if (body.status !== undefined) updatePayload.status = body.status;
  if (body.snoozed_until !== undefined) updatePayload.snoozed_until = body.snoozed_until;
  if (body.program_context !== undefined) {
    updatePayload.program_context = body.program_context;
  }

  // Clear snoozed_until if status is changing away from snoozed
  if (body.status && body.status !== 'snoozed') {
    updatePayload.snoozed_until = null;
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('tasks')
    .update(updatePayload)
    .eq('id', params.id)
    .select()
    .single();

  if (error) {
    console.error('Task update failed:', error);
    return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const access = await loadTaskAndCheckAccess(params.id, session.user.email);
  if ('error' in access) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const supabase = createServerClient();
  const { error } = await supabase.from('tasks').delete().eq('id', params.id);

  if (error) {
    console.error('Task delete failed:', error);
    return NextResponse.json({ error: 'Failed to delete task' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
```

**Verification:** Before any UI work, test all endpoints with curl or Postman:

1. POST with valid payload → 201 + task object with `created_by_email` set
2. POST missing required field (no `location_id` or no `title`) → 400
3. GET with no params → returns only the current user's tasks
4. GET with `?location_id=<id>` → returns all tasks for that location regardless of creator
5. PATCH with `{status: 'done'}` → updated task with `resolved_at` set
6. PATCH on a task created by a different user → 403
7. DELETE on own task → 200, then GET it → not in list
8. DELETE on another user's task → 403

Do not proceed to UI until all eight pass.

---

## Step 4: Shared task UI primitives

### `components/tasks/TaskFormModal.tsx`

A modal with these fields, stacked vertically:

- **Title** — required, 200 char limit, character count visible past 150
- **Shop** — required. Pre-filled and shown with a muted background (locked but visible) when launched from a location page. When launched from the home page, becomes a searchable combobox.
- **Due date** — row of chips: Today / Tomorrow / Next week / Custom / No date. Selecting Custom reveals a date input below the chips. Default selection: No date.
- **Program** — dropdown: General / VinFast / Tesla / Multidrive. Default: General. When the task is being created from a location page, smart-default to that location's primary program if available (read from `locations.program_enrollments`).
- **Description** — textarea, hidden behind a `+ Add description` link by default. Most tasks are one-liners; the textarea is visual noise otherwise.

No assignee field. The current user owns every task they create.

Props:

```typescript
interface TaskFormModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (task: Task) => void;
  defaultLocationId?: string; // when launched from location page
  taskToEdit?: Task; // when editing existing
}
```

Behavior:

- When `taskToEdit` is provided, the modal becomes an edit form: pre-fills all fields, uses PATCH instead of POST, header reads "Edit task", primary button label becomes "Save changes".
- Submit calls the appropriate API route. On success, calls `onSuccess(task)` and closes. On error, displays error inline above the submit button.
- Edit mode is only available to the task's creator. The TaskRow component decides whether to show the edit affordance (see below).

### `components/tasks/TaskRow.tsx`

A single-row component used in both the location Tasks tab and the home page queue. Shows:

- Checkbox on the left (clicking toggles status between `open` and `done`; PATCH call)
- Title (strikethrough + muted color when done)
- Subtitle: shop name + program (only on home page variant); just program (on location page variant)
- Inline description block when present (subtle background, smaller text)
- Due date pill (color-coded: red for overdue, amber for today, neutral otherwise; "No due date" in muted text when null)
- Hover: shows edit icon (opens TaskFormModal in edit mode) and delete icon (with confirm). Both only visible if the current user is the task's creator.

No avatars in v1. Self-assignment makes them redundant noise.

Props:

```typescript
interface TaskRowProps {
  task: TaskWithLocation;
  showLocation?: boolean; // true on home page, false on location page
  currentUserEmail: string; // for edit/delete affordance
  onUpdate: (task: Task) => void;
  onDelete: (id: string) => void;
}
```

Optimistic updates on checkbox toggle — flip the UI state immediately, revert on error.

---

## Step 5: Tasks tab on location detail page

File: `app/locations/[id]/tasks/page.tsx` (or wherever the location tabs live).

Slots into the existing tab nav after Activity.

Layout:

```
[+ New task] button (top right)

Open (N)
  <TaskRow showLocation={false} />
  <TaskRow showLocation={false} />
  ...

Done — last 30 days (collapsed by default)
  <TaskRow showLocation={false} />
  ...
```

The "+ New task" button appears in two places — the action bar between the status row and the tab nav (alongside Send intro email / Send contract / Send portal link), and the Open section header. Redundant intentionally; both are natural spots to look.

Data fetch: `GET /api/tasks?location_id=<id>` on mount. Returns all tasks for that location, all creators. Group client-side by status. Sort open by `due_date` asc nulls last, then `created_at` asc. Sort done by `resolved_at` desc; filter to last 30 days client-side.

Empty state: "No tasks for this shop yet. Create one to track follow-ups." Plus a "+ New task" button.

---

## Step 6: Home page rework

File: existing home page route (whatever currently renders the contract status snapshot).

The current home is a contract status snapshot. Rework it into a task-driven follow-up queue with the contract status sections preserved as secondary cards below.

Layout:

```
Header: "Home" + subtitle "Your follow-ups for today, [date]"
[+ New task]   [View pipeline]

Overdue (N)            <- red header
  <TaskRow showLocation={true} />
  ...

Today (N)              <- amber header
  ...

This week (N)          <- neutral header
  ...

No due date (collapsed by default)
  ...

---

Contract status (h2)

[Awaiting signature card]   [Recently signed card]
```

No filter row. Self-assignment means there's only one filter ("my open tasks") and the section headers carry all the meaning.

Data fetch: `GET /api/tasks?status=open` on mount. Returns only the current user's open tasks (server-side scoping via session email).

Grouping logic (client-side, in user's local timezone):

- Overdue: `due_date < today`
- Today: `due_date = today`
- This week: `due_date > today` AND `due_date <= end_of_week` (week ends Sunday)
- No due date: `due_date IS NULL`
- Anything further future: omit from queue, surface only on the location page

When "+ New task" is clicked from the home page, modal opens with no pre-filled location → user must pick. When clicked from a location page, location is pre-filled and locked.

Empty state per section: hide the section if 0. If all sections empty: green check icon + "All caught up — nothing in the queue." Plus "+ New task" and "View pipeline" buttons.

The "Contract status" section preserves the existing Awaiting Signature / Recently Signed grouping but condensed into two side-by-side cards instead of taking the whole page.

---

## Step 7: Wire-up checklist

- [ ] Add Tasks tab to location detail page tab nav, after Activity
- [ ] Add the "+ New task" button to the location-page action bar (alongside Send intro email / Send contract / Send portal link)
- [ ] Confirm NextAuth session includes `user.email` (required by every API route)
- [ ] Per-page state for the new task modal is fine; no global modal context needed for v1

---

## Out of scope (do not build)

- `users` table
- Assigning tasks to other people / assignee picker / avatars
- Filter pills on the home page (My tasks / Assigned by me / All open)
- Task templates
- Recurring tasks
- Email/Slack notifications
- @mentions, comments, subtasks
- Snooze UI (schema supports it; no UI in v1)
- Bulk actions
- Role-gated assignment
- Account-level or contact-level tasks
- Activity log integration (manual tasks don't write to `comms_log` in v1; revisit when noise/signal is clearer)

---

## Definition of done

1. Migration runs cleanly on a fresh Supabase instance.
2. All eight API verification cases pass.
3. A user can create, edit, complete, and delete a task from the location page Tasks tab.
4. A user can create a task from the home page with a shop picker.
5. A user editing a task they did not create receives a 403; the edit/delete affordance does not appear in the UI for those tasks.
6. The home page queue correctly groups tasks by overdue/today/this week/no-date in the user's local timezone.
7. The home page only shows the current user's tasks; the location Tasks tab shows all tasks for that location regardless of creator.
8. Marking a task done sets `resolved_at` and applies strikethrough; un-marking it clears `resolved_at`.
9. The "+ New task" button is reachable from both the location page action bar and the Open section header on the Tasks tab.

---

## Notes on forward compatibility

When the `users` table and assignment-to-others are added later:

1. Add `users` table.
2. Backfill: for each distinct `created_by_email` in `tasks`, upsert a row in `users`.
3. Add `created_by uuid references users(id)` to `tasks`. Populate via email lookup. Drop `created_by_email`.
4. Add `assigned_to uuid references users(id) not null default created_by` to `tasks`.
5. Update the API routes to accept and filter on `assigned_to`.
6. Add the assignee picker back to the modal and the filter pills back to the home page.

The v1 schema does not block any of this. No data loss, straightforward migration.