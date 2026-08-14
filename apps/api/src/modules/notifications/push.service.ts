import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';

import type { Env } from '../../config/env.validation';
import { DeviceTokenRepository } from './device-token.repository';

/** FCM errors that mean "this token is dead", as opposed to "try again later". */
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/** The push transport. */
@Injectable()
export class PushService implements OnModuleInit {
  private messaging: Messaging | null = null;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly devices: DeviceTokenRepository,
    private readonly logger: Logger,
  ) {}

  onModuleInit(): void {
    const projectId = this.config.get('FIREBASE_PROJECT_ID', { infer: true });
    const clientEmail = this.config.get('FIREBASE_CLIENT_EMAIL', { infer: true });
    const privateKey = this.config.get('FIREBASE_PRIVATE_KEY', { infer: true });

    if (!projectId || !clientEmail || !privateKey) {
      // Said once, at boot, at info.
      this.logger.log('Push notifications disabled — no Firebase credentials configured');
      return;
    }

    try {
      // getApps() guards against re-initialising in tests and on hot reload, where the module
      // can be constructed more than once in one process.
      const app: App =
        getApps()[0] ??
        initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });

      this.messaging = getMessaging(app);
      this.logger.log({ projectId }, 'Push notifications enabled');
    } catch (error) {
      // A malformed key must not stop the API booting.
      this.logger.error({ err: error }, 'Firebase init failed — push stays disabled');
    }
  }

  get enabled(): boolean {
    return this.messaging !== null;
  }

  /**
   * Deliver to every device belonging to every active member of an organisation — notifications
   * are addressed to an organisation, but devices belong to people.
   */
  async pushToOrganisation(
    organisationId: string,
    message: { title: string; body?: string | undefined; bookingId?: string | undefined },
  ): Promise<void> {
    const messaging = this.messaging;
    if (!messaging) return;

    try {
      const tokens = await this.devices.findForOrganisation(organisationId);
      if (tokens.length === 0) return;

      const response = await messaging.sendEachForMulticast({
        tokens: tokens.map((t) => t.token),
        // `notification` (rather than a data-only payload) is what lets the service worker show
        // something without custom rendering code, and what makes the OS display it when the
        // tab is closed.
        notification: { title: message.title, ...(message.body ? { body: message.body } : {}) },
        // Read by the service worker to decide where a click should land.
        data: {
          ...(message.bookingId ? { bookingId: message.bookingId } : {}),
          url: message.bookingId ? `/bookings/${message.bookingId}` : '/notifications',
        },
        webpush: {
          fcmOptions: {
            link: message.bookingId ? `/bookings/${message.bookingId}` : '/notifications',
          },
        },
      });

      await this.pruneDeadTokens(tokens, response.responses);
    } catch (error) {
      this.logger.warn({ err: error, organisationId }, 'Push delivery failed');
    }
  }

  /** Delete the tokens FCM says will never work again. */
  private async pruneDeadTokens(
    tokens: { token: string }[],
    responses: { success: boolean; error?: { code: string } }[],
  ): Promise<void> {
    const dead = responses
      .map((response, index) =>
        !response.success && response.error && DEAD_TOKEN_CODES.has(response.error.code)
          ? tokens[index]?.token
          : undefined,
      )
      .filter((token): token is string => token !== undefined);

    if (dead.length === 0) return;

    await this.devices.deleteMany(dead);
    this.logger.log({ count: dead.length }, 'Pruned unregistered push tokens');
  }
}
