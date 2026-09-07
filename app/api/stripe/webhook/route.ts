import { createHmac, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type StripeEvent = {
  type: string;
  data: { object: Record<string, any> };
};

type StripeSubscription = {
  id: string;
  customer?: string;
  status?: string;
  current_period_end?: number;
  cancel_at_period_end?: boolean;
  items?: { data?: Array<{ price?: { id?: string } }> };
};

function verifyStripeSignature(payload: string, signatureHeader: string, secret: string) {
  const parts = signatureHeader.split(",").map((part) => part.trim());
  const timestamp = parts.find((part) => part.startsWith("t="))?.slice(2);
  const signatures = parts.filter((part) => part.startsWith("v1=")).map((part) => part.slice(3));
  if (!timestamp || signatures.length === 0) return false;

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");

  return signatures.some((candidate) => {
    try {
      const candidateBuffer = Buffer.from(candidate, "hex");
      return candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer);
    } catch {
      return false;
    }
  });
}

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error("Supabase admin não configurado.");
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } });
}

async function retrieveStripeSubscription(subscriptionId: string): Promise<StripeSubscription> {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) throw new Error("STRIPE_SECRET_KEY não configurada.");

  const response = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error?.message ?? "Falha ao consultar assinatura na Stripe.");
  return data as StripeSubscription;
}

function subscriptionRow(subscription: StripeSubscription) {
  return {
    stripe_customer_id: typeof subscription.customer === "string" ? subscription.customer : null,
    stripe_subscription_id: subscription.id,
    stripe_price_id: subscription.items?.data?.[0]?.price?.id ?? null,
    status: subscription.status ?? "inactive",
    current_period_end: subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null,
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    updated_at: new Date().toISOString(),
  };
}

export async function POST(request: NextRequest) {
  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) return NextResponse.json({ error: "Webhook não configurado." }, { status: 503 });

    const signature = request.headers.get("stripe-signature") ?? "";
    const payload = await request.text();
    if (!verifyStripeSignature(payload, signature, webhookSecret)) {
      return NextResponse.json({ error: "Assinatura do webhook inválida." }, { status: 400 });
    }

    const event = JSON.parse(payload) as StripeEvent;
    const supabase = getAdminSupabase();

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const userId = typeof session.client_reference_id === "string" ? session.client_reference_id : null;
      const subscriptionId = typeof session.subscription === "string" ? session.subscription : null;

      if (userId && subscriptionId) {
        const subscription = await retrieveStripeSubscription(subscriptionId);
        const { error } = await supabase.from("subscriptions").upsert(
          { user_id: userId, ...subscriptionRow(subscription) },
          { onConflict: "user_id" },
        );
        if (error) throw error;
      }
    }

    if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as unknown as StripeSubscription;
      if (subscription.id) {
        const { error } = await supabase
          .from("subscriptions")
          .update(subscriptionRow(subscription))
          .eq("stripe_subscription_id", subscription.id);
        if (error) throw error;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro no webhook da Stripe.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
