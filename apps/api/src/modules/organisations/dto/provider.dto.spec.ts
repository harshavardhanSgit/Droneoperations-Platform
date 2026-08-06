import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { UpdateProviderProfileDto } from './provider.dto';

/**
 * The location fields are the one place in this DTO with cross-field logic:
 * latitude and longitude must arrive as a pair, each within its valid range.
 * Pin that contract here — a future editor adding @IsOptional to either field
 * would silently break the both-or-neither rule (IsOptional short-circuits all
 * other validators on undefined), and this spec is what would catch it.
 */
const BASE = {
  legalName: 'Kumar Agri Services Pvt Ltd',
  contactPhone: '+919876543210',
  addressLine: 'Plot 14, Industrial Estate',
  city: 'Warangal',
  state: 'Telangana',
  pincode: '506002',
};

async function errorsFor(patch: Record<string, unknown> = {}) {
  const dto = plainToInstance(UpdateProviderProfileDto, { ...BASE, ...patch });
  return validate(dto);
}

describe('UpdateProviderProfileDto location pair', () => {
  it('accepts a profile without coordinates (pre-existing providers)', async () => {
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
