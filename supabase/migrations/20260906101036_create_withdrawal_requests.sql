/*
# Create withdrawal_requests table (single-tenant, no auth)

1. New Tables
- `withdrawal_requests`
  - `id` (uuid, primary key)
  - `username` (text, the TaskBite local user who requested the withdrawal)
  - `method` (text, which withdrawal method: 'lightning' | 'faucetpay' | 'binance')
  - `currency` (text, the currency: 'BTC' or 'USDT')
  - `amount` (numeric, the requested withdrawal amount)
  - `recipient` (text, the destination address / email / lightning address)
  - `status` (text, default 'pending')
  - `created_at` (timestamptz, default now())

2. Security
- Enable RLS on `withdrawal_requests`.
- Allow anon + authenticated CRUD because the app uses localStorage-based accounts (no Supabase auth).
*/

CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL,
  method text NOT NULL,
  currency text NOT NULL,
  amount numeric NOT NULL,
  recipient text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE withdrawal_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_withdrawal_requests" ON withdrawal_requests;
CREATE POLICY "anon_select_withdrawal_requests"
ON withdrawal_requests FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_withdrawal_requests" ON withdrawal_requests;
CREATE POLICY "anon_insert_withdrawal_requests"
ON withdrawal_requests FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_withdrawal_requests" ON withdrawal_requests;
CREATE POLICY "anon_update_withdrawal_requests"
ON withdrawal_requests FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_withdrawal_requests" ON withdrawal_requests;
CREATE POLICY "anon_delete_withdrawal_requests"
ON withdrawal_requests FOR DELETE
TO anon, authenticated USING (true);
