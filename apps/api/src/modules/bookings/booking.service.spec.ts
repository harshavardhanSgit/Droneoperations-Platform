import { Test } from '@nestjs/testing';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { OfferingRepository } from '../offerings/offering.repository';
import { ProviderRepository } from '../organisations/provider.repository';
import type { ActorContext } from '../identity/actor-context';
import { BookingRepository } from './booking.repository';
import { BookingService } from './booking.service';

/**
 * No database, no HTTP, no Nest lifecycle — every dependency is a plain object.
 *
 * This is the concrete payoff of constructor injection: BookingService never
 * constructs its own collaborators, so a test can hand it whatever it likes.
 * A service that did `new PrismaClient()` internally could only be tested with
 * a real database running.
 */
const customer: ActorContext = {
  userId: 'user-1',
  membershipId: 'mem-1',
  organisationId: 'cust-org',
  organisationKind: 'CUSTOMER',
  role: 'OWNER',
  principalOrganisationId: 'cust-org',
};

// principalOrganisationId must move too. Leaving it as the customer's makes
// requireParty classify this actor as the CUSTOMER — a fixture that lies about
// who is acting will pass tests that should fail.
const provider: ActorContext = {
  ...customer,
  organisationKind: 'PROVIDER',
  organisationId: 'prov-org',
  principalOrganisationId: 'prov-org',
};

const offering = (overrides: Record<string, unknown> = {}) => ({
  id: 'off-1',
  providerId: 'prov-1',
  serviceTypeId: 'svc-spray',
  status: 'ACTIVE',
  versions: [{ id: 'ver-1', unitPriceMinor: 52000, pricingUnit: 'PER_ACRE', minQuantity: 5 }],
  areas: [{ area: { id: 'area-warangal' } }],
  ...overrides,
});

const booking = (overrides: Record<string, unknown> = {}) => ({
  id: 'bk-1',
  customerOrganisationId: 'cust-org',
  status: 'UNASSIGNED',
  version: 0,
  serviceTypeId: 'svc-spray',
  areaId: 'area-warangal',
  quantity: 20,
  assignments: [],
  schedules: [],
  ...overrides,
});

