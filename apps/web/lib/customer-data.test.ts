import { bhd, bidCustomerFrom, customerOverview, newCustomerProfile } from '@sahel/domain';
import { describe, expect, it } from 'vitest';

// An expired session takes the customer's data in every sandbox store with it (lib/customer-data.ts), and dealers stop
// seeing the open "Bid For Me" request of a customer who is gone.
describe('purgeCustomerData', () => {
  it('forgets payments, bid requests, offers, notification state and assistant memory of one customer only', async () => {
    const { payments } = await import('./api');
    const { bidStore } = await import('./bids-store');
    const { tradeInStore } = await import('./tradein-store');
    const { notificationStore } = await import('./notifications-store');
    const { assistant } = await import('./assistant-store');
    const { purgeCustomerData } = await import('./customer-data');

    const gone = 'cus_sbx_purge_gone';
    const kept = 'cus_sbx_purge_kept';
    const request = (id: string) =>
      bidStore.post(bidCustomerFrom(customerOverview(newCustomerProfile(id))), {
        bodyType: 'suv',
        condition: 'any',
        maxMonthlyFils: bhd(300),
        structure: 'murabaha',
        tenureMonths: 60,
        downPaymentFils: bhd(3_000),
        insurance: 'takaful',
      });
    for (const owner of [gone, kept]) {
      await payments.createCharge(
        { amountFils: bhd(100), method: 'benefitpay', purpose: 'reservation_deposit', reference: 'v-honda-city-2026', idempotencyKey: `key-${owner}-xxxx` },
        owner,
      );
      tradeInStore.value(owner, { make: 'Toyota', model: 'Camry', year: 2021, mileageKm: 60_000, condition: 'good', accidentHistory: false });
      notificationStore.markRead(owner, ['x.1']);
      assistant.conversations.append(owner, { role: 'user', text: 'hello', at: new Date().toISOString() });
    }
    const goneRequest = request(gone);
    const keptRequest = request(kept);
    expect(bidStore.openForDealer('nmc').map((r) => r.id)).toEqual(expect.arrayContaining([goneRequest.id, keptRequest.id]));

    purgeCustomerData(gone);

    expect(payments.list(gone)).toEqual([]);
    expect(payments.list(kept)).toHaveLength(1);
    expect(tradeInStore.active(gone)).toBeUndefined();
    expect(tradeInStore.active(kept)).toBeDefined();
    expect(notificationStore.state(gone).isRead('x.1')).toBe(false);
    expect(notificationStore.state(kept).isRead('x.1')).toBe(true);
    expect(assistant.conversations.history(gone)).toEqual([]);
    expect(assistant.conversations.history(kept)).toHaveLength(1);
    const visible = bidStore.openForDealer('nmc').map((r) => r.id);
    expect(visible).not.toContain(goneRequest.id);
    expect(visible).toContain(keptRequest.id);
  });
});
