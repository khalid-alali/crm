-- Shop-facing onboarding portal: attribution for checklist items completed by the
-- shop (vs. internal admin or system/auto-resolve).
--
-- Today `completed_by_user_id` holds an internal NextAuth email. Shop completions
-- come through a magic-link portal with no per-person account, so we record the
-- SOURCE and an optional free-text NAME the shop types ("completed by Jose"),
-- rather than overloading the email column. See onboarding PLAN.md (E-D / multi-user).

alter table program_enrollment_checklist
  add column if not exists completed_by_source text
    check (completed_by_source in ('admin', 'portal', 'system')),
  add column if not exists completed_by_name text;

comment on column program_enrollment_checklist.completed_by_source is
  'Who marked this item done: admin (internal CRM user), portal (shop via magic link), system (auto-resolved by event).';
comment on column program_enrollment_checklist.completed_by_name is
  'Optional free-text name captured for portal completions (shared-link model, no per-person account).';
