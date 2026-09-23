-- API keys, tiers and usage accounting (issue #28).
--
-- The API stays keyless for anonymous callers. A key is how somebody asks for
-- a higher ceiling than the shared anonymous one, not a gate on access, so
-- nothing here makes the existing endpoints require authentication.
--
-- Keys are stored hashed. The plaintext is shown once at issuance and never
-- again, so a leak of this table does not hand over working credentials. SHA-256
-- is the right primitive here rather than bcrypt or argon2: those exist to slow
-- down guessing of low-entropy human passwords, and these are 256 bits of
-- randomness, where brute force is already impossible and the per-request cost
-- of a slow hash would be paid on every call.
--
-- key_prefix is stored in clear on purpose. It is the first few characters of
-- the key, enough for a human to tell two keys apart in a list and to match a
-- support request against a row, and far too little to guess the rest.

begin;

create table if not exists api_keys (
    id           uuid primary key default gen_random_uuid(),
    -- SHA-256 of the full key, hex. Unique so a lookup is one indexed read.
    key_hash     text not null unique,
    -- Leading characters of the key, for display only, e.g. 'tr_live_8fa3'.
    key_prefix   text not null,
    name         text not null,
    tier         text not null default 'free',
    created_at   timestamptz not null default now(),
    last_used_at timestamptz,
    -- Set rather than deleting the row, so usage history survives revocation
    -- and a revoked key cannot be silently reissued to someone else.
    revoked_at   timestamptz,

    constraint api_keys_tier_known check (tier in ('free', 'bulk')),
    constraint api_keys_name_not_blank check (length(trim(name)) > 0)
);

comment on table api_keys is
    'API keys for tiered rate limits. Keys are stored as SHA-256 hashes; plaintext is shown once at issuance.';

-- One row per key per day. A counter rather than a request log: the question
-- worth answering is "is this key being used, and how much", and keeping a row
-- per request would grow without bound and turn an analytics table into a
-- liability holding a record of what everyone looked up.
create table if not exists api_key_usage (
    key_id   uuid not null references api_keys(id) on delete cascade,
    day      date not null,
    requests bigint not null default 0,

    primary key (key_id, day)
);

comment on table api_key_usage is
    'Daily request counts per key. Counters, not a request log, deliberately.';

create index if not exists api_key_usage_day_idx on api_key_usage (day desc);

-- Atomic increment. Doing this as a read-modify-write from the API would lose
-- counts under concurrent requests, which is exactly the traffic worth counting.
create or replace function public.record_api_key_use(p_key_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
    insert into public.api_key_usage (key_id, day, requests)
    values (p_key_id, (now() at time zone 'utc')::date, 1)
    on conflict (key_id, day)
    do update set requests = public.api_key_usage.requests + 1;

    update public.api_keys
       set last_used_at = now()
     where id = p_key_id;
$$;

-- Both tables are reached only with the service role key from the server. No
-- anon access, and RLS on so a future anon grant cannot open them by accident.
alter table api_keys enable row level security;
alter table api_key_usage enable row level security;

commit;
