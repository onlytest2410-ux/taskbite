import { createClient } from '@supabase/supabase-js';

// Connect to your existing Supabase database
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req: any, res: any) {
  // 1. Get the User ID and Reward Amount from BitcoTasks
  const subId = req.query.subId || req.body.subId || req.query.sub_id;
  const payout = req.query.payout || req.body.payout || req.query.amount || req.query.reward;

  if (!subId || !payout) {
    return res.status(400).send('Missing parameters');
  }

  // 2. Look up the user's current balance
  const { data: user, error: fetchError } = await supabase
    .from('profiles')
    .select('balance')
    .eq('id', subId)
    .single();

  if (fetchError || !user) {
    return res.status(404).send('User not found in Supabase');
  }

  // 3. Add the reward and update the database
  const newBalance = Number(user.balance || 0) + Number(payout);
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ balance: newBalance })
    .eq('id', subId);

  if (updateError) {
    return res.status(500).send('Database update failed');
  }

  // 4. Tell BitcoTasks it was successful
  return res.status(200).send('OK');
}
