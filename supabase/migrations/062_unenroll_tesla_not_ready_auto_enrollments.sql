-- Tesla pipeline no longer auto-enrolls contracted shops. Remove legacy rows that were
-- created in the old "Not ready" bucket (auto-enroll, never explicitly enrolled, no progress).

update public.location_program_enrollments e
set
  unenrolled_at = now(),
  unenroll_reason = 'Removed legacy Tesla Not ready auto-enrollment',
  last_touched_at = now()
where e.program_id = 'tesla'
  and e.unenrolled_at is null
  and e.enrolled_by_user_id is null
  and e.stage = 'not_ready'
  and e.first_job_completed_at is null
  and not exists (
    select 1
    from public.program_enrollment_checklist c
    where c.enrollment_id = e.id
      and c.completed_at is not null
  );
