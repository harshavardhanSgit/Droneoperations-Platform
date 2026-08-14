import { Injectable } from '@nestjs/common';

import type { NotificationType } from '../../generated/prisma/client';
import type { ActorContext } from '../identity/actor-context';
import { DeviceTokenRepository } from './device-token.repository';
import type { NotificationListDto } from './dto/notification.dto';
import { NotificationRepository } from './notification.repository';
import { PushService } from './push.service';

export interface NotificationInput {
  organisationId: string;
  type: NotificationType;
  title: string;
  body?: string | undefined;
  bookingId?: string | undefined;
}

@Injectable()
export class NotificationService {
  constructor(
    private readonly notifications: NotificationRepository,
    private readonly devices: DeviceTokenRepository,
    private readonly push: PushService,
  ) {}

  /**
   * Record a notification, then try to push it.
   *
   * ORDER IS THE CONTRACT. The database row is the notification; the push is a
   * courtesy. Persisting first means a user who has never granted permission,
   * or whose device is unreachable, still finds it in the bell — and a push
   * that fails costs nothing, because the record already exists.
   *
   * Reversing this would make delivery depend on Google being available.
   */
  async deliver(input: NotificationInput): Promise<void> {
    await this.notifications.create(input);

    // Caught HERE as well as inside PushService. Belt and braces on purpose:
    // this method's contract is "the notification is recorded", and letting a
    // transport failure reject it would make that untrue at the one boundary
    // where it is stated. PushService already swallows its own errors; this
    // survives the day someone adds a transport that does not.
    try {
      await this.push.pushToOrganisation(input.organisationId, {
        title: input.title,
        body: input.body,
        bookingId: input.bookingId,
      });
    } catch {
      // Deliberately silent: PushService has already logged with context, and
      // a second log line here would say less and appear twice.
    }
  }

  registerDevice(actor: ActorContext, token: string, platform: string): Promise<unknown> {
    return this.devices.register({ userId: actor.userId, token, platform });
  }

  /** Sign-out, so a shared browser stops ringing for whoever just left. */
  unregisterDevice(token: string): Promise<void> {
    return this.devices.deleteByToken(token);
  }

  /** Whether the server can push at all — the client uses this to decide
   *  whether offering a permission prompt would be honest. */
  get pushEnabled(): boolean {
    return this.push.enabled;
  }

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
