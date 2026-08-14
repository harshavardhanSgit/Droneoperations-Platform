import { Injectable } from '@nestjs/common';

import type { DeviceTokenModel } from '../../generated/prisma/models';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class DeviceTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Register a browser, or refresh one already registered. */
  register(input: { userId: string; token: string; platform: string }): Promise<DeviceTokenModel> {
    return this.prisma.deviceToken.upsert({
      where: { token: input.token },
      create: input,
      update: { userId: input.userId, platform: input.platform, lastSeenAt: new Date() },
    });
  }

  /** Every device belonging to every ACTIVE member of an organisation. */
  findForOrganisation(organisationId: string): Promise<DeviceTokenModel[]> {
    return this.prisma.deviceToken.findMany({
      where: {
        user: {
          status: 'ACTIVE',
          memberships: { some: { organisationId, status: 'ACTIVE' } },
        },
      },
    });
  }

  /** Used on sign-out, so a shared browser stops ringing for the last user. */
  async deleteByToken(token: string): Promise<void> {
    await this.prisma.deviceToken.deleteMany({ where: { token } });
  }

  /** Cleanup of tokens FCM has rejected as permanently unregistered. */
  async deleteMany(tokens: string[]): Promise<void> {
    await this.prisma.deviceToken.deleteMany({ where: { token: { in: tokens } } });
  }
}
