import { ResourceConflictException } from '../../common/errors/app.exception';
import type { ProviderStage } from '../../generated/prisma/client';

/**
 * The onboarding pipeline, declared in one place.
 *
 * Everything about which moves are legal lives here — never as scattered `if`
 * statements in a service. When a stage is added (DOCUMENTS_SUBMITTED arrives
 * with document upload), this table is the only thing that changes.
 */
const TRANSITIONS: Record<ProviderStage, readonly ProviderStage[]> = {
  REGISTERED: ['PROFILE_COMPLETE'],
  PROFILE_COMPLETE: ['DOCUMENTS_SUBMITTED'],
  DOCUMENTS_SUBMITTED: ['UNDER_REVIEW'],
  UNDER_REVIEW: ['ACTIVATED', 'REJECTED'],
  REJECTED: ['PROFILE_COMPLETE'],
  ACTIVATED: ['SUSPENDED'],
  SUSPENDED: ['ACTIVATED'],
};

/**
 * Stages in which the provider may still edit their own details.
 *
 * UNDER_REVIEW is deliberately excluded: staff must review a fixed snapshot,
 * not something changing under them. ACTIVATED is excluded because a change to
 * a verified business should re-enter review — that is a V2 flow.
 */
const EDITABLE_STAGES: readonly ProviderStage[] = [
  'REGISTERED',
  'PROFILE_COMPLETE',
  'DOCUMENTS_SUBMITTED',
  'REJECTED',
];

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