describe('BookingService business rules', () => {
  let service: BookingService;
  // Explicit mock shapes: jest.Mocked<Partial<T>> keeps the REAL signatures
  // (just optional), so `.mockResolvedValue` would not exist on them.
  let bookings: { findById: jest.Mock; findPendingSchedule: jest.Mock };
  let offerings: { findById: jest.Mock };
  let providers: { findById: jest.Mock; findByOrganisation: jest.Mock };

  beforeEach(async () => {
    bookings = { findById: jest.fn(), findPendingSchedule: jest.fn() };
    offerings = { findById: jest.fn() };
    providers = { findById: jest.fn(), findByOrganisation: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        BookingService,
        { provide: PrismaService, useValue: { $transaction: jest.fn() } },
        { provide: BookingRepository, useValue: bookings },
        { provide: OfferingRepository, useValue: offerings },
        { provide: ProviderRepository, useValue: providers },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(BookingService);
  });

  const expectCode = async (work: Promise<unknown>, code: string) => {
    await expect(work).rejects.toMatchObject({ code });
  };

  it('BR17 — a provider cannot book services at all', async () => {
    await expectCode(
      service.create(provider, {
        serviceTypeId: 'svc-spray',
        areaId: 'area-warangal',
        quantity: 20,
        preferredDate: '2026-09-01',
        preferredWindow: 'DAWN' as never,
      }),
      'ACCESS_DENIED',
    );
  });

  it('BR1 — an offering from a provider who is not ACTIVATED is unbookable', async () => {
    bookings.findById.mockResolvedValue(booking() as never);
    offerings.findById.mockResolvedValue(offering() as never);
    providers.findById.mockResolvedValue({ id: 'prov-1', stage: 'UNDER_REVIEW' } as never);

    await expectCode(service.assign(customer, 'bk-1', 'off-1'), 'INVALID_INPUT');
  });

  it('BR13 — an offering that does not serve the area is refused', async () => {
    bookings.findById.mockResolvedValue(booking({ areaId: 'area-elsewhere' }) as never);
    offerings.findById.mockResolvedValue(offering() as never);
    providers.findById.mockResolvedValue({ id: 'prov-1', stage: 'ACTIVATED' } as never);

    await expectCode(service.assign(customer, 'bk-1', 'off-1'), 'INVALID_INPUT');
  });

  it('respects the provider’s minimum job size', async () => {
    bookings.findById.mockResolvedValue(booking({ quantity: 2 }) as never);
    offerings.findById.mockResolvedValue(offering() as never);
    providers.findById.mockResolvedValue({ id: 'prov-1', stage: 'ACTIVATED' } as never);

    await expectCode(service.assign(customer, 'bk-1', 'off-1'), 'INVALID_INPUT');
  });

  it('refuses an offering for a different service', async () => {
    bookings.findById.mockResolvedValue(booking() as never);
    offerings.findById.mockResolvedValue(offering({ serviceTypeId: 'svc-survey' }) as never);
    providers.findById.mockResolvedValue({ id: 'prov-1', stage: 'ACTIVATED' } as never);

    await expectCode(service.assign(customer, 'bk-1', 'off-1'), 'INVALID_INPUT');
  });

  it('hides another organisation’s booking behind a 404, not a 403', async () => {
    bookings.findById.mockResolvedValue(booking({ customerOrganisationId: 'someone-else' }) as never);

    await expectCode(service.assign(customer, 'bk-1', 'off-1'), 'RESOURCE_NOT_FOUND');
  });

  describe('BR15 — the proposer cannot confirm their own date', () => {
    const scheduled = booking({
      status: 'SCHEDULED',
      assignments: [{ providerId: 'prov-1', status: 'ACCEPTED', provider: { organisationId: 'prov-org' } }],
    });

    it('rejects the customer confirming a customer proposal', async () => {
      bookings.findById.mockResolvedValue(scheduled as never);
      bookings.findPendingSchedule.mockResolvedValue({ id: 's1', proposedByRole: 'CUSTOMER' } as never);

      await expectCode(service.confirmSchedule(customer, 'bk-1'), 'ACCESS_DENIED');
    });

    it('rejects the provider confirming a provider proposal', async () => {
      bookings.findById.mockResolvedValue(scheduled as never);
      providers.findByOrganisation.mockResolvedValue({ id: 'prov-1' } as never);
      bookings.findPendingSchedule.mockResolvedValue({ id: 's1', proposedByRole: 'PROVIDER' } as never);

      await expectCode(service.confirmSchedule(provider, 'bk-1'), 'ACCESS_DENIED');
    });

    it('says so clearly when there is nothing to confirm', async () => {
      bookings.findById.mockResolvedValue(scheduled as never);
      bookings.findPendingSchedule.mockResolvedValue(null as never);

      await expectCode(service.confirmSchedule(customer, 'bk-1'), 'NO_PENDING_SCHEDULE');
    });
  });

  it('BR3 — a provider with no PENDING assignment cannot accept', async () => {
    providers.findByOrganisation.mockResolvedValue({ id: 'prov-1' } as never);
    bookings.findById.mockResolvedValue(
      booking({ status: 'ASSIGNED', assignments: [{ providerId: 'other-prov', status: 'PENDING' }] }) as never,
    );

    await expectCode(service.accept(provider, 'bk-1'), 'RESOURCE_NOT_FOUND');
  });

  it('BR9 — a cancelled booking cannot be cancelled again', async () => {
    bookings.findById.mockResolvedValue(booking({ status: 'CANCELLED' }) as never);

    await expectCode(service.cancel(customer, 'bk-1', 'changed my mind'), 'BOOKING_ALREADY_CLOSED');
  });

  it('a date cannot be agreed before a provider is chosen', async () => {
    bookings.findById.mockResolvedValue(booking({ status: 'UNASSIGNED' }) as never);

    await expectCode(
      service.proposeSchedule(customer, 'bk-1', { date: '2026-09-05', window: 'DAWN' as never }),
      'BOOKING_NOT_ASSIGNED',
    );
  });
});
