-- One-time VinFast enrollment cleanup:
-- Unenroll active VinFast enrollments that have no completed checklist items.

with to_unenroll as (
  select lpe.id
  from public.location_program_enrollments lpe
  where lpe.program_id = 'vinfast'
    and lpe.unenrolled_at is null
    and not exists (
      select 1
      from public.program_enrollment_checklist pec
      where pec.enrollment_id = lpe.id
        and pec.completed_at is not null
    )
)
update public.location_program_enrollments lpe
set
  unenrolled_at = now(),
  unenrolled_by_user_id = 'system_migration_032',
  unenroll_reason = 'One-time cleanup: no completed VinFast checklist items',
  last_touched_at = now()
where lpe.id in (select id from to_unenroll);
