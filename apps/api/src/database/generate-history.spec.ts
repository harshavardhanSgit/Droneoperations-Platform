import { generateHistoryPlan, HISTORY_TARGETS, type GenCatalogue } from './generate-history';

const NOW = new Date('2026-08-06T09:00:00.000Z').getTime();

const catalogue: GenCatalogue = {
  serviceTypeId: 'st-crop-spraying',
  customers: [
    { organisationId: 'cust-fpo', userId: 'u-fpo', membershipId: 'm-fpo' },
    { organisationId: 'cust-farmer', userId: 'u-farmer', membershipId: 'm-farmer' },
  ],
  providers: [
    {
      providerId: 'p-kisan',
      offeringId: 'o-kisan',
      minQuantity: 5,
      districts: [
        { id: 'a-warangal', weight: 1.7 },
        { id: 'a-karimnagar', weight: 1.1 },
      ],
    },
    {
      providerId: 'p-godavari',
      offeringId: 'o-godavari',
      minQuantity: 10,
      districts: [{ id: 'a-guntur', weight: 1.5 }],
    },
    {
      providerId: 'p-deccan',
      offeringId: 'o-deccan',
      minQuantity: 3,
      districts: [
        { id: 'a-nashik', weight: 1.4 },
        { id: 'a-solapur', weight: 0.9 },
      ],
    },
  ],
};

const providerIds = catalogue.providers.map((p) => p.providerId);
const offeringIds = catalogue.providers.map((p) => p.offeringId);
const areaIds = catalogue.providers.flatMap((p) => p.districts.map((d) => d.id));

describe('generateHistoryPlan — deterministic operating history', () => {
  it('produces the configured story sizes', () => {
    const plan = generateHistoryPlan(catalogue, 2026, NOW);

    expect(plan.bookings).toHaveLength(
      HISTORY_TARGETS.completed + HISTORY_TARGETS.cancelled + HISTORY_TARGETS.inFlight,
    );
    expect(plan.bookings.filter((b) => b.status === 'COMPLETED')).toHaveLength(HISTORY_TARGETS.completed);
    expect(plan.bookings.filter((b) => b.status === 'CANCELLED')).toHaveLength(HISTORY_TARGETS.cancelled);
    expect(plan.bookings.filter((b) => b.status === 'IN_FLIGHT')).toHaveLength(HISTORY_TARGETS.inFlight);
  });

  it('is deterministic: the same seed and catalogue reproduce the same story', () => {
    const a = generateHistoryPlan(catalogue, 2026, NOW);
    const b = generateHistoryPlan(catalogue, 2026, NOW);

    expect(a).toEqual(b);
  });

  it('a different seed changes the story', () => {
    const a = generateHistoryPlan(catalogue, 2026, NOW);
    const b = generateHistoryPlan(catalogue, 7, NOW);

    expect(a.bookings).not.toEqual(b.bookings);
  });

  it('every intent honours the marketplace invariants', () => {
    const plan = generateHistoryPlan(catalogue, 2026, NOW);

    for (const booking of plan.bookings) {
      expect(providerIds).toContain(booking.providerId);
      expect(offeringIds).toContain(booking.offeringId);
      expect(areaIds).toContain(booking.areaId);

      const provider = catalogue.providers.find((p) => p.providerId === booking.providerId)!;
      expect(booking.quantity).toBeGreaterThanOrEqual(provider.minQuantity);
      expect(booking.quantity).toBeLessThanOrEqual(60);

      // Booked strictly before serviced, and never more than a year ago.
      expect(booking.bookedDaysAgo).toBeGreaterThan(booking.serviceDaysAgo);
      expect(booking.serviceDaysAgo).toBeGreaterThanOrEqual(0);
      expect(booking.bookedDaysAgo).toBeLessThanOrEqual(365 + 14);

      if (booking.status === 'COMPLETED') {
        expect(booking.finalQuantity).toBeDefined();
        expect(booking.finalQuantity!).toBeGreaterThanOrEqual(1);
        expect(booking.finalQuantity!).toBeLessThanOrEqual(booking.quantity);
      }

      if (booking.paid || booking.rating || booking.comment) {
        expect(booking.status).toBe('COMPLETED');
      }

      if (booking.status === 'CANCELLED') {
        expect(booking.reason).toBeDefined();
      }

      if (booking.status === 'IN_FLIGHT') {
        expect(['ASSIGNED', 'SCHEDULED', 'AWAITING_CONFIRMATION']).toContain(booking.inFlightStage);
      }
    }
  });

  it('keeps the kharif season dominant among service dates', () => {
    const plan = generateHistoryPlan(catalogue, 2026, NOW);

    // Acceptance sampling keeps ~45% of non-kharif months: June–October
    // should still account for well over half of all service dates.
    const serviceMonths = plan.bookings.map((b) => {
      const d = new Date(NOW - b.serviceDaysAgo * 86_400_000);
      return d.getMonth() + 1;
    });
    const kharif = serviceMonths.filter((m) => m >= 6 && m <= 10).length;

    expect(kharif).toBeGreaterThan(serviceMonths.length / 2);
  });

  it('returns an empty plan when the marketplace is empty', () => {
    expect(
      generateHistoryPlan({ serviceTypeId: 'st', providers: [], customers: [] }, 2026, NOW),
    ).toEqual({ bookings: [] });
  });
});
