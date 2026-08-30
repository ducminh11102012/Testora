/**
 * Payments.
 *
 * Credits are the unit of account: a paper costs credits, and credits arrive
 * either from an access code a centre issues or from an order. Only the manual
 * provider is wired up — a gateway is a matter of implementing `start` and
 * `confirm` here and pointing a webhook at `confirm`, with no changes anywhere
 * else in the app.
 */

import { orders, users } from './db';
import { OrderRow } from '@/types/db';

export interface PaymentProvider {
  name: string;
  /** Creates the order and returns where to send the payer, if anywhere. */
  start(input: { userId: string; credits: number; amountMinor: number; description: string }):
  Promise<{ order: OrderRow; redirectUrl?: string }>;
  /** Called by a webhook, or by an administrator for a bank transfer. */
  confirm(orderId: string, reference?: string): Promise<{ ok: boolean; credits: number }>;
}

/** Bank transfer or cash: an administrator marks the order paid. */
export const manualProvider: PaymentProvider = {
  name: 'manual',
  async start({ userId, credits, amountMinor, description }) {
    const order = orders.create({ userId, credits, amountMinor, description, provider: 'manual' });
    return { order };
  },
  async confirm(orderId, reference) {
    const order = orders.byId(orderId);
    if (!order || order.status === 'paid') return { ok: false, credits: 0 };
    orders.setStatus(order.id, 'paid', reference);
    users.addCredits(order.userId, order.credits);
    return { ok: true, credits: order.credits };
  },
};

const PROVIDERS: Record<string, PaymentProvider> = { manual: manualProvider };

export function paymentProvider(): PaymentProvider {
  return PROVIDERS[process.env.PAYMENT_PROVIDER ?? 'manual'] ?? manualProvider;
}

/** Credit bundles offered to self-serve learners. Prices are in minor units. */
export const CREDIT_PACKS = [
  { credits: 1, amountMinor: 49_000, label: 'Single paper' },
  { credits: 5, amountMinor: 199_000, label: '5 papers' },
  { credits: 20, amountMinor: 690_000, label: '20 papers' },
];
