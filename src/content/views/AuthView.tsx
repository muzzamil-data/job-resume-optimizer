import React, { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { signIn, signUp } from '../../lib/supabase-client';
import { useSidebar } from '../context';

export const AuthView: React.FC = () => {
  const { handleAuth } = useSidebar();

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authError, setAuthError] = useState('');
  const [signupSuccess, setSignupSuccess] = useState(false);

  const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary';

  const handleSubmit = async () => {
    if (!email || !password) { setAuthError('Please enter your email and password.'); return; }
    if (mode === 'signup' && password.length < 8) {
      setAuthError('Password must be at least 8 characters.');
      return;
    }
    setIsSubmitting(true);
    setAuthError('');

    if (mode === 'login') {
      const { user, error } = await signIn(email, password);
      if (error || !user) { setAuthError(error || 'Login failed. Please try again.'); }
      else { handleAuth(user); }
    } else {
      const { user, error } = await signUp(email, password);
      if (error) { setAuthError(error); }
      else if (user) { handleAuth(user); }
      else { setSignupSuccess(true); }
    }
    setIsSubmitting(false);
  };

  if (signupSuccess) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-6">
        <CheckCircle2 size={36} className="text-emerald-500" />
        <p className="text-base font-bold text-slate-800">Check your email</p>
        <p className="text-sm text-slate-500">We sent a confirmation link to <strong>{email}</strong>. Click it and then come back to sign in.</p>
        <button onClick={() => { setSignupSuccess(false); setMode('login'); }} className="text-sm text-primary font-medium hover:underline">Back to Sign In</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-bold text-slate-900 mb-1">
          {mode === 'login' ? 'Sign In' : 'Create Account'}
        </h3>
        <p className="text-sm text-slate-500">
          {mode === 'login' ? 'Sign in to use your credits and optimize resumes.' : 'Sign up for free \u2014 get 100 credits to start.'}
        </p>
      </div>

      <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm space-y-3">
        <div>
          <label htmlFor="auth-email" className="block text-xs font-semibold text-slate-600 mb-1">Email</label>
          <input id="auth-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className={inputCls} autoComplete="email" />
        </div>
        <div>
          <label htmlFor="auth-password" className="block text-xs font-semibold text-slate-600 mb-1">Password</label>
          <input id="auth-password" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" className={inputCls}
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </div>

        {authError && <p role="alert" className="text-xs text-red-600">{authError}</p>}

        <button
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="w-full py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {isSubmitting ? 'Please wait\u2026' : mode === 'login' ? 'Sign In' : 'Create Account'}
        </button>
      </div>

      <p className="text-center text-sm text-slate-500">
        {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
        <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setAuthError(''); }}
          className="text-primary font-medium hover:underline"
        >
          {mode === 'login' ? 'Sign up free' : 'Sign in'}
        </button>
      </p>
    </div>
  );
};
