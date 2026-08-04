import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiEnvelope, ApiErrorEnvelope } from '../../common/swagger/api-envelope.decorator';
import { BookingService } from '../bookings/booking.service';
import { TicketService } from '../field-service/ticket.service';
import { RequirePermissions } from '../identity/decorators/require-permissions.decorator';
import { ProviderService } from '../organisations/provider.service';
import { DashboardDto } from './dto/dashboard.dto';

/**
 * Reporting reads across modules and owns nothing.
 *
 * Every number here comes from the service that owns the data — Booking counts
 * bookings, Field Service counts tickets, Organisations counts providers. This
 * controller does no querying of its own. The alternative, a reporting module
 * with its own tables fed by every domain, inverts the dependency direction and
 * invites each new module to push data into it.
 */
@ApiTags('Administration')
@ApiBearerAuth('access-token')
@Controller('admin/dashboard')
export class AdminDashboardController {
  constructor(
    private readonly bookings: BookingService,
    private readonly tickets: TicketService,
    private readonly providers: ProviderService,
  ) {}

  @Get()
  @RequirePermissions('booking:read-any')
  @ApiOperation({
    summary: 'What needs attention',
    description: 'Counts only. Charts and trends are deliberately V2.',
  })
  @ApiEnvelope(DashboardDto)
  @ApiErrorEnvelope(403, 'Role does not permit this action')
  async summary(): Promise<DashboardDto> {
    // Three independent reads, so they run concurrently rather than in series.
    const [providerStages, bookingStatuses, ticketStatuses] = await Promise.all([
      this.providers.countByStage(),
      this.bookings.countByStatus(),
      this.tickets.countByStatus(),
    ]);

    return {
      providersAwaitingReview: providerStages['UNDER_REVIEW'] ?? 0,
      providersActive: providerStages['ACTIVATED'] ?? 0,
      bookingsUnassigned: bookingStatuses['UNASSIGNED'] ?? 0,
      bookingsInFlight:
        (bookingStatuses['ASSIGNED'] ?? 0) + (bookingStatuses['SCHEDULED'] ?? 0),
      bookingsAwaitingSignOff: bookingStatuses['AWAITING_CONFIRMATION'] ?? 0,
      ticketsUnassigned: ticketStatuses['OPEN'] ?? 0,
      ticketsInProgress:
        (ticketStatuses['ASSIGNED'] ?? 0) + (ticketStatuses['IN_PROGRESS'] ?? 0),
    };
  }
}
