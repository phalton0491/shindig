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

create or replace function public.resolve_login_email(login_input text)
returns text
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized_login text := lower(trim(login_input));
  resolved_email text;
begin
  if position('@' in normalized_login) > 0 then
    return normalized_login;
  end if;

  select lower(trim(auth.users.email))
  into resolved_email
  from public.profiles
  join auth.users on auth.users.id = public.profiles.id
  where lower(public.profiles.username) = normalized_login
  limit 1;

  return coalesce(resolved_email, normalized_login);
end;
$$;

revoke all on function public.resolve_login_email(text) from public;
grant execute on function public.resolve_login_email(text) to anon, authenticated;

create table if not exists public.friendships (
  user_id uuid not null references auth.users (id) on delete cascade,
  friend_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  constraint friendships_not_self check (user_id <> friend_id)
);

alter table public.friendships
add column if not exists requester_id uuid references auth.users (id) on delete cascade;

alter table public.friendships
add column if not exists status text not null default 'confirmed';

alter table public.friendships enable row level security;

drop policy if exists "Users can read own friendships" on public.friendships;
create policy "Users can read own friendships"
on public.friendships
for select
to authenticated
using (
  status = 'confirmed'
  or auth.uid() = user_id
  or auth.uid() = friend_id
);

drop policy if exists "Users can insert own friendships" on public.friendships;
create policy "Users can insert own friendships"
on public.friendships
for insert
to authenticated
with check (auth.uid() = user_id or auth.uid() = friend_id);

drop policy if exists "Users can update own friendships" on public.friendships;
create policy "Users can update own friendships"
on public.friendships
for update
to authenticated
using (auth.uid() = user_id or auth.uid() = friend_id)
with check (auth.uid() = user_id or auth.uid() = friend_id);

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

alter table public.shindigs
add column if not exists state text not null default 'active';

alter table public.shindigs
add column if not exists cover_photo_url text;

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

alter table public.shindig_photos
add column if not exists contributor_user_id uuid references auth.users (id) on delete set null;

create table if not exists public.shindig_likes (
  shindig_id uuid not null references public.shindigs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (shindig_id, user_id)
);

