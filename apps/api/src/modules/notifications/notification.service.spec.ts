import { Test } from '@nestjs/testing';

import { DeviceTokenRepository } from './device-token.repository';
import { NotificationRepository } from './notification.repository';
import { NotificationService } from './notification.service';
import { PushService } from './push.service';

/**
 * The contract that makes push safe to add: the notification is the database row, and the push
 * is a courtesy on top of it.
 */
describe('NotificationService.deliver', () => {
  let service: NotificationService;
  let create: jest.Mock;
  let pushToOrganisation: jest.Mock;

  const setup = async (push: Partial<PushService> = {}) => {
    create = jest.fn().mockResolvedValue({ id: 'n-1' });
    pushToOrganisation = (push.pushToOrganisation as jest.Mock) ?? jest.fn().mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationService,
        { provide: NotificationRepository, useValue: { create } },
        { provide: DeviceTokenRepository, useValue: {} },
        { provide: PushService, useValue: { pushToOrganisation, enabled: true, ...push } },
      ],
    }).compile();

    service = moduleRef.get(NotificationService);
  };

  const input = {
    organisationId: 'org-1',
    type: 'BOOKING_ASSIGNED' as const,
    title: 'New request',
    body: '20 acres of crop spraying',
    bookingId: 'bk-1',
  };

  it('records the notification and pushes it', async () => {
    await setup();

    await service.deliver(input);

    expect(create).toHaveBeenCalledWith(input);
    expect(pushToOrganisation).toHaveBeenCalledWith('org-1', {
      title: 'New request',
      body: '20 acres of crop spraying',
      bookingId: 'bk-1',
    });
  });

  it('records BEFORE it pushes', async () => {
    // Order is the contract.
    const order: string[] = [];
    await setup({ pushToOrganisation: jest.fn(async () => void order.push('push')) as never });
    create.mockImplementation(async () => void order.push('create'));

    await service.deliver(input);

    expect(order).toEqual(['create', 'push']);
  });

  it('does NOT fail when push throws', async () => {
    // The failure this whole design exists to survive. deliver()'s contract is "the
    // notification is recorded" — a transport that cannot reach Google must not make that
    // untrue for the caller.
    await setup({
      pushToOrganisation: jest.fn().mockRejectedValue(new Error('FCM unreachable')) as never,
    });

    await expect(service.deliver(input)).resolves.toBeUndefined();
    expect(create).toHaveBeenCalledWith(input);
  });

  it('works with push disabled', async () => {
    // The unconfigured state — no Firebase credentials — is supported, not an error.
    await setup({ enabled: false, pushToOrganisation: jest.fn().mockResolvedValue(undefined) as never });

    await service.deliver(input);

    expect(create).toHaveBeenCalledWith(input);
  });
});
