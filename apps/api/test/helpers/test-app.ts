import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../../src/app.module';
import { validationExceptionFactory } from '../../src/common/validation/validation-exception.factory';
import { PrismaService } from '../../src/infrastructure/prisma/prisma.service';
import type { ActorContext } from '../../src/modules/identity/actor-context';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaService;
}

export async function createTestApp(): Promise<TestContext> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, exceptionFactory: validationExceptionFactory }),
  );
  await app.init();

  return { app, prisma: app.get(PrismaService) };
}

/**
 * Truncate rather than delete: RESTART IDENTITY resets sequences and CASCADE
 * handles foreign keys without needing a hand-maintained deletion order that
 * silently rots every time a table is added.
 */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'
  `;

  const list = tables.map((t) => `"public"."${t.tablename}"`).join(', ');

  if (list) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`);
  }
}

// ------------------------------------------------------------------ fixtures

export interface Fixtures {
  customer: ActorContext;
  provider: ActorContext;
  otherProvider: ActorContext;
  admin: ActorContext;
  engineer: ActorContext;
  serviceTypeId: string;
  areaId: string;
  offeringId: string;
  otherOfferingId: string;
  providerId: string;
  droneId: string;
}

const actor = (
  userId: string,
  organisationId: string,
  membershipId: string,
  organisationKind: ActorContext['organisationKind'],
  role: ActorContext['role'],
): ActorContext => ({
  userId,
  membershipId,
  organisationId,
  organisationKind,
  role,
  principalOrganisationId: organisationId,
});

/** A minimal but REAL marketplace: two activated providers, priced offerings, one drone. */
export async function seedFixtures(prisma: PrismaService): Promise<Fixtures> {
  const mkUser = (email: string, name: string) =>
    prisma.user.create({ data: { email, passwordHash: 'x', fullName: name } });

  const [custUser, provUser, otherUser, adminUser, engUser] = await Promise.all([
    mkUser('cust@test.local', 'Customer'),
    mkUser('prov@test.local', 'Provider'),
    mkUser('other@test.local', 'Other Provider'),
    mkUser('admin@test.local', 'Admin'),
    mkUser('eng@test.local', 'Engineer'),
  ]);

  const mkOrg = (name: string, kind: 'CUSTOMER' | 'PROVIDER' | 'PLATFORM') =>
    prisma.organisation.create({ data: { name, kind, type: 'BUSINESS' } });

  const [custOrg, provOrg, otherOrg, platformOrg] = await Promise.all([
    mkOrg('Test Farms', 'CUSTOMER'),
    mkOrg('Test Drones', 'PROVIDER'),
    mkOrg('Rival Drones', 'PROVIDER'),
    mkOrg('Platform', 'PLATFORM'),
  ]);

  const mkMembership = (userId: string, organisationId: string, role: ActorContext['role']) =>
    prisma.membership.create({ data: { userId, organisationId, role } });

  const [custMem, provMem, otherMem, adminMem, engMem] = await Promise.all([
    mkMembership(custUser.id, custOrg.id, 'OWNER'),
    mkMembership(provUser.id, provOrg.id, 'OWNER'),
    mkMembership(otherUser.id, otherOrg.id, 'OWNER'),
    mkMembership(adminUser.id, platformOrg.id, 'ADMIN'),
    mkMembership(engUser.id, platformOrg.id, 'SERVICE_ENGINEER'),
  ]);

  const serviceType = await prisma.serviceType.create({
    data: { code: 'CROP_SPRAYING', name: 'Crop spraying', pricingUnit: 'PER_ACRE' },
  });
  const state = await prisma.area.create({ data: { name: 'Telangana', level: 'STATE' } });
  const area = await prisma.area.create({
    data: { name: 'Warangal', level: 'DISTRICT', parentId: state.id },
  });

  const mkProvider = (organisationId: string) =>
    prisma.provider.create({
      data: { organisationId, stage: 'ACTIVATED', activatedAt: new Date(), city: 'Warangal' },
    });

  const [provider, otherProvider] = await Promise.all([mkProvider(provOrg.id), mkProvider(otherOrg.id)]);

  const mkOffering = async (providerId: string, price: number, createdBy: string) => {
    const offering = await prisma.offering.create({
      data: { providerId, serviceTypeId: serviceType.id },
    });
    await prisma.offeringVersion.create({
      data: {
        offeringId: offering.id,
        versionNumber: 1,
        unitPriceMinor: price,
        pricingUnit: 'PER_ACRE',
        inclusions: ['WATER'],
        createdByUserId: createdBy,
      },
    });
    await prisma.offeringArea.create({ data: { offeringId: offering.id, areaId: area.id } });
    return offering;
  };

  const [offering, otherOffering] = await Promise.all([
    mkOffering(provider.id, 50000, provUser.id),
    mkOffering(otherProvider.id, 60000, otherUser.id),
  ]);

  const drone = await prisma.drone.create({
    data: { providerId: provider.id, model: 'AG365', registrationNumber: 'UIN-TEST-1' },
  });

  return {
    customer: actor(custUser.id, custOrg.id, custMem.id, 'CUSTOMER', 'OWNER'),
    provider: actor(provUser.id, provOrg.id, provMem.id, 'PROVIDER', 'OWNER'),
    otherProvider: actor(otherUser.id, otherOrg.id, otherMem.id, 'PROVIDER', 'OWNER'),
    admin: actor(adminUser.id, platformOrg.id, adminMem.id, 'PLATFORM', 'ADMIN'),
    engineer: actor(engUser.id, platformOrg.id, engMem.id, 'PLATFORM', 'SERVICE_ENGINEER'),
    serviceTypeId: serviceType.id,
    areaId: area.id,
    offeringId: offering.id,
    otherOfferingId: otherOffering.id,
    providerId: provider.id,
    droneId: drone.id,
  };
}
