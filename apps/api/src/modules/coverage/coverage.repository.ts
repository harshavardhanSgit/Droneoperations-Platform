import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../infrastructure/prisma/prisma.service';

/**
 * The three source reads behind the coverage dashboard. Each query is kept
 * deliberately narrow — the service needs one thing from each, and a fat
 * findMany that returns the whole row is how aggregation code rots.
 */
@Injectable()
export class CoverageRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Delivered work. finalQuantity is BR14's "what was actually covered" —
   * that is the number a coverage map must claim, never the booked quantity.
   * The area hierarchy is walked up so a booking made against a taluka still
   * lands on its district and state.
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

  /**
   * What is currently on sale. Same business rules as discovery: an offering
   * only counts if its provider is ACTIVATED and its organisation is ACTIVE.
   * A provider's footprint on the map is where they take work, not where they
   * are registered.
   */
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
