import { Test } from '@nestjs/testing';

import { BusinessRuleException } from '../../common/errors/app.exception';
import { DocumentService } from '../documents/document.service';
import type { ActorContext } from '../identity/actor-context';
import type { UpdateProviderProfileDto } from './dto/provider.dto';
import { ProviderRepository } from './provider.repository';
import { ProviderService } from './provider.service';

/**
 * A radius is a distance FROM somewhere.
 *
 * The rule cannot live in the DTO, because the base may have been saved on an
 * earlier request — the question is about the resulting ROW, not the payload,
 * and a DTO cannot see the database. So it lives here, and so does its test.
 *
 * Why it matters beyond tidiness: a radius with no base does not fail loudly.
 * Discovery simply never matches that provider, so they would set a range, see
 * it saved, and quietly receive no work forever.
 */
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

  /** `saved` is the provider row as it already stands in the database. */
  const setup = async (saved: { latitude: number | null; longitude: number | null }) => {
    const provider = {
      id: 'prov-1',
      organisationId: 'prov-org',
      organisation: { name: 'Kumar Agri' },
      stage: 'PROFILE_COMPLETE',
      stageEnteredAt: new Date(),
      serviceRadiusKm: null,
      ...saved,
    };

    updateProfile = jest.fn().mockResolvedValue(provider);

    const moduleRef = await Test.createTestingModule({
      providers: [
        ProviderService,
        {
          provide: ProviderRepository,
          useValue: {
            findByOrganisation: jest.fn().mockResolvedValue(provider),
            findById: jest.fn().mockResolvedValue(provider),
            updateProfile,
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
    // The common case: a provider opens the map and moves the slider before
    // saving once. Requiring two round trips would be a rule about our storage
    // order, not about their business.
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

  it('leaves an untouched profile alone when no radius is sent', async () => {
    // undefined must reach Prisma as undefined — "leave the column alone" —
    // so saving the address does not silently erase a declared range.
    await setup({ latitude: null, longitude: null });

    await service.updateOwnProfile(actor, profile());

    expect(updateProfile).toHaveBeenCalledWith(
      'prov-1',
      expect.objectContaining({ serviceRadiusKm: undefined }),
    );
  });
});
