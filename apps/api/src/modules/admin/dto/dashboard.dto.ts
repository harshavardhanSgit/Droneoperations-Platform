import { ApiProperty } from '@nestjs/swagger';

/**
 * Counts, not analytics.
 *
 * The operator's question is "is anything stuck?", and a number answers it.
 * Charts and trends are V2 — they consume effort and demonstrate nothing this
 * does not.
 */
export class DashboardDto {
  @ApiProperty({ example: 3, description: 'Providers submitted and awaiting review' })
  providersAwaitingReview: number;

  @ApiProperty({ example: 12, description: 'Providers who can currently receive bookings' })
  providersActive: number;

  @ApiProperty({ example: 1, description: 'Jobs with no provider — the operator queue' })
  bookingsUnassigned: number;

  @ApiProperty({ example: 4, description: 'Jobs agreed and not yet delivered' })
  bookingsInFlight: number;

  @ApiProperty({ example: 2, description: 'Work delivered, awaiting the customer' })
  bookingsAwaitingSignOff: number;

  @ApiProperty({ example: 1, description: 'Grounded drones with no engineer assigned' })
  ticketsUnassigned: number;

  @ApiProperty({ example: 2, description: 'Repairs under way' })
  ticketsInProgress: number;
}
