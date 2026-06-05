// Supabase Edge Function — stripe-webhook
// Handles Stripe webhook events to add credits after a successful payment.
//
// Required secrets (set via: supabase secrets set KEY=value):
//   STRIPE_SECRET_KEY      — your Stripe secret key
//   STRIPE_WEBHOOK_SECRET  — webhook signing secret from the Stripe dashboard
//
// Register this URL in the Stripe Dashboard → Developers → Webhooks:
//   https://<project-ref>.supabase.co/functions/v1/stripe-webhook
//   Events to listen for: checkout.session.completed

import Stripe from 'npm:stripe@14';
import { createClient } from 'npm:@supabase/supabase-js@2';

// Mirror of stripe-checkout CREDIT_PACKS. Credits are derived from pack_id on
// the server — never trusted from session metadata, which originates client-side
// when the checkout session is created.
const CREDIT_PACKS: Record<string, { name: string; totalCredits: number }> = {
  basic: { name: 'Basic Pack', totalCredits: 12 },
  pro:   { name: 'Pro Pack',   totalCredits: 30 },
  power: { name: 'Power Pack', totalCredits: 75 },
};

Deno.serve(async (req) => {
  const stripeKey     = Deno.env.get('STRIPE_SECRET_KEY');
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  const supabaseUrl   = Deno.env.get('SUPABASE_URL')!;
  const serviceKey    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  if (!stripeKey || !webhookSecret) {
    console.error('STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET is not set');
    return new Response('Payment system not configured', { status: 500 });
  }

  // ── Verify Stripe signature ─────────────────────────────────────────────────
  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return new Response('Missing stripe-signature header', { status: 400 });
  }

  const body = await req.text();
  const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed');
    return new Response('Invalid signature', { status: 400 });
  }

  // ── Handle checkout.session.completed ──────────────────────────────────────
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;

    // Guard: only process fully paid sessions (not awaiting payment)
    if (session.payment_status !== 'paid') {
      console.log(`Session ${session.id} payment_status=${session.payment_status} — skipping`);
      return new Response('OK', { status: 200 });
    }

    const userId = session.client_reference_id;
    const packId = session.metadata?.pack_id ?? '';

    if (!userId) {
      console.error(`Session ${session.id}: missing client_reference_id`);
      return new Response('Missing client_reference_id', { status: 400 });
    }

    // Derive credits from the server-side pack table, not from metadata. The
    // metadata.total_credits field is set when the checkout session is created
    // and must not be trusted as the source of truth for how many credits to grant.
    const pack = CREDIT_PACKS[packId];
    if (!pack) {
      console.error(`Session ${session.id}: unknown or missing pack_id "${packId}"`);
      return new Response('Unknown pack_id', { status: 400 });
    }
    const totalCredits = pack.totalCredits;
    const packName     = pack.name;

    const supabase = createClient(supabaseUrl, serviceKey);
    const { error } = await supabase.rpc('add_credits', {
      p_user_id:    userId,
      p_amount:     totalCredits,
      p_description: `Purchased ${packName} — ${totalCredits} credits (session: ${session.id})`,
    });

    if (error) {
      console.error(`Failed to add ${totalCredits} credits for user ${userId}:`, error);
      // Return 500 so Stripe retries the webhook
      return new Response('Failed to add credits', { status: 500 });
    }

    console.log(`Added ${totalCredits} credits to user ${userId} (session: ${session.id})`);
  }

  // Acknowledge all other event types
  return new Response('OK', { status: 200 });
});
