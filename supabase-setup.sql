-- Run this in Supabase SQL Editor

-- Drop old table if exists
drop table if exists ft_data;

-- Per-user data table (uses Supabase Auth user IDs)
create table if not exists ft_data (
  id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}',
  updated_at timestamptz default now()
);

-- Row Level Security — users can only access their own data
alter table ft_data enable row level security;

create policy "Users can read own data"   on ft_data for select using (auth.uid() = id);
create policy "Users can insert own data" on ft_data for insert with check (auth.uid() = id);
create policy "Users can update own data" on ft_data for update using (auth.uid() = id);
create policy "Users can delete own data" on ft_data for delete using (auth.uid() = id);