create table if not exists public.shindig_comments (
  id uuid primary key default gen_random_uuid(),
  shindig_id uuid not null references public.shindigs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.shindig_photo_likes (
  photo_id uuid not null references public.shindig_photos (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (photo_id, user_id)
);

create table if not exists public.shindig_photo_comments (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.shindig_photos (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.shindig_photo_requests (
  id uuid primary key default gen_random_uuid(),
  shindig_id uuid not null references public.shindigs (id) on delete cascade,
  stop_id uuid not null references public.shindig_stops (id) on delete cascade,
  requester_user_id uuid not null references auth.users (id) on delete cascade,
  recipient_user_id uuid not null references auth.users (id) on delete cascade,
  photo_url text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.shindig_invites (
  id uuid primary key default gen_random_uuid(),
  shindig_id uuid not null references public.shindigs (id) on delete cascade,
  inviter_user_id uuid not null references auth.users (id) on delete cascade,
  invitee_user_id uuid references auth.users (id) on delete cascade,
  phone_number text,
  invite_token text unique,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users (id) on delete cascade,
  actor_user_id uuid not null references auth.users (id) on delete cascade,
  shindig_id uuid references public.shindigs (id) on delete cascade,
  photo_id uuid references public.shindig_photos (id) on delete cascade,
  type text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.user_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  expo_push_token text not null,
  platform text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create unique index if not exists user_push_tokens_user_token_idx
on public.user_push_tokens (user_id, expo_push_token);

alter table public.notifications
add column if not exists request_id uuid references public.shindig_photo_requests (id) on delete cascade;

alter table public.notifications
add column if not exists invite_id uuid references public.shindig_invites (id) on delete cascade;

create or replace function public.claim_shindig_invite(invite_token_input text)
returns public.shindig_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  matched_invite public.shindig_invites%rowtype;
  claimed_invite public.shindig_invites%rowtype;
begin
  select *
  into matched_invite
  from public.shindig_invites
  where invite_token = invite_token_input
  limit 1;

  if matched_invite.id is null then
    raise exception 'That invite link is no longer valid.';
  end if;

  if matched_invite.invitee_user_id is null then
    update public.shindig_invites
    set invitee_user_id = auth.uid()
    where id = matched_invite.id
    returning * into claimed_invite;
  elsif matched_invite.invitee_user_id = auth.uid() then
    claimed_invite := matched_invite;
  else
    select *
    into claimed_invite
    from public.shindig_invites
    where shindig_id = matched_invite.shindig_id
      and inviter_user_id = matched_invite.inviter_user_id
      and invitee_user_id = auth.uid()
    limit 1;

    if claimed_invite.id is null then
      insert into public.shindig_invites (
        shindig_id,
        inviter_user_id,
        invitee_user_id,
        status
      )
      values (
        matched_invite.shindig_id,
        matched_invite.inviter_user_id,
        auth.uid(),
        'pending'
      )
      returning * into claimed_invite;
    end if;
  end if;

  if not exists (
    select 1
    from public.notifications
    where invite_id = claimed_invite.id
      and recipient_user_id = auth.uid()
      and type = 'shindig_invite'
  ) then
    insert into public.notifications (
      recipient_user_id,
      actor_user_id,
      shindig_id,
      type,
      message,
      invite_id
    )
    values (
      auth.uid(),
      claimed_invite.inviter_user_id,
      claimed_invite.shindig_id,
      'shindig_invite',
      'You were added to a ShinDig.',
      claimed_invite.id
    );
  end if;

  return claimed_invite;
end;
$$;

alter table public.shindigs enable row level security;
alter table public.shindig_stops enable row level security;
alter table public.shindig_photos enable row level security;
alter table public.shindig_likes enable row level security;
alter table public.shindig_comments enable row level security;
alter table public.shindig_photo_likes enable row level security;
alter table public.shindig_photo_comments enable row level security;
alter table public.shindig_photo_requests enable row level security;
alter table public.shindig_invites enable row level security;
alter table public.notifications enable row level security;
alter table public.user_push_tokens enable row level security;

drop policy if exists "Users can read own shindigs" on public.shindigs;
create policy "Users can read own shindigs"
on public.shindigs
for select
to authenticated
using (
  auth.uid() = user_id
  or exists (
    select 1 from public.friendships
    where (
      friendships.user_id = auth.uid()
      and friendships.friend_id = shindigs.user_id
    ) or (
      friendships.friend_id = auth.uid()
      and friendships.user_id = shindigs.user_id
    )
  )
  or exists (
    select 1 from public.shindig_invites
    where public.shindig_invites.shindig_id = shindigs.id
      and public.shindig_invites.invitee_user_id = auth.uid()
      and public.shindig_invites.status = 'accepted'
  )
);

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

drop policy if exists "Users can delete own shindigs" on public.shindigs;
create policy "Users can delete own shindigs"
on public.shindigs
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can read own shindig stops" on public.shindig_stops;
create policy "Users can read own shindig stops"
on public.shindig_stops
for select
to authenticated
using (
  exists (
    select 1 from public.shindigs
    where public.shindigs.id = shindig_stops.shindig_id
      and (
        public.shindigs.user_id = auth.uid()
        or exists (
          select 1 from public.friendships
          where (
            friendships.user_id = auth.uid()
            and friendships.friend_id = public.shindigs.user_id
          ) or (
            friendships.friend_id = auth.uid()
            and friendships.user_id = public.shindigs.user_id
          )
        )
        or exists (
          select 1 from public.shindig_invites
          where public.shindig_invites.shindig_id = public.shindigs.id
            and public.shindig_invites.invitee_user_id = auth.uid()
            and public.shindig_invites.status = 'accepted'
        )
      )
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
      and (
        public.shindigs.user_id = auth.uid()
        or exists (
          select 1 from public.friendships
          where (
            friendships.user_id = auth.uid()
            and friendships.friend_id = public.shindigs.user_id
          ) or (
            friendships.friend_id = auth.uid()
            and friendships.user_id = public.shindigs.user_id
          )
        )
        or exists (
          select 1 from public.shindig_invites
          where public.shindig_invites.shindig_id = public.shindigs.id
            and public.shindig_invites.invitee_user_id = auth.uid()
            and public.shindig_invites.status = 'accepted'
        )
      )
  )
);

drop policy if exists "Users can insert own shindig photos" on public.shindig_photos;
create policy "Users can insert own shindig photos"
on public.shindig_photos
for insert
to authenticated
with check (
  exists (
    select 1
    from public.shindigs
    where public.shindigs.id = shindig_photos.shindig_id
      and (
        public.shindigs.user_id = auth.uid()
        or exists (
          select 1 from public.friendships
          where (
            friendships.user_id = auth.uid()
            and friendships.friend_id = public.shindigs.user_id
          ) or (
            friendships.friend_id = auth.uid()
            and friendships.user_id = public.shindigs.user_id
          )
        )
        or exists (
          select 1 from public.shindig_invites
          where public.shindig_invites.shindig_id = public.shindigs.id
            and public.shindig_invites.invitee_user_id = auth.uid()
            and public.shindig_invites.status = 'accepted'
        )
      )
  )
);

drop policy if exists "Users can delete created shindig photos" on public.shindig_photos;
create policy "Users can delete created shindig photos"
on public.shindig_photos
for delete
to authenticated
using (
  contributor_user_id = auth.uid()
  or (
    contributor_user_id is null
    and exists (
      select 1 from public.shindigs
      where public.shindigs.id = shindig_photos.shindig_id
        and public.shindigs.user_id = auth.uid()
    )
  )
);

drop policy if exists "Users can read visible shindig likes" on public.shindig_likes;
create policy "Users can read visible shindig likes"
on public.shindig_likes
for select
to authenticated
using (
  exists (
    select 1 from public.shindigs
    where public.shindigs.id = shindig_likes.shindig_id
      and (
        public.shindigs.user_id = auth.uid()
        or exists (
          select 1 from public.friendships
          where (
            friendships.user_id = auth.uid()
            and friendships.friend_id = public.shindigs.user_id
          ) or (
            friendships.friend_id = auth.uid()
            and friendships.user_id = public.shindigs.user_id
          )
        )
        or exists (
          select 1 from public.shindig_invites
          where public.shindig_invites.shindig_id = public.shindigs.id
            and public.shindig_invites.invitee_user_id = auth.uid()
            and public.shindig_invites.status = 'accepted'
        )
      )
  )
);

drop policy if exists "Users can insert visible shindig likes" on public.shindig_likes;
create policy "Users can insert visible shindig likes"
on public.shindig_likes
for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.shindigs
    where public.shindigs.id = shindig_likes.shindig_id
      and (
        public.shindigs.user_id = auth.uid()
        or exists (
          select 1 from public.friendships
          where (
            friendships.user_id = auth.uid()
            and friendships.friend_id = public.shindigs.user_id
          ) or (
            friendships.friend_id = auth.uid()
            and friendships.user_id = public.shindigs.user_id
          )
        )
        or exists (
          select 1 from public.shindig_invites
          where public.shindig_invites.shindig_id = public.shindigs.id
            and public.shindig_invites.invitee_user_id = auth.uid()
            and public.shindig_invites.status = 'accepted'
        )
      )
  )
);

drop policy if exists "Users can delete own shindig likes" on public.shindig_likes;
create policy "Users can delete own shindig likes"
on public.shindig_likes
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can read visible shindig comments" on public.shindig_comments;
create policy "Users can read visible shindig comments"
on public.shindig_comments
for select
to authenticated
using (
  exists (
    select 1 from public.shindigs
    where public.shindigs.id = shindig_comments.shindig_id
      and (
        public.shindigs.user_id = auth.uid()
        or exists (
          select 1 from public.friendships
          where (
            friendships.user_id = auth.uid()
            and friendships.friend_id = public.shindigs.user_id
          ) or (
            friendships.friend_id = auth.uid()
            and friendships.user_id = public.shindigs.user_id
          )
        )
        or exists (
          select 1 from public.shindig_invites
          where public.shindig_invites.shindig_id = public.shindigs.id
            and public.shindig_invites.invitee_user_id = auth.uid()
            and public.shindig_invites.status = 'accepted'
        )
      )
  )
);

drop policy if exists "Users can insert visible shindig comments" on public.shindig_comments;
create policy "Users can insert visible shindig comments"
on public.shindig_comments
for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1 from public.shindigs
    where public.shindigs.id = shindig_comments.shindig_id
      and (
        public.shindigs.user_id = auth.uid()
        or exists (
          select 1 from public.friendships
          where (
            friendships.user_id = auth.uid()
            and friendships.friend_id = public.shindigs.user_id
          ) or (
            friendships.friend_id = auth.uid()
            and friendships.user_id = public.shindigs.user_id
          )
        )
        or exists (
          select 1 from public.shindig_invites
          where public.shindig_invites.shindig_id = public.shindigs.id
            and public.shindig_invites.invitee_user_id = auth.uid()
            and public.shindig_invites.status = 'accepted'
        )
      )
  )
);

drop policy if exists "Users can delete own shindig comments" on public.shindig_comments;
create policy "Users can delete own shindig comments"
on public.shindig_comments
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can read visible shindig photo likes" on public.shindig_photo_likes;
create policy "Users can read visible shindig photo likes"
on public.shindig_photo_likes
for select
to authenticated
using (
  exists (
    select 1
    from public.shindig_photos
    join public.shindigs on public.shindigs.id = public.shindig_photos.shindig_id
    where public.shindig_photos.id = shindig_photo_likes.photo_id
      and (
        public.shindigs.user_id = auth.uid()
        or exists (
          select 1 from public.friendships
          where (
            friendships.user_id = auth.uid()
            and friendships.friend_id = public.shindigs.user_id
          ) or (
            friendships.friend_id = auth.uid()
            and friendships.user_id = public.shindigs.user_id
          )
        )
        or exists (
          select 1 from public.shindig_invites
          where public.shindig_invites.shindig_id = public.shindigs.id
            and public.shindig_invites.invitee_user_id = auth.uid()
            and public.shindig_invites.status = 'accepted'
        )
      )
  )
);

drop policy if exists "Users can insert visible shindig photo likes" on public.shindig_photo_likes;
create policy "Users can insert visible shindig photo likes"
on public.shindig_photo_likes
for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.shindig_photos
    join public.shindigs on public.shindigs.id = public.shindig_photos.shindig_id
    where public.shindig_photos.id = shindig_photo_likes.photo_id
      and (
        public.shindigs.user_id = auth.uid()
        or exists (
          select 1 from public.friendships
          where (
            friendships.user_id = auth.uid()
            and friendships.friend_id = public.shindigs.user_id
          ) or (
            friendships.friend_id = auth.uid()
            and friendships.user_id = public.shindigs.user_id
          )
        )
        or exists (
          select 1 from public.shindig_invites
          where public.shindig_invites.shindig_id = public.shindigs.id
            and public.shindig_invites.invitee_user_id = auth.uid()
            and public.shindig_invites.status = 'accepted'
        )
      )
  )
);

