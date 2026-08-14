import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';

/** The three source reads behind the coverage dashboard. */
@Injectable()
export class CoverageRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Delivered work. finalQuantity is BR14's "what was actually covered" — that is the number a
   * coverage map must claim, never the booked quantity.
   */
  completedBookings() {
    return this.prisma.booking.findMany({
      where: { status: 'COMPLETED' },
      select: {
        quantity: true,
        finalQuantity: true,
        pricingUnit: true,
        area: { include: { parent: { include: { parent: true } } } },
        offeringVersion: {
          select: { offering: { select: { providerId: true } } },
        },
      },
    });
  }

  /** What is currently on sale. */
  activeOfferings() {
    return this.prisma.offering.findMany({
      where: {
        status: 'ACTIVE',
        provider: { stage: 'ACTIVATED', organisation: { status: 'ACTIVE' } },
      },
      select: {
        providerId: true,
        areas: { select: { area: { include: { parent: true } } } },
      },
    });
  }

  /** Activated providers and their serviceable fleet. */
  activeProviders() {
    return this.prisma.provider.findMany({
      where: { stage: 'ACTIVATED' },
      select: {
        id: true,
        organisation: { select: { name: true } },
        drones: { where: { serviceability: 'SERVICEABLE' }, select: { id: true } },
      },
    });
  }
}
