import client from './client';

// 'pro_founding_sprint' → founding $19.99 Stripe Price (through 2026-10-31);
// 'pro_sprint' → standard $24.99 Price (switch back to it after the deadline).
export type CheckoutPlan = 'pro_monthly' | 'pro_sprint' | 'pro_founding_sprint';

export interface CheckoutSessionResponse {
  checkoutUrl: string;
  sessionId: string;
}

export async function createCheckoutSession(plan: CheckoutPlan): Promise<CheckoutSessionResponse> {
  const { data } = await client.post<CheckoutSessionResponse>('/checkout/create-session', { plan });
  return data;
}
