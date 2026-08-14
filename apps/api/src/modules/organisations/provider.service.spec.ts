import { Test } from '@nestjs/testing';

import { BusinessRuleException } from '../../common/errors/app.exception';
import { DocumentService } from '../documents/document.service';
import type { ActorContext } from '../identity/actor-context';
import type { UpdateProviderProfileDto } from './dto/provider.dto';
import { ProviderRepository } from './provider.repository';
import { ProviderService } from './provider.service';

/** A radius is a distance FROM somewhere. */
const actor: ActorContext = {
  userId: 'user-1',
  membershipId: 'mem-1',
  organisationId: 'prov-org',
  organisationKind: 'PROVIDER',
  role: 'OWNER',
  principalOrganisationId: 'prov-org',
};

const profile = (patch: Partial<UpdateProviderProfileDto> = {}): UpdateProviderProfileDto =>
  ({
    legalName: 'Kumar Agri Services Pvt Ltd',
    contactPhone: '+919876543210',
    addressLine: 'Plot 14, Industrial Estate',
    city: 'Warangal',
    state: 'Telangana',
    pincode: '506002',
    ...patch,
  }) as UpdateProviderProfileDto;

describe('ProviderService — a radius needs a base', () => {
  let service: ProviderService;
  let updateProfile: jest.Mock;
  let updateCoverage: jest.Mock;

  /** `saved` is the provider row as it already stands in the database. */
  const setup = async (
    saved: { latitude: number | null; longitude: number | null },
    stage: string = 'PROFILE_COMPLETE',
  ) => {
    const provider = {
      id: 'prov-1',
      organisationId: 'prov-org',
      organisation: { name: 'Kumar Agri' },
      stage,
      stageEnteredAt: new Date(),
      serviceRadiusKm: null,
      ...saved,
    };

    updateProfile = jest.fn().mockResolvedValue(provider);
    updateCoverage = jest.fn().mockResolvedValue(provider);

    const moduleRef = await Test.createTestingModule({
      providers: [
        ProviderService,
        {
          provide: ProviderRepository,
          useValue: {
            findByOrganisation: jest.fn().mockResolvedValue(provider),
            findById: jest.fn().mockResolvedValue(provider),
            updateProfile,
            updateCoverage,
            transition: jest.fn(),
            listStageHistory: jest.fn().mockResolvedValue([]),
          },
        },
        { provide: DocumentService, useValue: {} },
      ],
    }).compile();

    service = moduleRef.get(ProviderService);
  };

  it('rejects a radius when no base is saved and none is being sent', async () => {
    await setup({ latitude: null, longitude: null });

    await expect(
      service.updateOwnProfile(actor, profile({ serviceRadiusKm: 60 })),
    ).rejects.toBeInstanceOf(BusinessRuleException);

    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('accepts a radius sent together with a base in the same request', async () => {
    // The common case: a provider opens the map and moves the slider before saving once.
    await setup({ latitude: null, longitude: null });

    await service.updateOwnProfile(
      actor,
      profile({ serviceRadiusKm: 60, latitude: 17.9689, longitude: 79.5941 }),
    );

    expect(updateProfile).toHaveBeenCalledWith(
      'prov-1',
      expect.objectContaining({ serviceRadiusKm: 60 }),
    );
  });

  it('accepts a radius against a base saved earlier', async () => {
    await setup({ latitude: 17.9689, longitude: 79.5941 });

    await service.updateOwnProfile(actor, profile({ serviceRadiusKm: 60 }));

    expect(updateProfile).toHaveBeenCalledWith(
      'prov-1',
      expect.objectContaining({ serviceRadiusKm: 60 }),
    );
  });

  it('refuses a PROFILE edit once activated, as before', async () => {
    // The rule this feature must not weaken: a verified business cannot quietly change the
    // details staff approved.
    await setup({ latitude: 17.9689, longitude: 79.5941 }, 'ACTIVATED');

    await expect(service.updateOwnProfile(actor, profile())).rejects.toMatchObject({
      code: 'PROVIDER_NOT_EDITABLE',
    });
  });

  it('ALLOWS a coverage change once activated', async () => {
    // The bug this fixes.
    await setup({ latitude: 17.9689, longitude: 79.5941 }, 'ACTIVATED');

    await service.updateOwnCoverage(actor, { serviceRadiusKm: 95 });

    expect(updateCoverage).toHaveBeenCalledWith(
      'prov-1',
      expect.objectContaining({ serviceRadiusKm: 95 }),
    );
  });

  it.each([['UNDER_REVIEW'], ['SUSPENDED']] as const)(
    'refuses a coverage change while %s',
    async (stage) => {
      // Under review the profile is a fixed snapshot; a suspended provider is not participating
      // at all.
      await setup({ latitude: 17.9689, longitude: 79.5941 }, stage);

      await expect(
        service.updateOwnCoverage(actor, { serviceRadiusKm: 95 }),
      ).rejects.toMatchObject({ code: 'PROVIDER_COVERAGE_NOT_EDITABLE' });

      expect(updateCoverage).not.toHaveBeenCalled();
    },
  );

  it('still refuses a radius with no base, on the coverage path too', async () => {
    await setup({ latitude: null, longitude: null }, 'ACTIVATED');

    await expect(
      service.updateOwnCoverage(actor, { serviceRadiusKm: 60 }),
    ).rejects.toBeInstanceOf(BusinessRuleException);

    expect(updateCoverage).not.toHaveBeenCalled();
  });

  it('cannot touch verified business details through the coverage path', async () => {
    // Structural, not incidental: the coverage repository method takes only base and range, so
    // this path is INCAPABLE of writing a legal name.
    await setup({ latitude: 17.9689, longitude: 79.5941 }, 'ACTIVATED');

    await service.updateOwnCoverage(actor, { serviceRadiusKm: 80 });

    const written = updateCoverage.mock.calls[0]?.[1] as Record<string, unknown>;

    expect(Object.keys(written).sort()).toEqual(['latitude', 'longitude', 'serviceRadiusKm']);
  });

  it('leaves an untouched profile alone when no radius is sent', async () => {
    // undefined must reach Prisma as undefined — "leave the column alone" — so saving the
    // address does not silently erase a declared range.
    await setup({ latitude: null, longitude: null });

    await service.updateOwnProfile(actor, profile());

    expect(updateProfile).toHaveBeenCalledWith(
      'prov-1',
      expect.objectContaining({ serviceRadiusKm: undefined }),
    );
  });
});
