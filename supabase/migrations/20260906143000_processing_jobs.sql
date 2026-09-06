alter table public.automations
  add column if not exists channel_id text,
  add column if not exists last_video_id text,
  add column if not exists last_video_title text,
  add column if not exists last_checked_at timestamptz;

create table if not exists public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_video_id text not null,
  source_video_url text not null,
  source_video_title text,
  requested_cuts integer not null check (requested_cuts in (3, 5, 10)),
  clip_duration integer not null check (clip_duration in (15, 30, 45, 60)),
  captions_enabled boolean not null default true,
  status text not null default 'queued' check (status in ('queued', 'authorizing', 'transcribing', 'analyzing', 'rendering', 'ready', 'failed')),
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, source_video_id)
);

create index if not exists automations_user_id_idx on public.automations (user_id);
create index if not exists automation_history_automation_id_idx on public.automation_history (automation_id);
create index if not exists automation_history_user_id_idx on public.automation_history (user_id);
create index if not exists processing_jobs_automation_id_idx on public.processing_jobs (automation_id);
create index if not exists processing_jobs_user_created_idx on public.processing_jobs (user_id, created_at desc);
create index if not exists processing_jobs_status_idx on public.processing_jobs (status, created_at);

alter table public.processing_jobs enable row level security;
grant select, insert, update, delete on public.processing_jobs to authenticated;

drop policy if exists "Users manage own processing jobs" on public.processing_jobs;
create policy "Users manage own processing jobs"
on public.processing_jobs for all to authenticated
using ((select auth.uid()) = user_id)
with check (
  (select auth.uid()) = user_id
  and exists (
    select 1 from public.automations a
    where a.id = processing_jobs.automation_id
      and a.user_id = (select auth.uid())
  )
);
