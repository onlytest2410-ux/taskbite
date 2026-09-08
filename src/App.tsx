import { useState, useEffect, useCallback } from 'react';
import { supabase } from './lib/supabase';
import type { User } from '@supabase/supabase-js';
import {
  Wallet,
  Gift,
  Users,
  Store,
  X,
  Copy,
  Check,
  Clock,
  ArrowUpRight,
  Zap,
  ShieldCheck,
  AlertCircle,
  TrendingUp,
  Sparkles,
  Lock,
  LogOut,
  User,
  Mail,
  History,
  Bitcoin,
} from 'lucide-react';

type WithdrawMethod = 'faucetpay' | 'binance' | 'direct';
type AuthMode = 'signin' | 'signup';

interface Transaction {
  id: string;
  type: 'claim' | 'withdrawal';
  amount: number;
  time: string;
  method?: string;
  destination?: string;
}

interface Profile {
  id: string;
  username: string;
  email: string;
  balance: number;
  referral_code: string;
  last_claim_time: string | null;
}

const FAUCET_REWARD = 0.001;
const FAUCET_COOLDOWN = 43200; // 12 hours in seconds
const AD_VIEW_DURATION = 30;
const AD_URL = 'https://www.profitableratecpmnetwork.com/ag1v3m83?key=8adb519f3b317f350d8485bb76c3a4c2';
const FORMSPREE_ENDPOINT = 'https://formspree.io/f/xjyveyja';

const RECAPTCHA_SITE_KEY = '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI';

const WITHDRAW_RULES: Record<WithdrawMethod, { min: number; fee: number; currency: string; label: string; placeholder: string; note: string; icon: typeof Wallet }> = {
  faucetpay: {
    min: 0.50,
    fee: 0,
    currency: 'USDT',
    label: 'FaucetPay Email or Deposit Address',
    placeholder: 'Enter your FaucetPay Email or Deposit Address',
    note: 'Zero-fee transfer. Minimum: $0.50 USDT',
    icon: Wallet,
  },
  binance: {
    min: 3.00,
    fee: 0.10,
    currency: 'USDT',
    label: 'Binance Pay ID or Binance Email',
    placeholder: 'Enter your Binance Pay ID or Binance Email',
    note: 'Fee: $0.10 USDT. Minimum: $3.00 USDT',
    icon: Bitcoin,
  },
  direct: {
    min: 3.00,
    fee: 0.10,
    currency: 'USDT',
    label: 'USDT (BEP-20) Wallet Address',
    placeholder: 'Enter your USDT (BEP-20) Wallet Address',
    note: 'Fee: $0.10 USDT. Minimum: $3.00 USDT',
    icon: Wallet,
  },
};

const formatHHMMSS = (totalSeconds: number): string => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
};

const isValidEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

