import { Injectable } from '@nestjs/common';

import type { ActorContext } from '../identity/actor-context';
import type { NotificationListDto } from './dto/notification.dto';
import { NotificationRepository } from './notification.repository';

@Injectable()
export class NotificationService {
  constructor(private readonly notifications: NotificationRepository) {}

  async list(
    actor: ActorContext,
    page: { skip: number; take: number },
  ): Promise<NotificationListDto> {
    const [[items, total], unread] = await Promise.all([
      this.notifications.list(actor.organisationId, page),
      this.notifications.unreadCount(actor.organisationId),
    ]);

    return {
      items: items.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        ...(item.body ? { body: item.body } : {}),
        ...(item.bookingId ? { bookingId: item.bookingId } : {}),
        read: item.readAt !== null,
        createdAt: item.createdAt.toISOString(),
      })),
      total,
      unread,
    };
  }

  unreadCount(actor: ActorContext): Promise<number> {
    return this.notifications.unreadCount(actor.organisationId);
  }

  async markRead(actor: ActorContext, id: string): Promise<void> {
    await this.notifications.markRead(actor.organisationId, id);
  }

  async markAllRead(actor: ActorContext): Promise<void> {
    await this.notifications.markAllRead(actor.organisationId);
  }
}
