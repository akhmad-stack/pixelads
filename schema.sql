-- PixelAds compatibility migration for the tables already created in Supabase.
-- Run once in Supabase SQL Editor. This preserves ad_slots and its 48 rows.

alter table public.ads
  add column if not exists name text,
  add column if not exists target_url text,
  add column if not exists tagline text,
  add column if not exists email text,
  add column if not exists price integer not null default 10000,
  add column if not exists order_id text,
  add column if not exists payment_token text,
  add column if not exists payment_status text,
  add column if not exists payment_reference text,
  add column if not exists title text,
  add column if not exists destination_url text,
  add column if not exists buyer_name text;

-- Keep old/new name and URL columns compatible for rows created by either version.
update public.ads set name = coalesce(name, title, buyer_name, 'Iklan') where name is null;
update public.ads set title = coalesce(title, name) where title is null;
update public.ads set target_url = coalesce(target_url, destination_url) where target_url is null;
update public.ads set destination_url = coalesce(destination_url, target_url) where destination_url is null;

create unique index if not exists ads_order_id_unique on public.ads(order_id) where order_id is not null;
create unique index if not exists ads_active_slot_unique on public.ads(slot_id) where status in ('pending','paid');

alter table public.ads enable row level security;
drop policy if exists "public can read paid ads" on public.ads;
create policy "public can read paid ads" on public.ads for select to anon, authenticated using (status = 'paid');

-- Storage bucket expected by this build: ad.images (exact spelling).
-- Create it as PUBLIC in Storage so paid ad images can be viewed publicly.
-- Upload is performed server-side with SUPABASE_SERVICE_ROLE_KEY; do not expose that key in the browser.
