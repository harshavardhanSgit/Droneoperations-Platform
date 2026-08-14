import { Injectable } from '@nestjs/common';

import type { DeviceTokenModel } from '../../generated/prisma/models';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class DeviceTokenRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Register a browser, or refresh one already registered.
   *
   * An upsert on the token, not a create. FCM re-issues the same registration
   * token to the same browser profile, so a create would either violate the
   * unique index or — without one — accumulate a duplicate on every page load,
   * and the user would get the same notification several times over.
   *
   * The userId is updated too: a shared machine where a second person signs in
   * must move the device to them rather than keep pushing the first person's
   * notifications to it.
   */
  register(input: { userId: string; token: string; platform: string }): Promise<DeviceTokenModel> {
    return this.prisma.deviceToken.upsert({
      where: { token: input.token },
      create: input,
      update: { userId: input.userId, platform: input.platform, lastSeenAt: new Date() },
    });
  }

  /**
   * Every device belonging to every ACTIVE member of an organisation.
   *
   * The membership join is the point: notifications are addressed to an
   * organisation, devices belong to people, and a revoked member must stop
   * receiving an organisation's notifications immediately — which a
   * denormalised organisationId on the token would not achieve.
   */
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
