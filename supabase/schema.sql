create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  first_name text,
  last_name text,
  city text,
  bio text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Users can read all profiles" on public.profiles;
create policy "Users can read all profiles"
on public.profiles
for select
to authenticated
using (true);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "Public can read avatars" on storage.objects;
create policy "Public can read avatars"
on storage.objects
for select
to public
using (bucket_id = 'avatars');

drop policy if exists "Users can upload own avatars" on storage.objects;
create policy "Users can upload own avatars"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "Users can update own avatars" on storage.objects;
create policy "Users can update own avatars"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and split_part(name, '/', 1) = auth.uid()::text
)
with check (
  bucket_id = 'avatars'
  and split_part(name, '/', 1) = auth.uid()::text
);

create table if not exists public.shindigs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shindig_stops (
  id uuid primary key default gen_random_uuid(),
  shindig_id uuid not null references public.shindigs (id) on delete cascade,
  stop_order integer not null,
  title text not null,
  place_type text,
  address text not null,
  latitude double precision not null,
  longitude double precision not null,
  transit_minutes integer not null default 0,
  transit_miles double precision not null default 0,
  scheduled_time text,
  created_at timestamptz not null default now()
);

create table if not exists public.shindig_photos (
  id uuid primary key default gen_random_uuid(),
  shindig_id uuid not null references public.shindigs (id) on delete cascade,
  stop_id uuid not null references public.shindig_stops (id) on delete cascade,
  photo_url text not null,
  created_at timestamptz not null default now()
);

alter table public.shindigs enable row level security;
alter table public.shindig_stops enable row level security;
alter table public.shindig_photos enable row level security;

drop policy if exists "Users can read own shindigs" on public.shindigs;
create policy "Users can read own shindigs"
on public.shindigs
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own shindigs" on public.shindigs;
create policy "Users can insert own shindigs"
on public.shindigs
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own shindigs" on public.shindigs;
create policy "Users can update own shindigs"
on public.shindigs
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can read own shindig stops" on public.shindig_stops;
create policy "Users can read own shindig stops"
on public.shindig_stops
for select
to authenticated
using (
  exists (
    select 1 from public.shindigs
    where public.shindigs.id = shindig_stops.shindig_id
      and public.shindigs.user_id = auth.uid()
  )
);

drop policy if exists "Users can insert own shindig stops" on public.shindig_stops;
create policy "Users can insert own shindig stops"
on public.shindig_stops
for insert
to authenticated
with check (
  exists (
    select 1 from public.shindigs
    where public.shindigs.id = shindig_stops.shindig_id
      and public.shindigs.user_id = auth.uid()
  )
);

drop policy if exists "Users can update own shindig stops" on public.shindig_stops;
create policy "Users can update own shindig stops"
on public.shindig_stops
for update
to authenticated
using (
  exists (
    select 1 from public.shindigs
    where public.shindigs.id = shindig_stops.shindig_id
      and public.shindigs.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.shindigs
    where public.shindigs.id = shindig_stops.shindig_id
      and public.shindigs.user_id = auth.uid()
  )
);

drop policy if exists "Users can read own shindig photos" on public.shindig_photos;
create policy "Users can read own shindig photos"
on public.shindig_photos
for select
to authenticated
using (
  exists (
    select 1 from public.shindigs
    where public.shindigs.id = shindig_photos.shindig_id
      and public.shindigs.user_id = auth.uid()
  )
);

drop policy if exists "Users can insert own shindig photos" on public.shindig_photos;
create policy "Users can insert own shindig photos"
on public.shindig_photos
for insert
to authenticated
with check (
  exists (
    select 1 from public.shindigs
    where public.shindigs.id = shindig_photos.shindig_id
      and public.shindigs.user_id = auth.uid()
  )
);

insert into storage.buckets (id, name, public)
values ('shindig-photos', 'shindig-photos', true)
on conflict (id) do nothing;

drop policy if exists "Users can read shindig photos" on storage.objects;
create policy "Users can read shindig photos"
on storage.objects
for select
to authenticated
using (bucket_id = 'shindig-photos');

drop policy if exists "Users can upload own shindig photos" on storage.objects;
create policy "Users can upload own shindig photos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'shindig-photos'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "Users can update own shindig photos" on storage.objects;
create policy "Users can update own shindig photos"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'shindig-photos'
  and split_part(name, '/', 1) = auth.uid()::text
)
with check (
  bucket_id = 'shindig-photos'
  and split_part(name, '/', 1) = auth.uid()::text
);
