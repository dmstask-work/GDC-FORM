-- Run this script in Supabase SQL Editor
-- It creates a table for the customer data form including submit timestamp.

create table if not exists public.customer_submissions (
  id bigint generated always as identity primary key,
  customer_code text generated always as ('CST' || lpad(id::text, 6, '0')) stored,
  sales_name text not null,
  customer_name text not null,
  latitude double precision,
  longitude double precision,
  address text not null,
  phone text not null,
  estimated_omset_kg numeric(12,2) not null default 0,
  photo_path text not null,
  photo_url text,
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.customer_submissions
  add column if not exists photo_path text;

alter table public.customer_submissions
  add column if not exists photo_url text;

alter table public.customer_submissions
  drop constraint if exists customer_submissions_sales_name_check;

alter table public.customer_submissions
  add constraint customer_submissions_sales_name_check
  check (sales_name in ('YUNIA', 'BENI', 'IDA', 'YOGI', 'NUR', 'DWI'));

create unique index if not exists customer_submissions_customer_code_idx
  on public.customer_submissions(customer_code);

alter table public.customer_submissions enable row level security;

-- Allow frontend (anon key) to insert form data.
drop policy if exists "Allow anon insert customer submissions"
  on public.customer_submissions;

create policy "Allow anon insert customer submissions"
  on public.customer_submissions
  for insert
  to anon
  with check (true);

-- Allow frontend (anon key) to read latest id for customer code preview.
drop policy if exists "Allow anon select customer submissions"
  on public.customer_submissions;

create policy "Allow anon select customer submissions"
  on public.customer_submissions
  for select
  to anon
  using (true);

-- Storage bucket for uploaded customer photos.
insert into storage.buckets (id, name, public)
values ('customer-photos', 'customer-photos', true)
on conflict (id) do nothing;

drop policy if exists "Allow anon upload customer photos" on storage.objects;
create policy "Allow anon upload customer photos"
  on storage.objects
  for insert
  to anon
  with check (bucket_id = 'customer-photos');

drop policy if exists "Allow anon read customer photos" on storage.objects;
create policy "Allow anon read customer photos"
  on storage.objects
  for select
  to anon
  using (bucket_id = 'customer-photos');
