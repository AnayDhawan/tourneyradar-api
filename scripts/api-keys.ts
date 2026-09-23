/**
 * Issue, list and revoke API keys (issue #28).
 *
 * A CLI rather than an admin endpoint, deliberately. An HTTP route that mints
 * credentials is a route that has to be authenticated, authorised and rate
 * limited itself, and it is reachable from the internet forever after. This
 * needs the service role key, which only ever exists on a machine that already
 * has full database access, so the blast radius is unchanged.
 *
 * Usage:
 *   npx tsx --env-file=.env scripts/api-keys.ts issue "Name" [--tier pro]
 *   npx tsx --env-file=.env scripts/api-keys.ts list
 *   npx tsx --env-file=.env scripts/api-keys.ts revoke <prefix-or-id>
 */

import { generateKey } from '../src/lib/apiKeys';
import { supabase } from '../src/lib/supabase';
import { TIER_LIMITS, isTier, type Tier } from '../src/lib/tiers';

async function issue(name: string, tier: Tier): Promise<number> {
  const { key, hash, prefix } = generateKey();

  const { data, error } = await supabase
    .from('api_keys')
    .insert({ key_hash: hash, key_prefix: prefix, name, tier })
    .select('id, created_at')
    .single();

  if (error || !data) {
    console.error(`Could not issue the key: ${error?.message ?? 'no row returned'}`);
    return 1;
  }

  console.log(`\nIssued "${name}" on the ${tier} tier (${TIER_LIMITS[tier].perMinute}/min).\n`);
  console.log(`  ${key}\n`);
  // The only time this string exists outside the holder's hands. Only the hash
  // is stored, so a lost key is reissued rather than recovered.
  console.log('Copy it now. It is stored hashed and cannot be shown again.');
  console.log(`Reference: ${prefix} (id ${data.id})\n`);
  return 0;
}

async function list(): Promise<number> {
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, key_prefix, name, tier, created_at, last_used_at, revoked_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error(`Could not list keys: ${error.message}`);
    return 1;
  }
  if (!data?.length) {
    console.log('No keys issued.');
    return 0;
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data: usage } = await supabase
    .from('api_key_usage')
    .select('key_id, requests')
    .eq('day', today);
  const todayBy = new Map((usage ?? []).map((u) => [u.key_id, u.requests]));

  console.log(`\n${'prefix'.padEnd(16)}${'name'.padEnd(24)}${'tier'.padEnd(8)}${'today'.padStart(8)}  status`);
  for (const row of data) {
    const status = row.revoked_at
      ? `revoked ${row.revoked_at.slice(0, 10)}`
      : row.last_used_at
        ? `last used ${row.last_used_at.slice(0, 10)}`
        : 'never used';
    console.log(
      row.key_prefix.padEnd(16) +
        row.name.slice(0, 22).padEnd(24) +
        row.tier.padEnd(8) +
        String(todayBy.get(row.id) ?? 0).padStart(8) +
        `  ${status}`
    );
  }
  console.log();
  return 0;
}

async function revoke(reference: string): Promise<number> {
  // Matched on the prefix or the id, because those are the two things a human
  // has to hand. Never on the key itself, which nobody should be pasting into
  // a shell where it lands in history.
  const column = reference.includes('-') ? 'id' : 'key_prefix';

  const { data, error } = await supabase
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq(column, reference)
    .is('revoked_at', null)
    .select('key_prefix, name');

  if (error) {
    console.error(`Could not revoke: ${error.message}`);
    return 1;
  }
  if (!data?.length) {
    console.error(`No live key matching "${reference}". Already revoked, or wrong reference.`);
    return 1;
  }

  for (const row of data) {
    console.log(`Revoked ${row.key_prefix} ("${row.name}"). It stops working on the next request.`);
  }
  return 0;
}

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2);

  if (command === 'issue') {
    const name = rest.find((a) => !a.startsWith('--'));
    if (!name) {
      console.error('Usage: api-keys.ts issue "Name" [--tier free|pro]');
      return 1;
    }
    const tierIndex = rest.indexOf('--tier');
    const requested = tierIndex === -1 ? 'free' : rest[tierIndex + 1];
    if (!requested || !isTier(requested) || requested === 'anonymous') {
      console.error(`--tier must be one of: free, pro. Got "${requested}".`);
      return 1;
    }
    return issue(name, requested);
  }

  if (command === 'list') return list();

  if (command === 'revoke') {
    if (!rest[0]) {
      console.error('Usage: api-keys.ts revoke <prefix-or-id>');
      return 1;
    }
    return revoke(rest[0]);
  }

  console.error('Usage: api-keys.ts issue|list|revoke');
  return 1;
}

main().then((code) => process.exit(code));
