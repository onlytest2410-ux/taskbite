import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req: any, res: any) {
  // The '?' safely prevents a crash if the body or query is empty
  const subId = req.query?.subId || req.query?.sub_id || req.body?.subId;
  const payout = req.query?.payout || req.query?.amount || req.body?.payout;

  if (!subId || !payout) {
    return res.status(400).send('Missing parameters');
  }

  const { data: user, error: fetchError } = await supabase
    .from('profiles')
    .select('balance')
    .eq('id', subId)
    .single();

  if (fetchError || !user) {
    return res.status(404).send('User not found in Supabase');
  }

  const newBalance = Number(user.balance || 0) + Number(payout);
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ balance: newBalance })
    .eq('id', subId);

  if (updateError) {
    return res.status(500).send('Database update failed');
  }

  return res.status(200).send('OK');
    }
