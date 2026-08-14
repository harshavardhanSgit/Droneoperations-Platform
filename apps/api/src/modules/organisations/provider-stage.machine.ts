import { ResourceConflictException } from '../../common/errors/app.exception';
import type { ProviderStage } from '../../generated/prisma/client';

/** The onboarding pipeline, declared in one place. */
const TRANSITIONS: Record<ProviderStage, readonly ProviderStage[]> = {
  REGISTERED: ['PROFILE_COMPLETE'],
  PROFILE_COMPLETE: ['DOCUMENTS_SUBMITTED'],
  DOCUMENTS_SUBMITTED: ['UNDER_REVIEW'],
  UNDER_REVIEW: ['ACTIVATED', 'REJECTED'],
  REJECTED: ['PROFILE_COMPLETE'],
  ACTIVATED: ['SUSPENDED'],
  SUSPENDED: ['ACTIVATED'],
};

/** Stages in which the provider may still edit their own details. */
const EDITABLE_STAGES: readonly ProviderStage[] = [
  'REGISTERED',
  'PROFILE_COMPLETE',
  'DOCUMENTS_SUBMITTED',
  'REJECTED',
];

/**
 * Stages in which the provider may change their COVERAGE — where they are based and how far
 * they travel.
 */
// ACTIVATED is included deliberately: coverage was never reviewed by staff, so a live
// provider must be able to change it. provider.service.spec.ts pins this.
const COVERAGE_EDITABLE_STAGES: readonly ProviderStage[] = [...EDITABLE_STAGES, 'ACTIVATED'];

/** BR1 — only this stage may appear in Discovery or receive bookings. */
export const BOOKABLE_STAGE: ProviderStage = 'ACTIVATED';

export function canTransition(from: ProviderStage, to: ProviderStage): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: ProviderStage, to: ProviderStage): void {
  if (!canTransition(from, to)) {
    throw new ResourceConflictException(
      'PROVIDER_INVALID_STAGE_TRANSITION',
      `A provider cannot move from ${from} to ${to}`,
      { from, attempted: to, allowed: TRANSITIONS[from] },
    );
  }
}

export function assertEditable(stage: ProviderStage): void {
  if (!EDITABLE_STAGES.includes(stage)) {
    throw new ResourceConflictException(
      'PROVIDER_NOT_EDITABLE',
      `Business details cannot be changed while the application is ${stage}`,
      { stage, editableIn: EDITABLE_STAGES },
    );
  }
}

export function isCoverageEditable(stage: ProviderStage): boolean {
  return COVERAGE_EDITABLE_STAGES.includes(stage);
}

export function assertCoverageEditable(stage: ProviderStage): void {
  if (!isCoverageEditable(stage)) {
    throw new ResourceConflictException(
      'PROVIDER_COVERAGE_NOT_EDITABLE',
      `Coverage cannot be changed while the application is ${stage}`,
      { stage, editableIn: COVERAGE_EDITABLE_STAGES },
    );
  }
}
