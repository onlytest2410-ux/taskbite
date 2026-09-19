import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req: any, res: any) {
  // This will print their hidden data in your Vercel logs!
  console.log("BODY:", req.body);
  console.log("QUERY:", req.query);

  // Checking every possible spelling they might use
  const subId = req.body?.subId || req.body?.sub_id || req.body?.subid || req.query?.subid;
  const payout = req.body?.payout || req.body?.amount || req.body?.reward || req.query?.payout;

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
