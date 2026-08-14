import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';

import type { Env } from '../../config/env.validation';
import { DeviceTokenRepository } from './device-token.repository';

/**
 * FCM errors that mean "this token is dead", as opposed to "try again later".
 *
 * Distinguishing them is the whole job of the cleanup path: deleting a token
 * because Google had a bad minute would silently unsubscribe a working device,
 * and keeping a token that has been unregistered means retrying it forever.
 */
const DEAD_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

/**
 * The push transport.
 *
 * This is the "swap a transport" the architecture promised: it is reached only
 * from NotificationService, no domain module knows it exists, and adding it
 * required no change to Booking, Offerings or anything else that emits events.
 *
 * TWO PROPERTIES MATTER MORE THAN THE FEATURE ITSELF:
 *
 *  1. Unconfigured is a supported state. With no Firebase credentials this
 *     class is inert — every send returns immediately. The app, CI, the tests
 *     and `docker compose up` all work exactly as before.
 *
 *  2. A failed push never fails the notification. The in-app record is the
 *     source of truth; a push is a courtesy on top of it. Anything thrown here
 *     is caught and logged, never propagated.
 */
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
      // Said once, at boot, at info. Anything noisier would be a warning on
      // every developer machine about a feature they have not opted into.
      this.logger.log('Push notifications disabled — no Firebase credentials configured');
      return;
    }

    try {
      // getApps() guards against re-initialising in tests and on hot reload,
      // where the module can be constructed more than once in one process.
      const app: App =
        getApps()[0] ??
        initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });

      this.messaging = getMessaging(app);
      this.logger.log({ projectId }, 'Push notifications enabled');
    } catch (error) {
      // A malformed key must not stop the API booting. Everything else on this
      // server still works; push simply stays off.
      this.logger.error({ err: error }, 'Firebase init failed — push stays disabled');
    }
  }

  get enabled(): boolean {
    return this.messaging !== null;
  }

  /**
   * Deliver to every device belonging to every active member of an
   * organisation — notifications are addressed to an organisation, but devices
   * belong to people.
   *
   * Returns nothing and throws nothing. Callers must not be able to tell
   * whether a push succeeded, because they must not behave differently if it
   * did not.
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
        // `notification` (rather than a data-only payload) is what lets the
        // service worker show something without custom rendering code, and
        // what makes the OS display it when the tab is closed.
        notification: { title: message.title, ...(message.body ? { body: message.body } : {}) },
        // Read by the service worker to decide where a click should land.
        // Data values must be strings — FCM rejects anything else.
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

  /**
   * Delete the tokens FCM says will never work again.
   *
   * Without this the dead-token list grows forever: every uninstalled browser
   * stays on file, every send retries it, and the failure count climbs until
   * the numbers stop meaning anything.
   */
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
