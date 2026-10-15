import { supabase } from '../config/supabase.js';

// Returns the policy row if it belongs to the user, otherwise null.
export async function getOwnedPolicy(policy_id, user_id, columns = 'policy_id') {
  if (typeof policy_id !== 'string' || !policy_id) return null;
  const { data } = await supabase
    .from('policies')
    .select(columns)
    .eq('policy_id', policy_id)
    .eq('user_id', user_id)
    .maybeSingle();
  return data || null;
}
