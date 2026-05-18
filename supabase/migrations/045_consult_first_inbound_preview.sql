-- First inbound message preview per case (queue Question column).

create or replace function public.consult_first_inbound_preview_for_cases(p_ids uuid[])
returns table (case_id uuid, body_preview text)
language sql
stable
as $$
  select distinct on (m.case_id)
    m.case_id,
    left(trim(regexp_replace(coalesce(m.body, ''), E'[\\n\\r]+', ' ', 'g')), 500) as body_preview
  from public.consult_messages m
  where m.case_id = any(p_ids)
    and m.direction = 'inbound'
    and coalesce(trim(m.body), '') <> ''
  order by m.case_id, m.created_at asc;
$$;
