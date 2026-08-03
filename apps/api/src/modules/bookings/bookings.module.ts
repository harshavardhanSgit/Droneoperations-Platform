import { Module } from '@nestjs/common';

import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { OfferingsModule } from '../offerings/offerings.module';
import { OrganisationsModule } from '../organisations/organisations.module';
import { BookingController } from './booking.controller';
import { BookingRepository } from './booking.repository';
import { BookingService } from './booking.service';
import { ProviderBookingController } from './provider-booking.controller';

/**
 * Booking, assignments and status history are ONE aggregate, so they live in
 * one module — an aggregate must be written in a single transaction, and
 * splitting it across modules would force a cross-module transactional write,
 * which the architecture forbids.
 */
@Module({
  imports: [PrismaModule, OfferingsModule, OrganisationsModule],
  controllers: [BookingController, ProviderBookingController],
  providers: [BookingService, BookingRepository],
  exports: [BookingService],
})
export class BookingsModule {}