drop policy if exists "Users can delete own shindig photo likes" on public.shindig_photo_likes;
create policy "Users can delete own shindig photo likes"
on public.shindig_photo_likes
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can read visible shindig photo comments" on public.shindig_photo_comments;
create policy "Users can read visible shindig photo comments"
on public.shindig_photo_comments
for select
to authenticated
using (
  exists (
    select 1
    from public.shindig_photos
    join public.shindigs on public.shindigs.id = public.shindig_photos.shindig_id
    where public.shindig_photos.id = shindig_photo_comments.photo_id
      and (
        public.shindigs.user_id = auth.uid()
        or exists (
          select 1 from public.friendships
          where (
            friendships.user_id = auth.uid()
            and friendships.friend_id = public.shindigs.user_id
          ) or (
            friendships.friend_id = auth.uid()
            and friendships.user_id = public.shindigs.user_id
          )
        )
        or exists (
          select 1 from public.shindig_invites
          where public.shindig_invites.shindig_id = public.shindigs.id
            and public.shindig_invites.invitee_user_id = auth.uid()
            and public.shindig_invites.status = 'accepted'
        )
      )
  )
);

drop policy if exists "Users can insert visible shindig photo comments" on public.shindig_photo_comments;
create policy "Users can insert visible shindig photo comments"
on public.shindig_photo_comments
for insert
to authenticated
with check (
  auth.uid() = user_id
  and exists (
    select 1
    from public.shindig_photos
    join public.shindigs on public.shindigs.id = public.shindig_photos.shindig_id
    where public.shindig_photos.id = shindig_photo_comments.photo_id
      and (
        public.shindigs.user_id = auth.uid()
        or exists (
          select 1 from public.friendships
          where (
            friendships.user_id = auth.uid()
            and friendships.friend_id = public.shindigs.user_id
          ) or (
            friendships.friend_id = auth.uid()
            and friendships.user_id = public.shindigs.user_id
          )
        )
        or exists (
          select 1 from public.shindig_invites
          where public.shindig_invites.shindig_id = public.shindigs.id
            and public.shindig_invites.invitee_user_id = auth.uid()
            and public.shindig_invites.status = 'accepted'
        )
      )
  )
);

