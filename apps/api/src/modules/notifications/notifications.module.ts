import { Module } from '@nestjs/common';

import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { BookingNotificationListener } from './booking-notification.listener';
import { NotificationController } from './notification.controller';
import { NotificationRepository } from './notification.repository';
import { NotificationService } from './notification.service';

/**
 * Imports NOTHING from any domain module except Booking's event *contract* —
 * a types file, not a service. Nothing here is exported, because nothing else
 * should depend on notifications existing.
 */
@Module({
  imports: [PrismaModule],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationRepository, BookingNotificationListener],
})
export class NotificationsModule {}