function App() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // Auth state
  const [authMode, setAuthMode] = useState<AuthMode>('signin');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');

  // Signup state
  const [suUsername, setSuUsername] = useState('');
  const [suEmail, setSuEmail] = useState('');
  const [suPass, setSuPass] = useState('');
  const [suConfirm, setSuConfirm] = useState('');
  const [signupError, setSignupError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);

  // Dashboard state
  const [balance, setBalance] = useState(0);
  const [lastClaimTime, setLastClaimTime] = useState<number | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAdModalOpen, setIsAdModalOpen] = useState(false);
  const [adCountdown, setAdCountdown] = useState(AD_VIEW_DURATION);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [copied, setCopied] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const [method, setMethod] = useState<WithdrawMethod>('faucetpay');
  const [destination, setDestination] = useState('');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activePage, setActivePage] = useState<'dashboard' | 'earn'>('dashboard');
  const [iframeLoaded, setIframeLoaded] = useState(false);

  // ---- Session & profile loading ----
  const loadProfile = useCallback(async (user: User) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, email, balance, referral_code, last_claim_time')
      .eq('id', user.id)
      .maybeSingle();

    if (error || !data) {
      // Profile might not be created yet (trigger race). Retry once.
      if (!data) {
        await new Promise((r) => setTimeout(r, 500));
        const retry = await supabase
          .from('profiles')
          .select('id, username, email, balance, referral_code, last_claim_time')
          .eq('id', user.id)
          .maybeSingle();
        if (retry.data) {
          setProfile(retry.data as Profile);
          setBalance(Number(retry.data.balance));
          setLastClaimTime(retry.data.last_claim_time ? new Date(retry.data.last_claim_time).getTime() : null);
          return;
        }
      }
      return;
    }

    setProfile(data as Profile);
    setBalance(Number(data.balance));
    setLastClaimTime(data.last_claim_time ? new Date(data.last_claim_time).getTime() : null);
  }, []);

  const loadTransactions = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('transactions')
      .select('id, type, amount, method, destination, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error || !data) return;

    const mapped: Transaction[] = data.map((t: any) => ({
      id: t.id,
      type: t.type,
      amount: Number(t.amount),
      time: t.created_at,
      method: t.method,
      destination: t.destination,
    }));
    setTransactions(mapped);
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      if (session?.user) {
        setAuthUser(session.user);
        Promise.all([
          loadProfile(session.user),
          loadTransactions(session.user.id),
        ]).finally(() => mounted && setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      (async () => {
        if (event === 'SIGNED_OUT' || !session?.user) {
          setAuthUser(null);
          setProfile(null);
          setBalance(0);
          setLastClaimTime(null);
          setTransactions([]);
          setCountdown(0);
          setActivePage('dashboard');
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          setAuthUser(session.user);
          await loadProfile(session.user);
          await loadTransactions(session.user.id);
        }
      })();
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, [loadProfile, loadTransactions]);

  // ---- reCAPTCHA rendering ----
  useEffect(() => {
    if (authUser) return;
    const renderCaptcha = () => {
      const grecaptcha = (window as any).grecaptcha;
      if (!grecaptcha) return;
      const container = document.querySelector('.g-recaptcha');
      if (!container || container.children.length > 0) return;
      grecaptcha.render(container, { sitekey: RECAPTCHA_SITE_KEY });
    };
    renderCaptcha();
    if (!(window as any).grecaptcha) {
      const interval = setInterval(() => {
        if ((window as any).grecaptcha) {
          renderCaptcha();
          clearInterval(interval);
        }
      }, 200);
      return () => clearInterval(interval);
    }
  }, [authMode, authUser]);

  // ---- Countdown ----
  useEffect(() => {
    if (lastClaimTime !== null) {
      const elapsed = Math.floor((Date.now() - lastClaimTime) / 1000);
      const remaining = FAUCET_COOLDOWN - elapsed;
      setCountdown(remaining > 0 ? remaining : 0);
    } else {
      setCountdown(0);
    }
  }, [lastClaimTime]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ---- Auth handlers ----
  const handleSignIn = async () => {
    if (!loginEmail.trim()) {
      setLoginError('Please enter your email');
      return;
    }
    if (!isValidEmail(loginEmail.trim())) {
      setLoginError('Please enter a valid email address');
      return;
    }
    if (!loginPass.trim()) {
      setLoginError('Please enter your password');
      return;
    }
    const recaptchaToken = (window as any).grecaptcha?.getResponse();
    if (!recaptchaToken) {
      setLoginError('Please complete the reCAPTCHA verification.');
      return;
    }

    setAuthBusy(true);
    setLoginError('');
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginEmail.trim(),
        password: loginPass,
      });
      if (error) {
        setLoginError(error.message || 'Sign in failed. Check your credentials.');
        (window as any).grecaptcha?.reset();
      } else {
        setLoginEmail('');
        setLoginPass('');
        (window as any).grecaptcha?.reset();
      }
    } catch {
      setLoginError('Network error. Please try again.');
      (window as any).grecaptcha?.reset();
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignUp = async () => {
    if (suUsername.trim().length < 3) {
      setSignupError('Username must be at least 3 characters');
      return;
    }
    if (!isValidEmail(suEmail.trim())) {
      setSignupError('Please enter a valid email address');
      return;
    }
    if (suPass.length < 6) {
      setSignupError('Password must be at least 6 characters');
      return;
    }
    if (suPass !== suConfirm) {
      setSignupError('Passwords do not match');
      return;
    }
    const recaptchaToken = (window as any).grecaptcha?.getResponse();
    if (!recaptchaToken) {
      setSignupError('Please complete the reCAPTCHA verification.');
      return;
    }

    setAuthBusy(true);
    setSignupError('');
    try {
      const { data, error } = await supabase.auth.signUp({
        email: suEmail.trim(),
        password: suPass,
        options: { data: { username: suUsername.trim() } },
      });
      if (error) {
        setSignupError(error.message || 'Sign up failed.');
        (window as any).grecaptcha?.reset();
      } else if (data.user) {
        setSuUsername('');
        setSuEmail('');
        setSuPass('');
        setSuConfirm('');
        (window as any).grecaptcha?.reset();
        showToast('Account created successfully!', 'success');
      }
    } catch {
      setSignupError('Network error. Please try again.');
      (window as any).grecaptcha?.reset();
    } finally {
      setAuthBusy(false);
    }
  };

  const switchAuthMode = (mode: AuthMode) => {
    setAuthMode(mode);
    setLoginError('');
    setSignupError('');
    setLoginEmail('');
    setLoginPass('');
    setSuUsername('');
    setSuEmail('');
    setSuPass('');
    setSuConfirm('');
    (window as any).grecaptcha?.reset();
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // ---- Ad modal countdown ----
  useEffect(() => {
    if (!isAdModalOpen || adCountdown <= 0) return;
    const timer = setInterval(() => {
      setAdCountdown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [isAdModalOpen, adCountdown]);

  // ---- Faucet claim ----
  const handleClaim = () => {
    if (countdown > 0 || !authUser) return;
    setAdCountdown(AD_VIEW_DURATION);
    setIsAdModalOpen(true);
  };

  const completeAdClaim = async () => {
    if (!authUser || !profile) return;
    const newBalance = balance + FAUCET_REWARD;
    const now = Date.now();

    setBalance(newBalance);
    setLastClaimTime(now);
    setCountdown(FAUCET_COOLDOWN);

    const tx: Transaction = {
      id: crypto.randomUUID(),
      type: 'claim',
      amount: FAUCET_REWARD,
      time: new Date(now).toISOString(),
    };
    const updatedTx = [tx, ...transactions].slice(0, 20);
    setTransactions(updatedTx);

    try {
      await supabase
        .from('profiles')
        .update({ balance: newBalance, last_claim_time: new Date(now).toISOString() })
        .eq('id', authUser.id);

      await supabase.from('transactions').insert({
        user_id: authUser.id,
        type: 'claim',
        amount: FAUCET_REWARD,
      });
    } catch {
      // Balance already updated in UI; will sync on next profile load
    }

    setIsAdModalOpen(false);
    showToast(`Claimed ${FAUCET_REWARD.toFixed(3)} USDT!`, 'success');
  };

  // ---- Withdrawal ----
  const openModal = () => {
    setAmount('');
    setDestination('');
    setMethod('faucetpay');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setAmount('');
    setDestination('');
  };

  const setMaxAmount = () => {
    setAmount(balance.toFixed(3));
  };

  const handleWithdraw = async () => {
    if (!authUser || !profile) return;
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount)) {
      showToast('Enter a valid amount', 'error');
      return;
    }
    const rules = WITHDRAW_RULES[method];
    if (numAmount < rules.min) {
      showToast(`Minimum withdrawal is ${rules.min.toFixed(2)} for this method`, 'error');
      return;
    }
    if (numAmount > balance) {
      showToast('Insufficient balance', 'error');
      return;
    }
    if (!destination.trim()) {
      showToast('Enter a destination address', 'error');
      return;
    }

    const methodName = method === 'faucetpay' ? 'FaucetPay (USDT)' : method === 'binance' ? 'Binance Pay (USDT)' : 'Direct Wallet (USDT BEP-20)';

    setSubmitting(true);
    try {
      // Send notification email via Formspree
      await fetch(FORMSPREE_ENDPOINT, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          method: methodName,
          destination: destination.trim(),
          requestedAmount: numAmount.toFixed(3) + ' ' + rules.currency,
          fee: rules.fee.toFixed(3) + ' ' + rules.currency,
          netAmount: (numAmount - rules.fee).toFixed(3) + ' ' + rules.currency,
          time: new Date().toISOString(),
        }),
      });

      // Insert withdrawal request
      const { error: wError } = await supabase.from('withdrawal_requests').insert({
        user_id: authUser.id,
        username: profile.username,
        method: method,
        currency: rules.currency,
        amount: numAmount,
        recipient: destination.trim(),
        status: 'pending',
      });
      if (wError) throw wError;

      // Deduct balance
      const newBalance = balance - numAmount;
      setBalance(newBalance);

      // Record transaction
      const tx: Transaction = {
        id: crypto.randomUUID(),
        type: 'withdrawal',
        amount: -numAmount,
        time: new Date().toISOString(),
        method: methodName,
        destination: destination.trim(),
      };
      const updatedTx = [tx, ...transactions].slice(0, 20);
      setTransactions(updatedTx);

      await supabase
        .from('profiles')
        .update({ balance: newBalance })
        .eq('id', authUser.id);

      await supabase.from('transactions').insert({
        user_id: authUser.id,
        type: 'withdrawal',
        amount: -numAmount,
        method: methodName,
        destination: destination.trim(),
      });

      showToast('Withdrawal request submitted!', 'success');
      closeModal();
    } catch {
      showToast('Failed to submit withdrawal. Try again.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const copyReferral = () => {
    if (!profile) return;
    const link = `https://taskbite.app/?ref=${profile.referral_code}`;
    navigator.clipboard?.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ---- Derived values ----
  const claimReady = countdown === 0;
  const formattedBalance = balance.toFixed(3);
  const referralLink = profile
    ? `https://taskbite.app/?ref=${profile.referral_code}`
    : 'https://taskbite.app/?ref=YOUR_CODE';

  // ---- Loading screen ----
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0d1117] text-gray-200">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#30363d] border-t-[#58a6ff]" />
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  // ---- Auth screen ----
  if (!authUser) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0d1117] px-4 text-gray-200">
        {/* Background gradient accents */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-[#58a6ff] opacity-[0.07] blur-[120px]" />
          <div className="absolute bottom-0 -right-40 h-96 w-96 rounded-full bg-[#3fb950] opacity-[0.05] blur-[120px]" />
        </div>

        <div className="relative w-full max-w-sm">
          {/* Logo */}
          <div className="mb-6 flex flex-col items-center gap-3">
            <img
              src="https://i.postimg.cc/85mBkFy2/logo.png"
              alt="TaskBite"
              className="h-12 w-auto"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
            <div className="text-center">
              <h1 className="text-2xl font-bold tracking-tight text-white">TaskBite</h1>
              <p className="mt-1 text-sm text-gray-500">
                {authMode === 'signin' ? 'Sign in to your account' : 'Create a new account'}
              </p>
            </div>
          </div>

          {/* Auth Card */}
          <div className="rounded-2xl border border-[#30363d] bg-[#161b22] p-6 shadow-2xl">
            {/* Tab Toggle */}
            <div className="mb-5 flex rounded-xl border border-[#30363d] bg-[#0d1117] p-1">
              <button
                onClick={() => switchAuthMode('signin')}
                className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all ${
                  authMode === 'signin'
                    ? 'bg-[#58a6ff] text-[#0d1117]'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => switchAuthMode('signup')}
                className={`flex-1 rounded-lg py-2.5 text-sm font-semibold transition-all ${
                  authMode === 'signup'
                    ? 'bg-[#58a6ff] text-[#0d1117]'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Sign Up
              </button>
            </div>

            {/* Sign In Form */}
            {authMode === 'signin' && (
              <>
                <div className="mb-4">
                  <label className="mb-1.5 block text-xs font-medium text-gray-400">Email</label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-600" />
                    <input
                      type="email"
                      value={loginEmail}
                      onChange={(e) => { setLoginEmail(e.target.value); setLoginError(''); }}
                      onKeyDown={(e) => e.key === 'Enter' && handleSignIn()}
                      placeholder="you@example.com"
                      className="w-full rounded-xl border border-[#30363d] bg-[#0d1117] py-3 pl-10 pr-3 text-sm text-white placeholder-gray-600 outline-none transition-colors focus:border-[#58a6ff]"
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <label className="mb-1.5 block text-xs font-medium text-gray-400">Password</label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-600" />
                    <input
                      type="password"
                      value={loginPass}
                      onChange={(e) => { setLoginPass(e.target.value); setLoginError(''); }}
                      onKeyDown={(e) => e.key === 'Enter' && handleSignIn()}
                      placeholder="Enter password"
                      className="w-full rounded-xl border border-[#30363d] bg-[#0d1117] py-3 pl-10 pr-3 text-sm text-white placeholder-gray-600 outline-none transition-colors focus:border-[#58a6ff]"
                    />
                  </div>
                </div>

                {/* reCAPTCHA */}
                <div className="mb-4">
                  <label className="mb-1.5 block text-xs font-medium text-gray-400">Security Check</label>
                  <div className="g-recaptcha" data-sitekey={RECAPTCHA_SITE_KEY}></div>
                </div>

                {loginError && (
                  <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    {loginError}
                  </div>
                )}

                <button
                  onClick={handleSignIn}
                  disabled={authBusy}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#58a6ff] py-3 font-semibold text-[#0d1117] transition-all hover:bg-[#79b8ff] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {authBusy ? (
                    <>
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#0d1117] border-t-transparent" />
                      Signing in...
                    </>
                  ) : (
                    <>
                      <LogOut className="h-5 w-5 rotate-180" />
                      Sign In
                    </>
                  )}
                </button>
              </>
            )}

            {/* Sign Up Form */}
            {authMode === 'signup' && (
              <>
                <div className="mb-4">
                  <label className="mb-1.5 block text-xs font-medium text-gray-400">Username (min 3 characters)</label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-600" />
                    <input
                      type="text"
                      value={suUsername}
                      onChange={(e) => { setSuUsername(e.target.value); setSignupError(''); }}
                      onKeyDown={(e) => e.key === 'Enter' && handleSignUp()}
                      placeholder="Choose a username"
                      className="w-full rounded-xl border border-[#30363d] bg-[#0d1117] py-3 pl-10 pr-3 text-sm text-white placeholder-gray-600 outline-none transition-colors focus:border-[#58a6ff]"
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <label className="mb-1.5 block text-xs font-medium text-gray-400">Email</label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-600" />
                    <input
                      type="email"
                      value={suEmail}
                      onChange={(e) => { setSuEmail(e.target.value); setSignupError(''); }}
                      onKeyDown={(e) => e.key === 'Enter' && handleSignUp()}
                      placeholder="you@example.com"
                      className="w-full rounded-xl border border-[#30363d] bg-[#0d1117] py-3 pl-10 pr-3 text-sm text-white placeholder-gray-600 outline-none transition-colors focus:border-[#58a6ff]"
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <label className="mb-1.5 block text-xs font-medium text-gray-400">Password (min 6 characters)</label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-600" />
                    <input
                      type="password"
                      value={suPass}
                      onChange={(e) => { setSuPass(e.target.value); setSignupError(''); }}
                      onKeyDown={(e) => e.key === 'Enter' && handleSignUp()}
                      placeholder="Create a password"
                      className="w-full rounded-xl border border-[#30363d] bg-[#0d1117] py-3 pl-10 pr-3 text-sm text-white placeholder-gray-600 outline-none transition-colors focus:border-[#58a6ff]"
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <label className="mb-1.5 block text-xs font-medium text-gray-400">Confirm Password</label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-600" />
                    <input
                      type="password"
                      value={suConfirm}
                      onChange={(e) => { setSuConfirm(e.target.value); setSignupError(''); }}
                      onKeyDown={(e) => e.key === 'Enter' && handleSignUp()}
                      placeholder="Re-enter password"
                      className="w-full rounded-xl border border-[#30363d] bg-[#0d1117] py-3 pl-10 pr-3 text-sm text-white placeholder-gray-600 outline-none transition-colors focus:border-[#58a6ff]"
                    />
                  </div>
                </div>

                {/* reCAPTCHA */}
                <div className="mb-4">
                  <label className="mb-1.5 block text-xs font-medium text-gray-400">Security Check</label>
                  <div className="g-recaptcha" data-sitekey={RECAPTCHA_SITE_KEY}></div>
                </div>

                {signupError && (
                  <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-400">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    {signupError}
                  </div>
                )}

                <button
                  onClick={handleSignUp}
                  disabled={authBusy}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#3fb950] py-3 font-semibold text-[#0d1117] transition-all hover:bg-[#46c75f] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {authBusy ? (
                    <>
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#0d1117] border-t-transparent" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <User className="h-5 w-5" />
                      Create Account
                    </>
                  )}
                </button>
              </>
            )}
          </div>

          {/* A-Ads Banner */}
          <div id="frame" style={{ width: '100%', margin: '20px auto', position: 'relative', zIndex: 10 }}>
            <iframe
              data-aa="2454501"
              src="https://acceptable.a-ads.com/2454501/?size=Adaptive"
              style={{ border: 0, padding: 0, width: '100%', height: '100px', overflow: 'hidden', display: 'block', margin: 'auto' }}
              title="A-Ads Banner"
            />
          </div>

          <p className="mt-5 text-center text-xs text-gray-600">
            TaskBite &copy; 2026 — Crypto micro-task dashboard
          </p>
        </div>
      </div>
    );
  }

  // ---- Dashboard ----
  return (
    <div className="min-h-screen bg-[#0d1117] text-gray-200">
      {/* Background gradient accents */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-40 h-96 w-96 rounded-full bg-[#58a6ff] opacity-[0.07] blur-[120px]" />
        <div className="absolute top-1/3 -right-40 h-96 w-96 rounded-full bg-[#3fb950] opacity-[0.05] blur-[120px]" />
      </div>

      {/* App Header */}
      <header className="sticky top-0 z-30 border-b border-[#30363d] bg-[#0d1117]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <img
              src="https://i.postimg.cc/85mBkFy2/logo.png"
              alt="TaskBite"
              className="h-8 w-auto"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <span className="text-lg font-bold tracking-tight text-white">TaskBite</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActivePage('earn')}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                activePage === 'earn'
                  ? 'bg-[#58a6ff]/10 text-[#58a6ff]'
                  : 'text-gray-400 hover:bg-[#30363d] hover:text-white'
              }`}
            >
              <Store className="h-4 w-4" />
              <span className="hidden sm:inline">Earn Offers</span>
              <span className="sm:hidden">Earn</span>
            </button>
            <div className="flex items-center gap-2 rounded-full border border-[#30363d] bg-[#161b22] py-1 pl-1 pr-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#58a6ff] to-[#1f6feb] text-xs font-bold text-white">
                {(profile?.username || '?').charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-medium text-gray-300">{profile?.username}</span>
            </div>
            <button
              onClick={handleLogout}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-[#30363d] hover:text-white"
              title="Log out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      {activePage === 'earn' ? (
        <main className="relative z-10 mx-auto max-w-3xl px-4 py-5 pb-12 space-y-4">
          {/* Earn Page Banner */}
          <section className="relative overflow-hidden rounded-2xl border border-[#30363d] bg-gradient-to-br from-[#161b22] to-[#0d1117] p-5">
            <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[#3fb950] opacity-[0.06] blur-2xl" />
            <div className="relative">
              <div className="mb-2 flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#3fb950]/10">
                  <Store className="h-5 w-5 text-[#3fb950]" />
                </div>
                <h1 className="text-lg font-bold text-white">Complete Offers & Earn USDT</h1>
              </div>
              <p className="text-sm text-gray-400">
                Browse PTC ads, shortlinks, and micro-tasks. Rewards credit automatically to your account balance.
              </p>
              <button
                onClick={() => setActivePage('dashboard')}
                className="mt-3 flex items-center gap-1.5 text-xs font-medium text-[#58a6ff] transition-colors hover:text-[#79b8ff]"
              >
                <ArrowUpRight className="h-3.5 w-3.5 rotate-180" />
                Back to Dashboard
              </button>
            </div>
          </section>

          {/* Offerwall iframe or login gate */}
          {profile ? (
            <section className="overflow-hidden rounded-2xl border border-[#30363d] bg-[#161b22]">
              {!iframeLoaded && (
                <div className="flex min-h-[800px] flex-col items-center justify-center gap-3">
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#30363d] border-t-[#58a6ff]" />
                  <p className="text-sm text-gray-500">Loading offerwall...</p>
                </div>
              )}
              <iframe
                src={`https://bitcotasks.com/offerwall/2wkOo4xn4nmat99z8yz7jxfbbp/${encodeURIComponent(profile.username)}`}
                onLoad={() => setIframeLoaded(true)}
                className="w-full border-none rounded-2xl"
                style={{ minHeight: '800px', opacity: iframeLoaded ? 1 : 0, transition: 'opacity 0.3s ease' }}
                title="BitcoTasks Offerwall"
                sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-popups-to-escape-sandbox"
              />
            </section>
          ) : (
            <section className="rounded-2xl border border-[#30363d] bg-[#161b22] p-8 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#58a6ff]/10">
                <Lock className="h-7 w-7 text-[#58a6ff]" />
              </div>
              <h2 className="mb-1.5 text-base font-semibold text-white">Please log in to earn rewards</h2>
              <p className="mx-auto max-w-xs text-sm text-gray-400">
                You need an account to start earning from offers. Sign in or register to get started.
              </p>
            </section>
          )}
        </main>
      ) : (
      <main className="relative z-10 mx-auto max-w-2xl px-4 py-5 pb-12 space-y-4">
        {/* Balance Card */}
        <section className="relative overflow-hidden rounded-2xl border border-[#30363d] bg-gradient-to-br from-[#161b22] to-[#0d1117] p-5">
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-[#58a6ff] opacity-[0.06] blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Wallet className="h-4 w-4 text-[#58a6ff]" />
              <span>Available Balance</span>
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-4xl font-bold tracking-tight text-white tabular-nums">
                {formattedBalance}
              </span>
              <span className="text-lg font-semibold text-gray-400">USDT</span>
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
              <ShieldCheck className="h-3.5 w-3.5 text-[#3fb950]" />
              <span>Secured on BEP-20 network</span>
            </div>
            <button
              onClick={openModal}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#3fb950] py-3 font-semibold text-[#0d1117] transition-all hover:bg-[#46c75f] active:scale-[0.98]"
            >
              <ArrowUpRight className="h-5 w-5" />
              Withdraw USDT
            </button>
          </div>
        </section>

        {/* Faucet Card */}
        <section className="rounded-2xl border border-[#30363d] bg-[#161b22] p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#58a6ff]/10">
                <Gift className="h-5 w-5 text-[#58a6ff]" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white">Free Faucet</h2>
                <p className="text-xs text-gray-500">Claim every 12 hours</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 rounded-lg bg-[#0d1117] px-2.5 py-1.5 text-xs font-medium text-gray-400">
              <Zap className="h-3.5 w-3.5 text-[#3fb950]" />
              +{FAUCET_REWARD.toFixed(3)}
            </div>
          </div>

          {/* A-Ads Banner */}
          <div style={{ width: '100%', minHeight: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '12px 0' }}>
            <iframe
              data-aa="2454501"
              src="https://acceptable.a-ads.com/2454501/?size=Adaptive"
              style={{ border: 0, padding: 0, width: '100%', height: '100px', overflow: 'hidden', display: 'block' }}
              title="A-Ads Banner"
            />
          </div>

          <button
            onClick={handleClaim}
            disabled={!claimReady}
            className={`relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl py-3 font-semibold transition-all active:scale-[0.98] ${
              claimReady
                ? 'bg-[#58a6ff] text-[#0d1117] hover:bg-[#79b8ff]'
                : 'cursor-not-allowed bg-[#21262d] text-gray-500'
            }`}
          >
            {claimReady ? (
              <>
                <Sparkles className="h-5 w-5" />
                Claim {FAUCET_REWARD.toFixed(3)} USDT
              </>
            ) : (
              <>
                <Clock className="h-5 w-5" />
                Next claim in: {formatHHMMSS(countdown)}
              </>
            )}
            {!claimReady && (
              <div
                className="absolute bottom-0 left-0 h-1 bg-[#58a6ff]/40 transition-all duration-1000 ease-linear"
                style={{ width: `${((FAUCET_COOLDOWN - countdown) / FAUCET_COOLDOWN) * 100}%` }}
              />
            )}
          </button>
        </section>

        {/* Referral & Offerwall */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Referral Card */}
          <section className="rounded-2xl border border-[#30363d] bg-[#161b22] p-5">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#3fb950]/10">
                <Users className="h-5 w-5 text-[#3fb950]" />
              </div>
              <h2 className="text-base font-semibold text-white">Referral</h2>
            </div>
            <p className="mb-3 text-sm text-gray-400">Share your link to earn 10% of every claim your referrals make.</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 truncate rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-2 text-xs text-gray-400">
                {referralLink}
              </div>
              <button
                onClick={copyReferral}
                className="flex items-center gap-1.5 rounded-lg bg-[#30363d] px-3 py-2 text-xs font-medium text-gray-200 transition-colors hover:bg-[#484f58]"
              >
                {copied ? <Check className="h-4 w-4 text-[#3fb950]" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </section>

          {/* Offerwall Card */}
          <section className="rounded-2xl border border-[#30363d] bg-[#161b22] p-5">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#58a6ff]/10">
                <Store className="h-5 w-5 text-[#58a6ff]" />
              </div>
              <h2 className="text-base font-semibold text-white">Offerwalls</h2>
            </div>
            <p className="mb-3 text-sm text-gray-400">Complete PTC ads, shortlinks, and micro-tasks to earn USDT.</p>
            <button
              onClick={() => setActivePage('earn')}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#58a6ff] py-2.5 text-sm font-semibold text-[#0d1117] transition-all hover:bg-[#79b8ff] active:scale-[0.98]"
            >
              <Store className="h-4 w-4" />
              Browse Offers
            </button>
          </section>
        </div>

        {/* Transaction History */}
        {transactions.length > 0 && (
          <section className="rounded-2xl border border-[#30363d] bg-[#161b22] p-5">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#58a6ff]/10">
                <History className="h-5 w-5 text-[#58a6ff]" />
              </div>
              <h2 className="text-base font-semibold text-white">Transaction History</h2>
            </div>
            <div className="space-y-2">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-center justify-between rounded-lg border border-[#30363d] bg-[#0d1117] px-3 py-2.5"
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                        tx.type === 'claim' ? 'bg-[#3fb950]/10' : 'bg-[#58a6ff]/10'
                      }`}
                    >
                      {tx.type === 'claim' ? (
                        <Gift className="h-4 w-4 text-[#3fb950]" />
                      ) : (
                        <ArrowUpRight className="h-4 w-4 text-[#58a6ff]" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">
                        {tx.type === 'claim' ? 'Faucet Claim' : 'Withdrawal'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(tx.time).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`text-sm font-semibold tabular-nums ${
                      tx.amount > 0 ? 'text-[#3fb950]' : 'text-[#58a6ff]'
                    }`}
                  >
                    {tx.amount > 0 ? '+' : ''}
                    {tx.amount.toFixed(3)} USDT
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Stats Row */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-3 text-center">
            <TrendingUp className="mx-auto mb-1 h-4 w-4 text-[#3fb950]" />
            <p className="text-xs text-gray-500">Total Claimed</p>
            <p className="text-sm font-semibold text-white">{balance.toFixed(3)}</p>
          </div>
          <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-3 text-center">
            <Zap className="mx-auto mb-1 h-4 w-4 text-[#58a6ff]" />
            <p className="text-xs text-gray-500">Per Claim</p>
            <p className="text-sm font-semibold text-white">{FAUCET_REWARD.toFixed(3)}</p>
          </div>
          <div className="rounded-xl border border-[#30363d] bg-[#161b22] p-3 text-center">
            <Clock className="mx-auto mb-1 h-4 w-4 text-gray-500" />
            <p className="text-xs text-gray-500">Cooldown</p>
            <p className="text-sm font-semibold text-white">12h</p>
          </div>
        </div>

        <p className="pt-2 text-center text-xs text-gray-600">
          TaskBite &copy; 2026 — Faucet rewards are for demonstration purposes only.
        </p>
      </main>
      )}

      {/* Ad View Modal */}
      {isAdModalOpen && (
        <div className="fixed inset-0 z-[70] flex flex-col bg-[#0d1117]">
          {/* Top Bar */}
          <div className="flex items-center justify-between gap-3 border-b border-[#30363d] bg-[#161b22] px-4 py-3">
            <div className="flex items-center gap-2 text-sm text-gray-300">
              <Clock className="h-4 w-4 text-[#58a6ff]" />
              <span>
                Please view the sponsor page for 30s to claim your reward
                ({adCountdown}s remaining)
              </span>
            </div>
            <button
              onClick={completeAdClaim}
              disabled={adCountdown > 0}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
                adCountdown > 0
                  ? 'cursor-not-allowed bg-[#21262d] text-gray-500'
                  : 'bg-[#3fb950] text-[#0d1117] hover:bg-[#46c75f] active:scale-[0.98]'
              }`}
            >
              {adCountdown > 0 ? (
                <>
                  <Clock className="h-4 w-4" />
                  {adCountdown}s
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Complete & Claim
                </>
              )}
            </button>
          </div>

          {/* Sponsor iframe */}
          <div className="relative flex-1 overflow-hidden">
            <iframe
              src={AD_URL}
              className="w-full h-full border-none"
              sandbox="allow-scripts allow-same-origin allow-popups"
              title="Sponsor Ad"
            />
            {adCountdown > 0 && (
              <div
                className="absolute bottom-0 left-0 h-1 bg-[#3fb950] transition-all duration-1000 ease-linear"
                style={{ width: `${((AD_VIEW_DURATION - adCountdown) / AD_VIEW_DURATION) * 100}%` }}
              />
            )}
          </div>
        </div>
      )}

      {/* Withdrawal Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center"
          onClick={closeModal}
        >
          <div
            className="w-full max-w-md rounded-t-3xl border border-[#30363d] bg-[#161b22] p-5 shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#3fb950]/10">
                  <Wallet className="h-5 w-5 text-[#3fb950]" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-white">Withdraw USDT</h2>
                  <p className="text-xs text-gray-500">Available: {formattedBalance} USDT</p>
                </div>
              </div>
              <button
                onClick={closeModal}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-[#30363d] hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Method Selector - 3 Options */}
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-medium text-gray-400">Withdrawal Method</label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(WITHDRAW_RULES) as WithdrawMethod[]).map((m) => {
                  const rule = WITHDRAW_RULES[m];
                  const Icon = rule.icon;
                  return (
                    <button
                      key={m}
                      onClick={() => { setMethod(m); setAmount(''); }}
                      className={`rounded-xl border py-3 px-1 text-center transition-all ${
                        method === m
                          ? 'border-[#58a6ff] bg-[#58a6ff]/10 text-white'
                          : 'border-[#30363d] bg-[#0d1117] text-gray-400 hover:text-white'
                      }`}
                    >
                      <Icon className="mx-auto mb-1 h-4 w-4" />
                      <span className="block text-[11px] font-semibold leading-tight">
                        {m === 'faucetpay' ? 'FaucetPay' : m === 'binance' ? 'Binance Pay' : 'Direct Wallet'}
                      </span>
                      <span className="block text-[9px] text-gray-500 leading-tight">
                        {rule.currency}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Destination Input */}
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-medium text-gray-400">
                {WITHDRAW_RULES[method].label}
              </label>
              <input
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder={WITHDRAW_RULES[method].placeholder}
                className="w-full rounded-xl border border-[#30363d] bg-[#0d1117] px-3 py-3 text-sm text-white placeholder-gray-600 outline-none transition-colors focus:border-[#58a6ff]"
              />
            </div>

            {/* Amount Input */}
            <div className="mb-3">
              <label className="mb-1.5 block text-xs font-medium text-gray-400">Amount (USDT)</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.001"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.000"
                  className="w-full rounded-xl border border-[#30363d] bg-[#0d1117] px-3 py-3 pr-16 text-sm text-white placeholder-gray-600 outline-none transition-colors focus:border-[#58a6ff]"
                />
                <button
                  onClick={setMaxAmount}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-[#30363d] px-3 py-1.5 text-xs font-bold text-[#58a6ff] transition-colors hover:bg-[#484f58]"
                >
                  MAX
                </button>
              </div>
            </div>

            {/* Method Rules & Helper Note */}
            <div className="mb-4 rounded-xl border border-[#30363d] bg-[#0d1117] p-3">
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <AlertCircle className="h-3.5 w-3.5" />
                <span>{WITHDRAW_RULES[method].note}</span>
              </div>
            </div>

            {/* Submit Button - disabled if balance below method minimum */}
            <button
              onClick={handleWithdraw}
              disabled={submitting || balance < WITHDRAW_RULES[method].min}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#3fb950] py-3 font-semibold text-[#0d1117] transition-all hover:bg-[#46c75f] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#0d1117] border-t-transparent" />
                  Processing...
                </>
              ) : (
                <>
                  <ArrowUpRight className="h-5 w-5" />
                  Request Withdrawal
                </>
              )}
            </button>

            {/* Security Notice */}
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-3 py-2.5">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-yellow-500" />
              <p className="text-xs text-yellow-500/90">
                Note: For security and verification, withdrawals are processed within 7 business days.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 animate-[slideUp_0.3s_ease-out]">
          <div
            className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 shadow-2xl ${
              toast.type === 'success'
                ? 'border-[#3fb950]/30 bg-[#161b22] text-[#3fb950]'
                : 'border-red-500/30 bg-[#161b22] text-red-400'
            }`}
          >
            {toast.type === 'success' ? (
              <Check className="h-5 w-5 flex-shrink-0" />
            ) : (
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
            )}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translate(-50%, 20px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
    </div>
  );
}

export default App;
