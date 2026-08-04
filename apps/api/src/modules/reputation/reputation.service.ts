import { Injectable } from '@nestjs/common';

import {
  AccessDeniedException,
  BusinessRuleException,
  ResourceConflictException,
} from '../../common/errors/app.exception';
import { Prisma } from '../../generated/prisma/client';
import { BookingService } from '../bookings/booking.service';
import type { ActorContext } from '../identity/actor-context';
import type { CreateReviewDto, ProviderRatingDto, ReviewDto } from './dto/review.dto';
import { ReputationRepository } from './reputation.repository';

const UNIQUE_VIOLATION = 'P2002';

@Injectable()
export class ReputationService {
  constructor(
    private readonly reviews: ReputationRepository,
    private readonly bookings: BookingService,
  ) {}

  /** BR7 — customer only, completed booking only, once. */
  async create(actor: ActorContext, bookingId: string, dto: CreateReviewDto): Promise<ReviewDto> {
    const booking = await this.bookings.findOne(actor, bookingId);

    if (actor.organisationKind !== 'CUSTOMER') {
      throw new AccessDeniedException('Only the customer can review a booking');
    }

    if (booking.status !== 'COMPLETED') {
      throw new BusinessRuleException(
        'BOOKING_NOT_COMPLETED',
        'You can review a booking once the work is confirmed complete',
        { status: booking.status },
      );
    }

    const provider = booking.assignments.find((a) => a.status === 'ACCEPTED');

    if (!provider) {
      throw new BusinessRuleException('NO_PROVIDER', 'This booking has no accepted provider');
    }

    try {
      const review = await this.reviews.create({
        bookingId,
        providerId: provider.providerId,
        customerOrganisationId: actor.principalOrganisationId,
        rating: dto.rating,
        comment: dto.comment?.trim(),
        createdByUserId: actor.userId,
      });

      return {
        id: review.id,
        bookingId: review.bookingId,
        rating: review.rating,
        ...(review.comment ? { comment: review.comment } : {}),
        customerName: booking.customerName,
        createdAt: review.createdAt.toISOString(),
      };
    } catch (error) {
      // The unique index on booking_id is what actually enforces "once".
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION) {
        throw new ResourceConflictException(
          'ALREADY_REVIEWED',
          'You have already reviewed this booking',
        );
      }
      throw error;
    }
  }

  /** Null until reviewed. Reputation owns this — Booking must not know about reviews. */
  async findForBooking(actor: ActorContext, bookingId: string): Promise<ReviewDto | null> {
    const booking = await this.bookings.findOne(actor, bookingId);
    const review = await this.reviews.findByBooking(bookingId);

    if (!review) {
      return null;
    }

    return {
      id: review.id,
      bookingId: review.bookingId,
      rating: review.rating,
      ...(review.comment ? { comment: review.comment } : {}),
      customerName: booking.customerName,
      createdAt: review.createdAt.toISOString(),
    };
  }

  /**
   * The average is recomputed on every read.
   *
   * Storing it on Provider would mean writing to two aggregates per review, and
   * a failure between them leaves a rating that no longer matches its reviews.
   * At this volume the aggregate query costs nothing; if it ever does, the fix
   * is a cache with a clear invalidation rule, not a denormalised column.
   */
  /**
   * The aggregate only, for many providers at once. Discovery displays this
   * next to each result; it never needs the review text there, so this
   * deliberately does not load it.
   */
  ratingsFor(providerIds: string[]): Promise<Map<string, { average: number | null; count: number }>> {
    return this.reviews.ratingsFor(providerIds);
  }

  async ratingFor(providerId: string): Promise<ProviderRatingDto> {
    const [{ average, count }, reviews] = await Promise.all([
      this.reviews.ratingFor(providerId),
      this.reviews.listForProvider(providerId),
    ]);

    const names = new Map(
      (await this.reviews.organisationNames(reviews.map((r) => r.customerOrganisationId))).map(
        (org) => [org.id, org.name],
      ),
    );

    return {
      providerId,
      ...(average !== null ? { average } : {}),
      count,
      reviews: reviews.map((review) => ({
        id: review.id,
        bookingId: review.bookingId,
        rating: review.rating,
        ...(review.comment ? { comment: review.comment } : {}),
        customerName: names.get(review.customerOrganisationId) ?? 'A customer',
        createdAt: review.createdAt.toISOString(),
      })),
    };
  }
}
