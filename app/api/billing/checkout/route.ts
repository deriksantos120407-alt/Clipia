import { NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase";
import { getPlan } from "../../../../lib/billing";

const PAYMENT_LINKS = {
  basic: process.env.STRIPE_PAYMENT_LINK_BASIC,
  pro: process.env.STRIPE_PAYMENT_LINK_PRO,
  agency: process.env.STRIPE_PAYMENT_LINK_AGENCY,
} as const;

export async function GET(request: NextRequest) {
  const plan = getPlan(request.nextUrl.searchParams.get("plan"));
  if (!plan) return NextResponse.json({ error: "Plano inválido." }, { status: 400 });

  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Faça login antes de assinar." }, { status: 401 });

  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.email) {
    return NextResponse.json({ error: "Sessão inválida. Entre novamente." }, { status: 401 });
  }

  const paymentLink = PAYMENT_LINKS[plan.key];
  if (!paymentLink) {
    return NextResponse.json({ error: "Checkout aguardando liberação da Stripe." }, { status: 503 });
  }

  const checkoutUrl = new URL(paymentLink);
  checkoutUrl.searchParams.set("prefilled_email", data.user.email);
  return NextResponse.json({ url: checkoutUrl.toString() });
}
