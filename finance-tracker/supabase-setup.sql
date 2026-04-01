-- Run this in Supabase SQL Editor

create table if not exists ft_data (
  id text primary key,
  user_id text not null,
  data jsonb not null,
  updated_at timestamptz default now()
);

-- No auth needed, anonymous users identified by UUID stored in localStorage
alter table ft_data enable row level security;

create policy "Allow all" on ft_data for all using (true) with check (true);
