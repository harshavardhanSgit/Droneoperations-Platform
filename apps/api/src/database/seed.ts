import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import { argon2id, hash } from 'argon2';

import { PrismaClient } from '../generated/prisma/client';
import { generateHistory } from './generate-history';

/**
 * Creates the PLATFORM organisation and its first ADMIN.
 *
 * These cannot come from /auth/register — that endpoint only accepts CUSTOMER
 * and PROVIDER, deliberately, so nobody can self-elevate. Platform staff are
 * provisioned out of band; after this, an existing ADMIN creates the rest.
 *
 * Idempotent: safe to run repeatedly.
 */
const connectionString = process.env['DATABASE_URL'];

if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const ADMIN_EMAIL = process.env['SEED_ADMIN_EMAIL'] ?? 'admin@droneops.local';
const ADMIN_PASSWORD = process.env['SEED_ADMIN_PASSWORD'] ?? 'seed-admin-passphrase';
const ENGINEER_EMAIL = process.env['SEED_ENGINEER_EMAIL'] ?? 'engineer@droneops.local';
const ENGINEER_PASSWORD = process.env['SEED_ENGINEER_PASSWORD'] ?? 'seed-engineer-passphrase';

const SERVICE_TYPES = [
  { code: 'CROP_SPRAYING', name: 'Crop spraying', pricingUnit: 'PER_ACRE' as const, sortOrder: 10,
    description: 'Aerial application of pesticide, fungicide or nutrient' },
  { code: 'AERIAL_SURVEY', name: 'Aerial survey', pricingUnit: 'PER_SQ_KM' as const, sortOrder: 20,
    description: 'Photogrammetric survey producing orthomosaic and elevation data' },
  { code: 'ASSET_INSPECTION', name: 'Asset inspection', pricingUnit: 'PER_ASSET' as const, sortOrder: 30,
    description: 'Visual or thermal inspection of a fixed asset' },
];

const GEOGRAPHY: Record<string, string[]> = {
  Telangana: ['Warangal', 'Karimnagar', 'Nizamabad', 'Khammam', 'Nalgonda', 'Medak'],
  'Andhra Pradesh': ['Guntur', 'Krishna', 'West Godavari', 'Kurnool', 'Anantapur'],
  Maharashtra: ['Nashik', 'Ahmednagar', 'Jalgaon', 'Solapur'],
};

/** Idempotent: every write checks first, so re-running changes nothing. */
async function seedCatalogue(): Promise<void> {
  for (const type of SERVICE_TYPES) {
    const existing = await prisma.serviceType.findUnique({ where: { code: type.code } });
    if (!existing) {
      await prisma.serviceType.create({ data: type });
      console.log(`  service type: ${type.code}`);
    }
  }

  for (const [stateName, districts] of Object.entries(GEOGRAPHY)) {
    let state = await prisma.area.findFirst({ where: { name: stateName, level: 'STATE' } });
    if (!state) {
      state = await prisma.area.create({ data: { name: stateName, level: 'STATE' } });
      console.log(`  state: ${stateName}`);
    }

    for (const district of districts) {
      const exists = await prisma.area.findFirst({
        where: { name: district, parentId: state.id },
      });
      if (!exists) {
        await prisma.area.create({
          data: { name: district, level: 'DISTRICT', parentId: state.id },
        });
      }
    }
  }
}

