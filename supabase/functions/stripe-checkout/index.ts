// Supabase Edge Function — stripe-checkout
// Creates a Stripe Checkout Session and returns the hosted payment URL.
//
// Required secrets (set via: supabase secrets set KEY=value):
//   STRIPE_SECRET_KEY  — your Stripe secret key
//
// The function:
//   1. Validates the caller's JWT (Supabase Auth)
//   2. Creates or reuses a Stripe Customer for the user
//   3. Creates a Checkout Session for the selected credit pack
//   4. Returns { url } for the frontend to open in a new tab

import Stripe from 'npm:stripe@14';
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Mirror of src/lib/utils.ts CREDIT_PACKS — price is in cents (USD)
const CREDIT_PACKS: Record<string, { name: string; totalCredits: number; priceCents: number }> = {
  basic: { name: 'Basic Pack',  totalCredits: 12, priceCents: 499  },
  pro:   { name: 'Pro Pack',    totalCredits: 30, priceCents: 999  },
  power: { name: 'Power Pack',  totalCredits: 75, priceCents: 1999 },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // ── Auth ────────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Missing authorization header' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey     = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const stripeKey   = Deno.env.get('STRIPE_SECRET_KEY');

  if (!stripeKey) {
    console.error('STRIPE_SECRET_KEY is not set');
    return json({ error: 'Payment system not configured' }, 500);
  }

  const supabaseUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
  if (authError || !user) {
    return json({ error: 'Unauthorized' }, 401);
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let packId: string;
  let returnUrl: string;
  try {
    const body = await req.json();
    packId    = body.packId;
    returnUrl = body.returnUrl;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const pack = CREDIT_PACKS[packId];
  if (!pack) {
    return json({ error: `Unknown pack: ${packId}` }, 400);
  }

  // Validate returnUrl — must be https to prevent open-redirect abuse
  try {
    const parsed = new URL(returnUrl);
    if (parsed.protocol !== 'https:') throw new Error('not https');
  } catch {
    return json({ error: 'returnUrl must be a valid https URL' }, 400);
  }

  // ── Stripe customer (create once, reuse on repeat purchases) ────────────────
  const stripe         = new Stripe(stripeKey, { apiVersion: '2024-06-20' });
  const supabaseAdmin  = createClient(supabaseUrl, serviceKey);

  const { data: creditsRow } = await supabaseAdmin
    .from('credits')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .single();

  let customerId = (creditsRow?.stripe_customer_id as string | null) ?? null;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;
    await supabaseAdmin
      .from('credits')
      .update({ stripe_customer_id: customerId })
      .eq('user_id', user.id);
  }

  // ── Create Checkout Session ─────────────────────────────────────────────────
  const session = await stripe.checkout.sessions.create({
    customer:              customerId,
    client_reference_id:   user.id,
    payment_method_types:  ['card'],
    mode:                  'payment',
    line_items: [
      {
        price_data: {
          currency:     'usd',
          unit_amount:  pack.priceCents,
          product_data: {
            name:        `Resume Optimizer — ${pack.name}`,
            description: `${pack.totalCredits} optimization credits`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: {
      pack_id:       packId,
      total_credits: String(pack.totalCredits),
      pack_name:     pack.name,
    },
    // success_url gets ?payment_status=success so the extension sidebar
    // can detect the query param and refresh the credit balance.
    success_url: `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}payment_status=success`,
    cancel_url:  returnUrl,
  });

  return json({ url: session.url });
});

function json(data: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
