import { Injectable } from '@nestjs/common';

import type { AreaModel, CustomerProfileModel } from '../../generated/prisma/models';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { Tx } from '../../infrastructure/prisma/transaction';

export type CustomerProfileWithArea = CustomerProfileModel & { defaultArea: AreaModel | null };

export interface CustomerProfileInput {
  latitude?: number | null | undefined;
  longitude?: number | null | undefined;
  locationLabel?: string | null | undefined;
  defaultAreaId?: string | null | undefined;
}

@Injectable()
export class CustomerRepository {
  constructor(private readonly prisma: PrismaService) {}

  private db(tx?: Tx) {
    return tx ?? this.prisma;
  }

  findByOrganisation(organisationId: string, tx?: Tx): Promise<CustomerProfileWithArea | null> {
    return this.db(tx).customerProfile.findUnique({
      where: { organisationId },
      include: { defaultArea: true },
    });
  }

  /** Upsert, not create-then-update. */
  save(
    organisationId: string,
    input: CustomerProfileInput,
    tx?: Tx,
  ): Promise<CustomerProfileWithArea> {
    return this.db(tx).customerProfile.upsert({
      where: { organisationId },
      create: { organisationId, ...input },
      update: input,
      include: { defaultArea: true },
    });
  }
}
