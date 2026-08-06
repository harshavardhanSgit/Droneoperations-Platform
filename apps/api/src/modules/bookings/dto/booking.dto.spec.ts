import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { TimeWindow } from '../../../generated/prisma/client';
import { CreateBookingDto } from './booking.dto';

/**
 * The location fields are the one place in this DTO with cross-field logic:
 * latitude and longitude must arrive as a pair, each within its valid range.
 * Pin that contract here — a future editor adding @IsOptional to either field
 * would silently break the both-or-neither rule (IsOptional short-circuits all
 * other validators on undefined), and this spec is what would catch it.
 */
const BASE = {
  serviceTypeId: 'f0f0f0f0-0000-4000-8000-000000000001',
  areaId: 'f0f0f0f0-0000-4000-8000-000000000002',
  quantity: 20,
  preferredDate: '2026-08-14',
  preferredWindow: TimeWindow.DAWN,
};

async function errorsFor(patch: Record<string, unknown> = {}) {
  const dto = plainToInstance(CreateBookingDto, { ...BASE, ...patch });
  return validate(dto);
}

describe('CreateBookingDto location pair', () => {
  it('accepts a booking without coordinates (phone bookings, pre-map customers)', async () => {
    expect(await errorsFor()).toHaveLength(0);
  });

  it('accepts a valid latitude/longitude pair', async () => {
    expect(await errorsFor({ latitude: 17.9689, longitude: 79.5941 })).toHaveLength(0);
  });

  it('rejects longitude without latitude', async () => {
    const errors = await errorsFor({ longitude: 79.5941 });
    expect(errors.some((error) => error.property === 'latitude')).toBe(true);
  });

  it('rejects latitude without longitude', async () => {
    const errors = await errorsFor({ latitude: 17.9689 });
    expect(errors.some((error) => error.property === 'longitude')).toBe(true);
  });

  it('rejects an out-of-range latitude', async () => {
    const errors = await errorsFor({ latitude: 999, longitude: 79.5941 });
    expect(errors.some((error) => error.property === 'latitude')).toBe(true);
  });

  it('rejects an out-of-range longitude', async () => {
    const errors = await errorsFor({ latitude: 17.9689, longitude: -200 });
    expect(errors.some((error) => error.property === 'longitude')).toBe(true);
  });

  it('rejects more than 7 decimal places', async () => {
    const errors = await errorsFor({ latitude: 17.96891234, longitude: 79.5941 });
    expect(errors.some((error) => error.property === 'latitude')).toBe(true);
  });
});
