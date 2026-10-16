import { supabase } from '../config/supabase.js';
import { cacheDel, cacheGet, cacheSet } from './cache.js';

const READY_TTL_SECONDS = 60;
const key = (policy_id, user_id) => `own:${user_id}:${policy_id}`;

// Returns the policy row if it belongs to the user, otherwise null.
// Ready policies are cached briefly: every chat message needs this check, and a policy
// that is ready stays ready until it is deleted (which invalidates the entry).
export async function getOwnedPolicy(policy_id, user_id, columns = 'policy_id, status') {
  if (typeof policy_id !== 'string' || !policy_id) return null;

  const cached = await cacheGet(key(policy_id, user_id));
  if (cached) return cached;

  const { data } = await supabase
    .from('policies')
    .select(columns.includes('status') ? columns : `${columns}, status`)
    .eq('policy_id', policy_id)
    .eq('user_id', user_id)
    .maybeSingle();

  if (data?.status === 'ready') await cacheSet(key(policy_id, user_id), data, READY_TTL_SECONDS);
  return data || null;
}

// All of the given policies, only if every one belongs to the user (single DB round trip).
export async function getOwnedPolicies(policy_ids, user_id) {
  const { data } = await supabase
    .from('policies')
    .select('policy_id, status, filename')
    .eq('user_id', user_id)
    .in('policy_id', policy_ids);
  return data && data.length === policy_ids.length ? data : null;
}

export const forgetPolicy = (policy_id, user_id) => cacheDel(key(policy_id, user_id));
