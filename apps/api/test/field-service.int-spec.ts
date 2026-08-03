import type { INestApplication } from '@nestjs/common';

import type { PrismaService } from '../src/infrastructure/prisma/prisma.service';
import { TicketService } from '../src/modules/field-service/ticket.service';
import { createTestApp, resetDatabase, seedFixtures, type Fixtures } from './helpers/test-app';

describe('Field Service — BR11 and drone grounding', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tickets: TicketService;
  let fx: Fixtures;

  beforeAll(async () => {
    const ctx = await createTestApp();
    app = ctx.app;
    prisma = ctx.prisma;
    tickets = app.get(TicketService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(prisma);
    fx = await seedFixtures(prisma);
  });

  const raise = () =>
    tickets.raise(fx.provider, { droneId: fx.droneId, description: 'Pump losing pressure mid-flight' });

  const report = async (status: 'READY' | 'PENDING' = 'READY') =>
    prisma.document.create({
      data: {
        ownerType: 'TICKET',
        ownerId: fx.droneId,
        originalFilename: 'report.pdf',
        storageKey: `k-${Math.random()}`,
        contentType: 'application/pdf',
        sizeBytes: 100,
        status,
        uploadedByUserId: fx.engineer.userId,
      },
    });

  it('raising a ticket grounds the drone in the same transaction', async () => {
    await raise();

    const drone = await prisma.drone.findUniqueOrThrow({ where: { id: fx.droneId } });
    expect(drone.serviceability).toBe('UNDER_MAINTENANCE');
  });

  it('refuses a second open ticket for the same drone', async () => {
    await raise();

    await expect(raise()).rejects.toMatchObject({ code: 'TICKET_ALREADY_OPEN' });
  });

  describe('BR11 — cannot close without a report, and only the assigned engineer', () => {
    const inProgress = async () => {
      const ticket = await raise();
      await tickets.assign(fx.admin, ticket.id, fx.engineer.userId);
      await tickets.start(fx.engineer, ticket.id);
      return ticket.id;
    };

    it('refuses an engineer the ticket is not assigned to', async () => {
      const id = await inProgress();
      const doc = await report();

      await expect(
        tickets.close(fx.admin, id, { resolutionNote: 'Done', reportDocumentId: doc.id }),
      ).rejects.toMatchObject({ code: 'ACCESS_DENIED' });
    });

    it('refuses a report whose upload was never confirmed', async () => {
      const id = await inProgress();
      const doc = await report('PENDING');

      await expect(
        tickets.close(fx.engineer, id, { resolutionNote: 'Done', reportDocumentId: doc.id }),
      ).rejects.toMatchObject({ code: 'REPORT_NOT_UPLOADED' });
    });

    it('refuses a report that does not exist', async () => {
      const id = await inProgress();

      await expect(
        tickets.close(fx.engineer, id, {
          resolutionNote: 'Done',
          reportDocumentId: '00000000-0000-4000-8000-000000000000',
        }),
      ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
    });

    it('closing with a confirmed report returns the drone to service', async () => {
      const id = await inProgress();
      const doc = await report();

      const closed = await tickets.close(fx.engineer, id, {
        resolutionNote: 'Replaced pump diaphragm',
        reportDocumentId: doc.id,
      });

      expect(closed.status).toBe('CLOSED');

      const drone = await prisma.drone.findUniqueOrThrow({ where: { id: fx.droneId } });
      expect(drone.serviceability).toBe('SERVICEABLE');
    });

    it('the ticket history reconstructs the whole repair', async () => {
      const id = await inProgress();
      const doc = await report();
      const closed = await tickets.close(fx.engineer, id, {
        resolutionNote: 'Replaced pump diaphragm',
        reportDocumentId: doc.id,
      });

      expect(closed.history.map((h) => h.toStatus)).toEqual([
        'OPEN',
        'ASSIGNED',
        'IN_PROGRESS',
        'CLOSED',
      ]);
    });
  });
});
