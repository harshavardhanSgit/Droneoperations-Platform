import type { PaymentMethod, TimeWindow } from '../generated/prisma/client';

/**
 * The PURE half of the history seed: given the activated marketplace and a seed number, it
 * produces the same ~415-job story every time.
 */

// --------------------------------------------------------------- the planner

export type IntentStatus = 'COMPLETED' | 'CANCELLED' | 'IN_FLIGHT';
export type InFlightStage = 'ASSIGNED' | 'SCHEDULED' | 'AWAITING_CONFIRMATION';

export interface GenProvider {
  providerId: string;
  offeringId: string;
  minQuantity: number;
  districts: Array<{ id: string; weight: number }>;
}

export interface GenCustomer {
  organisationId: string;
  userId: string;
  membershipId: string;
}

export interface GenCatalogue {
  serviceTypeId: string;
  providers: GenProvider[];
  customers: GenCustomer[];
}

export interface BookingIntent {
  status: IntentStatus;
  /** For IN_FLIGHT: how far the job got before being left there. */
  inFlightStage?: InFlightStage;
  providerId: string;
  offeringId: string;
  areaId: string;
  quantity: number;
  /** What was actually delivered (BR14) — completed and awaiting-confirmation only. */
  finalQuantity?: number;
  /** Days before today the work happened. Bigger = older. */
  serviceDaysAgo: number;
  /** Days before today the customer booked. Always > serviceDaysAgo. */
  bookedDaysAgo: number;
  window: TimeWindow;
  /** Completed-only enrichment. */
  paid?: boolean;
  method?: PaymentMethod;
  paidDaysAfter?: number;
  rating?: number;
  comment?: string;
  /** Cancelled-only. */
  reason?: string;
}

export interface HistoryPlan {
  bookings: BookingIntent[];
}

export const HISTORY_TARGETS = {
  completed: 300,
  cancelled: 60,
  inFlight: 55,
} as const;

/** A booking older than this proves the history seed has run before. */
export const HISTORY_MARKER_DAYS = 30;
export const MIN_FLEET = 3;

export const DISTRICT_WEIGHTS: Record<string, number> = {
  Warangal: 1.7,
  Guntur: 1.5,
  Nashik: 1.4,
  Khammam: 1.2,
  Nizamabad: 1.15,
  Krishna: 1.1,
  Karimnagar: 1.1,
  'West Godavari': 1.1,
  Jalgaon: 1.05,
  Ahmednagar: 1.0,
  Medak: 1.0,
  Kurnool: 1.0,
  Anantapur: 0.95,
  Nalgonda: 0.9,
  Solapur: 0.9,
};

/** Spraying happens at dawn and morning; evening is the niche. */
const WINDOWS: Array<[TimeWindow, number]> = [
  ['DAWN', 0.35],
  ['MORNING', 0.45],
  ['EVENING', 0.2],
];

const CANCEL_REASONS = [
  'Crop was harvested earlier than expected',
  'Heavy rain forecast for the week',
  'Switched to a different treatment',
  'Land was handed over before the spray date',
  'Farmer could not arrange water for the mix',
] as const;

const REVIEW_COMMENTS = [
  'Smooth service — the team arrived on time.',
  'Excellent spraying, the fields look clean.',
  'Professional crew and clear communication throughout.',
  'Very satisfied with the outcome.',
  'Good quality work at a fair price.',
  'Careful near the boundary, nothing damaged.',
  'Done exactly as promised, no surprises.',
  'Fast turnaround, will book again.',
  'Clear pricing from the start.',
  'Held up well through the kharif rush.',
] as const;

const PAYMENT_METHODS = ['UPI', 'BANK_TRANSFER', 'CASH', 'CHEQUE'] as const;
export const DAY_MS = 86_400_000;

/** Deterministic PRNG — same seed, same story, every time. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function weightedPick<T>(items: T[], weights: number[], rng: () => number): T {
  const total = weights.reduce((sum, w) => sum + w, 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i += 1) {
    r -= weights[i]!;
    if (r <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

/** Bigger providers (more districts) win more jobs, like the real market. */
function providerWeight(provider: GenProvider): number {
  return 1 + 0.5 * Math.max(0, provider.districts.length - 1);
}

/** 5–60 acres, skewed small — most farms are small farms. */
function sampleQuantity(rng: () => number, minQuantity: number): number {
  const q = 5 + Math.pow(rng(), 1.8) * 55;
  return Math.min(60, Math.max(minQuantity, Math.round(q)));
}

