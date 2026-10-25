create extension if not exists pgcrypto;

create table if not exists public.duos (
  id uuid primary key default gen_random_uuid(),
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.duo_members (
  duo_id uuid not null references public.duos(id) on delete cascade,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (duo_id, user_id)
);

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  duo_id uuid not null references public.duos(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  storage_path text unique,
  media_type text not null default 'photo',
  sticker_code text,
  caption text not null default '' check (char_length(caption) <= 500),
  created_at timestamptz not null default now()
);

alter table public.photos add column if not exists media_type text not null default 'photo';
alter table public.photos add column if not exists sticker_code text;
alter table public.photos alter column storage_path drop not null;
alter table public.photos drop constraint if exists photos_media_type_content_check;
alter table public.photos
  add constraint photos_media_type_content_check check (
    media_type in ('photo', 'video', 'audio', 'sticker')
    and (
      (media_type = 'sticker' and storage_path is null and sticker_code is not null and char_length(sticker_code) <= 16)
      or (media_type <> 'sticker' and storage_path is not null and sticker_code is null)
    )
  );

create index if not exists photos_duo_created_at_idx
  on public.photos (duo_id, created_at desc);

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  duo_id uuid not null references public.duos(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  avatar_path text,
  wallpaper_path text,
  updated_at timestamptz not null default now()
);

create table if not exists public.photo_reactions (
  photo_id uuid not null references public.photos(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (photo_id, user_id)
);

create or replace function public.is_duo_member(target_duo_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.duo_members
    where duo_id = target_duo_id
      and user_id = (select auth.uid())
  );
$$;

create or replace function public.create_duo()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_duo_id uuid;
  new_invite_code text;
begin
  if (select auth.uid()) is null then
    raise exception 'Inicia sesión para crear un álbum.';
  end if;
  if exists (select 1 from public.duo_members where user_id = (select auth.uid())) then
    raise exception 'Tu cuenta ya pertenece a un álbum.';
  end if;

  loop
    new_invite_code := upper(encode(gen_random_bytes(4), 'hex'));
    insert into public.duos (invite_code)
    values (new_invite_code)
    on conflict (invite_code) do nothing
    returning id into new_duo_id;
    exit when new_duo_id is not null;
  end loop;

  insert into public.duo_members (duo_id, user_id)
  values (new_duo_id, (select auth.uid()));

  return new_invite_code;
end;
$$;

create or replace function public.join_duo(invite_code_input text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  target_duo_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Inicia sesión para unirte a un álbum.';
  end if;
  if exists (select 1 from public.duo_members where user_id = (select auth.uid())) then
    raise exception 'Tu cuenta ya pertenece a un álbum.';
  end if;

  select id into target_duo_id
  from public.duos
  where invite_code = upper(trim(invite_code_input))
  for update;

  if target_duo_id is null then
    raise exception 'El código no existe. Revísalo e inténtalo de nuevo.';
  end if;

  if (select count(*) from public.duo_members where duo_id = target_duo_id) >= 2 then
    raise exception 'Este álbum ya tiene dos integrantes.';
  end if;

  insert into public.duo_members (duo_id, user_id)
  values (target_duo_id, (select auth.uid()));

  return target_duo_id;
end;
$$;

revoke all on function public.is_duo_member(uuid) from public;
revoke all on function public.create_duo() from public;
revoke all on function public.join_duo(text) from public;
grant execute on function public.is_duo_member(uuid) to authenticated;
grant execute on function public.create_duo() to authenticated;
grant execute on function public.join_duo(text) to authenticated;

alter table public.duos enable row level security;
alter table public.duo_members enable row level security;
alter table public.photos enable row level security;
alter table public.photo_reactions enable row level security;
alter table public.user_profiles enable row level security;

drop policy if exists "Duo members can view their duo" on public.duos;
create policy "Duo members can view their duo"
  on public.duos for select to authenticated
  using (public.is_duo_member(id));

drop policy if exists "Duo members can view membership" on public.duo_members;
create policy "Duo members can view membership"
  on public.duo_members for select to authenticated
  using (public.is_duo_member(duo_id));

drop policy if exists "Duo members can view photos" on public.photos;
create policy "Duo members can view photos"
  on public.photos for select to authenticated
  using (public.is_duo_member(duo_id));

drop policy if exists "Duo members can add their own photos" on public.photos;
create policy "Duo members can add their own photos"
  on public.photos for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and public.is_duo_member(duo_id)
    and (
      (media_type = 'sticker' and storage_path is null and sticker_code is not null)
      or (media_type <> 'sticker' and storage_path like duo_id::text || '/%' and sticker_code is null)
    )
  );

drop policy if exists "Duo members can view profiles" on public.user_profiles;
create policy "Duo members can view profiles"
  on public.user_profiles for select to authenticated
  using (public.is_duo_member(duo_id));

drop policy if exists "Users can create their own profile" on public.user_profiles;
create policy "Users can create their own profile"
  on public.user_profiles for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_duo_member(duo_id));

drop policy if exists "Users can update their own profile" on public.user_profiles;
create policy "Users can update their own profile"
  on public.user_profiles for update to authenticated
  using (user_id = (select auth.uid()) and public.is_duo_member(duo_id))
  with check (user_id = (select auth.uid()) and public.is_duo_member(duo_id));

drop policy if exists "Duo members can view reactions" on public.photo_reactions;
create policy "Duo members can view reactions"
  on public.photo_reactions for select to authenticated
  using (
    exists (
      select 1
      from public.photos
      where photos.id = photo_id
        and public.is_duo_member(photos.duo_id)
    )
  );

drop policy if exists "Duo members can react as themselves" on public.photo_reactions;
create policy "Duo members can react as themselves"
  on public.photo_reactions for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1
      from public.photos
      where photos.id = photo_id
        and public.is_duo_member(photos.duo_id)
    )
  );

drop policy if exists "Users can remove their own reactions" on public.photo_reactions;
create policy "Users can remove their own reactions"
  on public.photo_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

grant select on public.duos, public.duo_members, public.photos, public.photo_reactions, public.user_profiles to authenticated;
grant insert on public.photos, public.photo_reactions to authenticated;
grant delete on public.photo_reactions to authenticated;
grant insert, update on public.user_profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'duo-photos',
  'duo-photos',
  false,
  52428800,
  array[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/webm', 'video/quicktime',
    'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Duo members can view stored photos" on storage.objects;
create policy "Duo members can view stored photos"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'duo-photos'
    and public.is_duo_member((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "Duo members can upload stored photos" on storage.objects;
create policy "Duo members can upload stored photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'duo-photos'
    and public.is_duo_member((storage.foldername(name))[1]::uuid)
    and (
      array_length(storage.foldername(name), 1) = 1
      or (
        array_length(storage.foldername(name), 1) = 2
        and (storage.foldername(name))[2] = (select auth.uid()::text)
      )
    )
  );

drop policy if exists "Uploaders can clean up their own photos" on storage.objects;
create policy "Uploaders can clean up their own photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'duo-photos'
    and owner_id = (select auth.uid()::text)
    and public.is_duo_member((storage.foldername(name))[1]::uuid)
  );
