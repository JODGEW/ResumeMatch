import client from './client';

export type CheckoutPlan = 'pro_monthly' | 'pro_sprint';

export interface CheckoutSessionResponse {
  checkoutUrl: string;
  sessionId: string;
}

export async function createCheckoutSession(plan: CheckoutPlan): Promise<CheckoutSessionResponse> {
  const { data } = await client.post<CheckoutSessionResponse>('/checkout/create-session', { plan });
  return data;
}