drop policy if exists "Users can delete own shindig photo comments" on public.shindig_photo_comments;
create policy "Users can delete own shindig photo comments"
on public.shindig_photo_comments
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can read own notifications" on public.notifications;
create policy "Users can read own notifications"
on public.notifications
for select
to authenticated
using (auth.uid() = recipient_user_id);

drop policy if exists "Users can read own photo requests" on public.shindig_photo_requests;
create policy "Users can read own photo requests"
on public.shindig_photo_requests
for select
to authenticated
using (auth.uid() = requester_user_id or auth.uid() = recipient_user_id);

drop policy if exists "Users can read related shindig invites" on public.shindig_invites;
create policy "Users can read related shindig invites"
on public.shindig_invites
for select
to authenticated
using (auth.uid() = inviter_user_id or auth.uid() = invitee_user_id);

drop policy if exists "Inviters can create shindig invites" on public.shindig_invites;
create policy "Inviters can create shindig invites"
on public.shindig_invites
for insert
to authenticated
with check (auth.uid() = inviter_user_id);

drop policy if exists "Invitees can update own shindig invites" on public.shindig_invites;
create policy "Invitees can update own shindig invites"
on public.shindig_invites
for update
to authenticated
using (auth.uid() = invitee_user_id)
with check (auth.uid() = invitee_user_id);