async function main(): Promise<void> {
  await seedCatalogue();
  await seedStaff(ENGINEER_EMAIL, ENGINEER_PASSWORD, 'Field Engineer', 'SERVICE_ENGINEER');
  await seedMarketplace();

  // The landing page claims real numbers, so the database needs a believable
  // operating history — driven through the REAL booking services so every
  // state-machine transition is genuine. See generate-history.ts.
  await generateHistory();

  const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });

  if (existing) {
    console.log(`admin already present: ${ADMIN_EMAIL}`);
    return;
  }

  const passwordHash = await hash(ADMIN_PASSWORD, {
    type: argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  await prisma.$transaction(async (tx) => {
    const organisation =
      (await tx.organisation.findFirst({ where: { kind: 'PLATFORM' } })) ??
      (await tx.organisation.create({
        data: { name: 'Drone Operations Platform', kind: 'PLATFORM', type: 'BUSINESS' },
      }));

    const user = await tx.user.create({
      data: {
        email: ADMIN_EMAIL,
        passwordHash,
        fullName: 'Platform Administrator',
      },
    });

    await tx.membership.create({
      data: { userId: user.id, organisationId: organisation.id, role: 'ADMIN' },
    });
  });

  console.log(`seeded admin: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
}

/** Platform staff are provisioned out of band — registration cannot create them. */
async function seedStaff(email: string, password: string, fullName: string, role: 'ADMIN' | 'SERVICE_ENGINEER'): Promise<void> {
  if (await prisma.user.findUnique({ where: { email } })) {
    console.log(`  ${role.toLowerCase()} already present: ${email}`);
    return;
  }

  const passwordHash = await hash(password, {
    type: argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  await prisma.$transaction(async (tx) => {
    const organisation =
      (await tx.organisation.findFirst({ where: { kind: 'PLATFORM' } })) ??
      (await tx.organisation.create({
        data: { name: 'Drone Operations Platform', kind: 'PLATFORM', type: 'BUSINESS' },
      }));

    const user = await tx.user.create({ data: { email, passwordHash, fullName } });

    await tx.membership.create({
      data: { userId: user.id, organisationId: organisation.id, role },
    });
  });

  console.log(`  seeded ${role.toLowerCase()}: ${email} / ${password}`);
}

const DEMO_PASSWORD = process.env['SEED_DEMO_PASSWORD'] ?? 'demo-passphrase-2026';

const DEMO_PROVIDERS = [
  { org: 'Kisan Aerial Services', email: 'kisan@demo.local', owner: 'Anil Reddy',
    city: 'Warangal', state: 'Telangana', districts: ['Warangal', 'Karimnagar'],
    price: 45000, min: 5, inclusions: ['WATER', 'TRANSPORT'] as const,
    notes: 'Dawn slots only. Two machines, 30 acres a day.' },
  { org: 'Godavari Agri Drones', email: 'godavari@demo.local', owner: 'Sreenivas Rao',
    city: 'Khammam', state: 'Telangana', districts: ['Khammam', 'Warangal'],
    price: 52000, min: 10, inclusions: ['WATER', 'TRANSPORT', 'CHEMICAL'] as const,
    notes: 'Chemical supplied at cost. Certified for CIB&RC-approved formulations.' },
  { org: 'Deccan Sky Works', email: 'deccan@demo.local', owner: 'Farhana Begum',
    city: 'Nizamabad', state: 'Telangana', districts: ['Nizamabad', 'Medak', 'Nalgonda'],
    price: 39000, min: 3, inclusions: ['WATER'] as const,
    notes: 'Smallholder friendly — no minimum acreage penalty.' },
  { org: 'Krishna Delta Sprayers', email: 'krishna@demo.local', owner: 'Venkat Naidu',
    city: 'Guntur', state: 'Andhra Pradesh', districts: ['Guntur', 'Krishna'],
    price: 48000, min: 5, inclusions: ['WATER', 'LABOUR'] as const,
    notes: 'Chilli and cotton specialists.' },
  // The southern and western belts: these are what make the coverage story
  // multi-state rather than a two-district demo.
  { org: 'Rayalaseema Agri Wings', email: 'rayalaseema@demo.local', owner: 'Chandrasekhar Reddy',
    city: 'Kurnool', state: 'Andhra Pradesh', districts: ['Kurnool', 'Anantapur'],
    price: 47000, min: 5, inclusions: ['WATER', 'TRANSPORT'] as const,
    notes: 'Groundnut and cotton belt. Long-range machines.' },
  { org: 'Konaseema Crop Care', email: 'konaseema@demo.local', owner: 'Satyanarayana Murthy',
    city: 'Kakinada', state: 'Andhra Pradesh', districts: ['West Godavari'],
    price: 50000, min: 5, inclusions: ['WATER', 'LABOUR'] as const,
    notes: 'Paddy delta — morning slots across the command area.' },
  { org: 'Sahyadri Spray Solutions', email: 'sahyadri@demo.local', owner: 'Amol Kulkarni',
    city: 'Nashik', state: 'Maharashtra', districts: ['Nashik', 'Ahmednagar'],
    price: 44000, min: 5, inclusions: ['WATER', 'TRANSPORT'] as const,
    notes: 'Grape and onion belts. Evening spray windows.' },
  { org: 'Khandesh Agri Air', email: 'khandesh@demo.local', owner: 'Pravin Patil',
    city: 'Jalgaon', state: 'Maharashtra', districts: ['Jalgaon', 'Solapur'],
    price: 42000, min: 3, inclusions: ['WATER'] as const,
    notes: 'Banana and cotton. Bulk-acreage discounts.' },
];

const DEMO_CUSTOMERS = [
  { org: 'Kothapally FPO', email: 'fpo@demo.local', owner: 'Lakshmi Devi', type: 'INSTITUTION' as const },
  { org: 'Rajaiah Gowd', email: 'rajaiah@demo.local', owner: 'Rajaiah Gowd', type: 'INDIVIDUAL' as const },
];

/**
 * Seeds providers already ACTIVATED, with a synthetic stage history so the
 * pipeline view is not empty. Bypassing the real flow is acceptable for demo
 * data and ONLY for demo data — the API has no path that skips review.
 */
async function seedMarketplace(): Promise<void> {
  const spraying = await prisma.serviceType.findUnique({ where: { code: 'CROP_SPRAYING' } });
  if (!spraying) return;

  const passwordHash = await hash(DEMO_PASSWORD, {
    type: argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1,
  });

  for (const seed of DEMO_CUSTOMERS) {
    if (await prisma.user.findUnique({ where: { email: seed.email } })) continue;

    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: seed.email, passwordHash, fullName: seed.owner },
      });
      const org = await tx.organisation.create({
        data: { name: seed.org, kind: 'CUSTOMER', type: seed.type },
      });
      await tx.membership.create({
        data: { userId: user.id, organisationId: org.id, role: 'OWNER' },
      });
    });
    console.log(`  customer: ${seed.email}`);
  }

  for (const seed of DEMO_PROVIDERS) {
    if (await prisma.user.findUnique({ where: { email: seed.email } })) continue;

    const areas = await prisma.area.findMany({
      where: { name: { in: seed.districts }, level: 'DISTRICT' },
    });

    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: seed.email, passwordHash, fullName: seed.owner },
      });
      const org = await tx.organisation.create({
        data: { name: seed.org, kind: 'PROVIDER', type: 'BUSINESS' },
      });
      await tx.membership.create({
        data: { userId: user.id, organisationId: org.id, role: 'OWNER' },
      });

      const provider = await tx.provider.create({
        data: {
          organisationId: org.id,
          legalName: `${seed.org} Pvt Ltd`,
          contactPhone: '+919000000000',
          addressLine: 'Industrial Estate',
          city: seed.city,
          state: seed.state,
          pincode: '500001',
          stage: 'ACTIVATED',
          activatedAt: new Date(),
        },
      });

      const path = ['PROFILE_COMPLETE', 'DOCUMENTS_SUBMITTED', 'UNDER_REVIEW', 'ACTIVATED'] as const;
      let previous: string | null = 'REGISTERED';
      await tx.providerStageEvent.create({
        data: { providerId: provider.id, fromStage: null, toStage: 'REGISTERED', actorUserId: user.id },
      });
      for (const stage of path) {
        await tx.providerStageEvent.create({
          data: {
            providerId: provider.id,
            fromStage: previous as never,
            toStage: stage,
            actorUserId: user.id,
          },
        });
        previous = stage;
      }

      const offering = await tx.offering.create({
        data: { providerId: provider.id, serviceTypeId: spraying.id },
      });
      await tx.offeringVersion.create({
        data: {
          offeringId: offering.id,
          versionNumber: 1,
          unitPriceMinor: seed.price,
          pricingUnit: spraying.pricingUnit,
          minQuantity: seed.min,
          inclusions: [...seed.inclusions],
          notes: seed.notes,
          createdByUserId: user.id,
        },
      });
      if (areas.length) {
        await tx.offeringArea.createMany({
          data: areas.map((area) => ({ offeringId: offering.id, areaId: area.id })),
        });
      }

      // A real fleet, not a single machine: three serviceable airframes per
      // provider makes the coverage fleet count mean something.
      const DRONE_MODELS = ['Marut AG365', 'Marut AG365N', 'Skyfarm SF-60'] as const;
      for (let i = 0; i < DRONE_MODELS.length; i += 1) {
        await tx.drone.create({
          data: {
            providerId: provider.id,
            model: DRONE_MODELS[i]!,
            registrationNumber: `UIN-${seed.city.slice(0, 3).toUpperCase()}-${seed.price}-${i + 1}`,
            capacityLitres: 10,
          },
        });
      }
    });

    console.log(`  provider: ${seed.email} — ${seed.org}, Rs${seed.price / 100}/acre`);
  }

  // Convergence: a provider that predates a districts change keeps its old
  // footprint. The seed is the source of truth for the demo marketplace, so
  // existing providers converge onto the current definition on re-runs.
  for (const seed of DEMO_PROVIDERS) {
    if (!(await prisma.user.findUnique({ where: { email: seed.email } }))) continue;

    const offering = await prisma.offering.findFirst({
      where: { provider: { organisation: { memberships: { some: { user: { email: seed.email } } } } } },
      select: { id: true },
    });
    if (!offering) continue;

    const areas = await prisma.area.findMany({
      where: { name: { in: seed.districts }, level: 'DISTRICT' },
    });
    const linked = await prisma.offeringArea.findMany({
      where: { offeringId: offering.id },
      select: { areaId: true },
    });
    const linkedIds = new Set(linked.map((link) => link.areaId));
    const missing = areas.filter((area) => !linkedIds.has(area.id));

    if (missing.length) {
      await prisma.offeringArea.createMany({
        data: missing.map((area) => ({ offeringId: offering.id, areaId: area.id })),
      });
      console.log(`  converged offering areas: ${seed.org} (+${missing.length} districts)`);
    }
  }
}

main()
  .catch((error: unknown) => {
    console.error('seed failed:', error);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
