import React, { useState } from 'react';
import { CreditCard, ExternalLink } from 'lucide-react';
import { CREDIT_PACKS, formatCurrency } from '../../lib/utils';
import { createCheckoutSession } from '../../lib/supabase-client';
import { useSidebar } from '../context';

export const CreditsView: React.FC = () => {
  const { credits, setView, setError } = useSidebar();
  const [loadingPack, setLoadingPack] = useState<string | null>(null);
  const [checkoutOpened, setCheckoutOpened] = useState(false);

  async function handleBuy(packId: string) {
    setLoadingPack(packId);
    setError('');
    try {
      const returnUrl = window.location.href;
      const { url, error } = await createCheckoutSession(packId, returnUrl);
      if (error || !url) {
        setError(error ?? 'Failed to start checkout. Please try again.');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
      setCheckoutOpened(true);
    } catch (err) {
      setError('Failed to start checkout. Please try again.');
    } finally {
      setLoadingPack(null);
    }
  }

  return (
    <div className="space-y-4">
      <button onClick={() => setView('main')} className="text-sm text-slate-500 hover:text-slate-700">
        &larr; Back
      </button>

      {credits && (
        <div className="rounded-xl border border-primary/10 bg-primary/5 p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-primary/70 mb-0.5">
              Current Balance
            </p>
            <p className="text-2xl font-bold text-slate-900">{credits.remaining} <span className="text-sm font-medium text-slate-500">credits</span></p>
          </div>
          <p className="text-sm text-slate-500">{credits.used} used</p>
        </div>
      )}

      {checkoutOpened && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">
          Checkout opened in a new tab. Your credits will appear here once payment is complete.
        </div>
      )}

      <div className="space-y-3">
        {CREDIT_PACKS.map(pack => (
          <div
            key={pack.id}
            className="relative rounded-xl border border-slate-100 bg-white p-4 shadow-sm hover:shadow-md transition-shadow"
          >
            {pack.popular && (
              <span className="absolute -top-2 left-4 px-2 py-0.5 rounded-full bg-primary text-white text-sm font-bold uppercase tracking-wide">
                Popular
              </span>
            )}
            {pack.bestValue && (
              <span className="absolute -top-2 left-4 px-2 py-0.5 rounded-full bg-emerald-500 text-white text-sm font-bold uppercase tracking-wide">
                Best Value
              </span>
            )}

            <div className="flex items-start justify-between mb-2">
              <h4 className="font-bold text-slate-900">{pack.name}</h4>
              <span className="text-xl font-bold text-primary">{formatCurrency(pack.price)}</span>
            </div>
            <p className="text-sm text-slate-500 mb-3">
              {pack.baseCredits} credits + {pack.bonusCredits} bonus ={' '}
              <strong className="text-slate-700">{pack.totalCredits} total</strong>
            </p>

            <button
              onClick={() => handleBuy(pack.id)}
              disabled={loadingPack !== null}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loadingPack === pack.id ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Opening checkout...
                </>
              ) : (
                <>
                  <CreditCard size={13} />
                  Buy Now
                  <ExternalLink size={11} className="opacity-70" />
                </>
              )}
            </button>
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-400 text-center">
        Secure payment via Stripe. Credits are added instantly after payment.
      </p>
    </div>
  );
};
