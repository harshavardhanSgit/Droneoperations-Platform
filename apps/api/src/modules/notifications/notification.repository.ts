import { Injectable } from '@nestjs/common';

import type { NotificationType } from '../../generated/prisma/client';
import type { NotificationModel } from '../../generated/prisma/models';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Injectable()
export class NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: {
    organisationId: string;
    type: NotificationType;
    title: string;
    body?: string | undefined;
    bookingId?: string | undefined;
  }): Promise<NotificationModel> {
    return this.prisma.notification.create({ data });
  }

  list(
    organisationId: string,
    page: { skip: number; take: number },
  ): Promise<[NotificationModel[], number]> {
    return Promise.all([
      this.prisma.notification.findMany({
        where: { organisationId },
        orderBy: { createdAt: 'desc' },
        skip: page.skip,
        take: page.take,
      }),
      this.prisma.notification.count({ where: { organisationId } }),
    ]);
  }

  unreadCount(organisationId: string): Promise<number> {
    return this.prisma.notification.count({ where: { organisationId, readAt: null } });
  }

  /** Scoped to the organisation so an id from another org silently affects nothing. */
  markRead(organisationId: string, id: string): Promise<{ count: number }> {
    return this.prisma.notification.updateMany({
      where: { id, organisationId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  markAllRead(organisationId: string): Promise<{ count: number }> {
    return this.prisma.notification.updateMany({
      where: { organisationId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