/**
 * A service date in the last year, weighted towards the kharif season (June–October) when
 * spraying demand peaks.
 */
function sampleServiceDaysAgo(rng: () => number, nowMs: number): number {
  for (;;) {
    const daysAgo = 1 + Math.floor(rng() * 365);
    const month = new Date(nowMs - daysAgo * DAY_MS).getMonth() + 1;
    const kharif = month >= 6 && month <= 10;
    if (kharif || rng() < 0.45) return daysAgo;
  }
}

export function generateHistoryPlan(
  catalogue: GenCatalogue,
  seed = 2026,
  nowMs: number = Date.now(),
): HistoryPlan {
  const bookings: BookingIntent[] = [];

  if (catalogue.providers.length === 0 || catalogue.customers.length === 0) {
    return { bookings };
  }

  const rng = mulberry32(seed);
  const pickProvider = () => weightedPick(catalogue.providers, catalogue.providers.map(providerWeight), rng);
  const pickDistrict = (provider: GenProvider) =>
    weightedPick(
      provider.districts,
      provider.districts.map((d) => d.weight),
      rng,
    );
  const pickWindow = () => weightedPick(WINDOWS.map(([w]) => w), WINDOWS.map(([, weight]) => weight), rng);

  // A completed job is booked 2–14 days ahead of the service date.
  const schedule = () => {
    const serviceDaysAgo = sampleServiceDaysAgo(rng, nowMs);
    const bookedDaysAgo = serviceDaysAgo + 2 + Math.floor(rng() * 13);
    return { serviceDaysAgo, bookedDaysAgo };
  };

  for (let i = 0; i < HISTORY_TARGETS.completed; i += 1) {
    const provider = pickProvider();
    const area = pickDistrict(provider);
    const quantity = sampleQuantity(rng, provider.minQuantity);
    const finalQuantity = rng() < 0.7 ? quantity : Math.max(1, quantity - (1 + Math.floor(rng() * 3)));

    const intent: BookingIntent = {
      status: 'COMPLETED',
      providerId: provider.providerId,
      offeringId: provider.offeringId,
      areaId: area.id,
      quantity,
      finalQuantity,
      window: pickWindow(),
      ...schedule(),
    };

    if (rng() < 0.8) {
      intent.paid = true;
      intent.method = PAYMENT_METHODS[Math.floor(rng() * PAYMENT_METHODS.length)];
      intent.paidDaysAfter = 1 + Math.floor(rng() * 7);
    }

    if (rng() < 0.6) {
      intent.rating = 3 + Math.floor(rng() * 3);
      if (rng() < 0.8) intent.comment = REVIEW_COMMENTS[Math.floor(rng() * REVIEW_COMMENTS.length)];
    }

    bookings.push(intent);
  }

  for (let i = 0; i < HISTORY_TARGETS.cancelled; i += 1) {
    const provider = pickProvider();
    const area = pickDistrict(provider);
    const quantity = sampleQuantity(rng, provider.minQuantity);
    const { serviceDaysAgo } = schedule();
    // Cancellations happen close to the booked date, usually before service.
    const bookedDaysAgo = serviceDaysAgo + 1 + Math.floor(rng() * 7);

    bookings.push({
      status: 'CANCELLED',
      providerId: provider.providerId,
      offeringId: provider.offeringId,
      areaId: area.id,
      quantity,
      window: pickWindow(),
      serviceDaysAgo,
      bookedDaysAgo,
      reason: CANCEL_REASONS[Math.floor(rng() * CANCEL_REASONS.length)],
    });
  }

  for (let i = 0; i < HISTORY_TARGETS.inFlight; i += 1) {
    const provider = pickProvider();
    const area = pickDistrict(provider);
    const quantity = sampleQuantity(rng, provider.minQuantity);
    // In-flight work is recent — it is what the dashboards should show live.
    const serviceDaysAgo = Math.floor(rng() * 21);
    const bookedDaysAgo = serviceDaysAgo + 2 + Math.floor(rng() * 13);
    const stage: InFlightStage = i < 20 ? 'ASSIGNED' : i < 40 ? 'SCHEDULED' : 'AWAITING_CONFIRMATION';

    bookings.push({
      status: 'IN_FLIGHT',
      inFlightStage: stage,
      providerId: provider.providerId,
      offeringId: provider.offeringId,
      areaId: area.id,
      quantity,
      ...(stage === 'AWAITING_CONFIRMATION' ? { finalQuantity: quantity } : {}),
      window: pickWindow(),
      serviceDaysAgo,
      bookedDaysAgo,
    });
  }

  return { bookings };
}
