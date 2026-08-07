import { Injectable } from '@nestjs/common';

import type { ProviderStage } from '../../generated/prisma/client';
import type { OrganisationModel, ProviderModel } from '../../generated/prisma/models';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { Tx } from '../../infrastructure/prisma/transaction';

export type ProviderWithOrganisation = ProviderModel & { organisation: OrganisationModel };

export interface ProviderProfileInput {
  legalName: string;
  registrationNumber?: string | undefined;
  contactPhone: string;
  addressLine: string;
  city: string;
  state: string;
  pincode: string;
  latitude?: number | undefined;
  longitude?: number | undefined;
  serviceRadiusKm?: number | undefined;
}

@Injectable()
export class ProviderRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: Tx) {
    return tx ?? this.prisma;
  }

  create(organisationId: string, tx?: Tx): Promise<ProviderModel> {
    return this.db(tx).provider.create({ data: { organisationId } });
  }

  findByOrganisation(organisationId: string, tx?: Tx): Promise<ProviderWithOrganisation | null> {
    return this.db(tx).provider.findUnique({
      where: { organisationId },
      include: { organisation: true },
    });
  }

  findById(id: string, tx?: Tx): Promise<ProviderWithOrganisation | null> {
    return this.db(tx).provider.findUnique({ where: { id }, include: { organisation: true } });
  }

  updateProfile(id: string, profile: ProviderProfileInput, tx?: Tx): Promise<ProviderModel> {
    return this.db(tx).provider.update({ where: { id }, data: profile });
  }

  /**
   * Moves a provider to a new stage AND records the event, in one call. The
   * two must never happen separately — a stage without its event is history
   * that cannot be reconstructed.
   */
  async transition(
    input: {
      id: string;
      from: ProviderStage;
      to: ProviderStage;
      actorUserId: string;
      reason?: string | undefined;
    },
    tx?: Tx,
  ): Promise<ProviderModel> {
    const db = this.db(tx);
    const now = new Date();

    const provider = await db.provider.update({
      where: { id: input.id },
      data: {
        stage: input.to,
        stageEnteredAt: now,
        ...(input.to === 'ACTIVATED' ? { activatedAt: now, rejectionReason: null } : {}),
        ...(input.to === 'REJECTED' ? { rejectionReason: input.reason ?? null } : {}),
      },
    });

    await db.providerStageEvent.create({
      data: {
        providerId: input.id,
        fromStage: input.from,
        toStage: input.to,
        actorUserId: input.actorUserId,
        reason: input.reason ?? null,
      },
    });

    return provider;
  }

  async list(
    filter: { stage?: ProviderStage },
    page: { skip: number; take: number },
    tx?: Tx,
  ): Promise<{ items: ProviderWithOrganisation[]; total: number }> {
    const where = filter.stage ? { stage: filter.stage } : {};

    const [items, total] = await Promise.all([
      this.db(tx).provider.findMany({
        where,
        include: { organisation: true },
        // Oldest first: a review queue should be first-in-first-out, or the
        // longest-waiting applicant is the one who never gets seen.
        orderBy: { stageEnteredAt: 'asc' },
        skip: page.skip,
        take: page.take,
      }),
      this.db(tx).provider.count({ where }),
    ]);

    return { items, total };
  }

  /** One row per stage, one query. Counting by fetching rows does not scale. */
  async countByStage(tx?: Tx): Promise<Record<string, number>> {
    const rows = await this.db(tx).provider.groupBy({
      by: ['stage'],
      _count: { _all: true },
    });

    return Object.fromEntries(rows.map((row) => [row.stage, row._count._all]));
  }

  listStageHistory(providerId: string, tx?: Tx) {
    return this.db(tx).providerStageEvent.findMany({
      where: { providerId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