drop policy if exists "Users can create own photo requests" on public.shindig_photo_requests;
create policy "Users can create own photo requests"
on public.shindig_photo_requests
for insert
to authenticated
with check (auth.uid() = requester_user_id);

drop policy if exists "Recipients can update photo requests" on public.shindig_photo_requests;
create policy "Recipients can update photo requests"
on public.shindig_photo_requests
for update
to authenticated
using (auth.uid() = recipient_user_id)
with check (auth.uid() = recipient_user_id);

drop policy if exists "Actors can create notifications" on public.notifications;
create policy "Actors can create notifications"
on public.notifications
for insert
to authenticated
with check (auth.uid() = actor_user_id);

drop policy if exists "Recipients can update own notifications" on public.notifications;
create policy "Recipients can update own notifications"
on public.notifications
for update
to authenticated
using (auth.uid() = recipient_user_id)
with check (auth.uid() = recipient_user_id);

drop policy if exists "Users can read own push tokens" on public.user_push_tokens;
create policy "Users can read own push tokens"
on public.user_push_tokens
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert own push tokens" on public.user_push_tokens;
create policy "Users can insert own push tokens"
on public.user_push_tokens
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update own push tokens" on public.user_push_tokens;
create policy "Users can update own push tokens"
on public.user_push_tokens
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own push tokens" on public.user_push_tokens;
create policy "Users can delete own push tokens"
on public.user_push_tokens
for delete
to authenticated
using (auth.uid() = user_id);

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
