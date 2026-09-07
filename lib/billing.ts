export type PlanKey = "basic" | "pro" | "agency";

export type BillingPlan = {
  key: PlanKey;
  name: string;
  priceLabel: string;
  priceCents: number;
  stripePriceId: string;
  description: string;
};

export const PLANS: BillingPlan[] = [
  {
    key: "basic",
    name: "Basic",
    priceLabel: "R$ 29,90",
    priceCents: 2990,
    stripePriceId: "price_1UD3IGIqQGOYRjC48BDLcoOg",
    description: "Automação de cortes para começar no ClipIA.",
  },
  {
    key: "pro",
    name: "Pro",
    priceLabel: "R$ 59,00",
    priceCents: 5900,
    stripePriceId: "price_1UD3IOIqQGOYRjC43O7gS5V0",
    description: "Automação avançada para quem publica com frequência.",
  },
  {
    key: "agency",
    name: "Agency",
    priceLabel: "R$ 149,00",
    priceCents: 14900,
    stripePriceId: "price_1UD3IZIqQGOYRjC44fIVBv7Y",
    description: "Plano para agências e maior volume de automações.",
  },
];

export function getPlan(key: string | null | undefined) {
  return PLANS.find((plan) => plan.key === key) ?? null;
}

export function getPlanByPriceId(priceId: string | null | undefined) {
  return PLANS.find((plan) => plan.stripePriceId === priceId) ?? null;
}
