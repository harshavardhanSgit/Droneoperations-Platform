import { Module } from '@nestjs/common';

import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { BookingNotificationListener } from './booking-notification.listener';
import { DeviceTokenRepository } from './device-token.repository';
import { NotificationController } from './notification.controller';
import { NotificationRepository } from './notification.repository';
import { NotificationService } from './notification.service';
import { PushService } from './push.service';

/**
 * Imports NOTHING from any domain module except Booking's event *contract* — a types file, not
 * a service.
 */
@Module({
  imports: [PrismaModule],
  controllers: [NotificationController],
  providers: [
    NotificationService,
    NotificationRepository,
    BookingNotificationListener,
    // The push transport lives INSIDE this module, which is the point: adding it changed no
    // domain module.
    PushService,
    DeviceTokenRepository,
  ],
})
export class NotificationsModule {}
