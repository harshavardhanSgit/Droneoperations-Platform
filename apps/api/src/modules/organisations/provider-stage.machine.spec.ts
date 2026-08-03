import type { ProviderStage } from '../../generated/prisma/client';
import { assertEditable, assertTransition, BOOKABLE_STAGE, canTransition } from './provider-stage.machine';

const ALL: ProviderStage[] = [
  'REGISTERED',
  'PROFILE_COMPLETE',
  'DOCUMENTS_SUBMITTED',
  'UNDER_REVIEW',
  'ACTIVATED',
  'REJECTED',
  'SUSPENDED',
];

describe('provider onboarding pipeline', () => {
  it('walks the intended order', () => {
    expect(canTransition('REGISTERED', 'PROFILE_COMPLETE')).toBe(true);
    expect(canTransition('PROFILE_COMPLETE', 'DOCUMENTS_SUBMITTED')).toBe(true);
    expect(canTransition('DOCUMENTS_SUBMITTED', 'UNDER_REVIEW')).toBe(true);
    expect(canTransition('UNDER_REVIEW', 'ACTIVATED')).toBe(true);
  });

  it('cannot skip review — BR1 has no back door', () => {
    expect(canTransition('REGISTERED', 'ACTIVATED')).toBe(false);
    expect(canTransition('PROFILE_COMPLETE', 'ACTIVATED')).toBe(false);
    expect(canTransition('DOCUMENTS_SUBMITTED', 'ACTIVATED')).toBe(false);
  });

  it('lets a rejected applicant fix their details and resubmit', () => {
    expect(canTransition('UNDER_REVIEW', 'REJECTED')).toBe(true);
    expect(canTransition('REJECTED', 'PROFILE_COMPLETE')).toBe(true);
  });

  it('cannot activate twice', () => {
    expect(canTransition('ACTIVATED', 'ACTIVATED')).toBe(false);
  });

  it('suspension is reversible', () => {
    expect(canTransition('ACTIVATED', 'SUSPENDED')).toBe(true);
    expect(canTransition('SUSPENDED', 'ACTIVATED')).toBe(true);
  });

  it('BR1 — only ACTIVATED is bookable', () => {
    expect(BOOKABLE_STAGE).toBe('ACTIVATED');
  });

  describe('editability', () => {
    it('is open before submission and after rejection', () => {
      expect(() => assertEditable('REGISTERED')).not.toThrow();
      expect(() => assertEditable('PROFILE_COMPLETE')).not.toThrow();
      expect(() => assertEditable('DOCUMENTS_SUBMITTED')).not.toThrow();
      expect(() => assertEditable('REJECTED')).not.toThrow();
    });

    it('is LOCKED under review — staff must review a fixed snapshot', () => {
      expect(() => assertEditable('UNDER_REVIEW')).toThrow();
    });

    it('is locked once activated — changes must re-enter review', () => {
      expect(() => assertEditable('ACTIVATED')).toThrow();
      expect(() => assertEditable('SUSPENDED')).toThrow();
    });
  });

  it('every stage has an explicit transition list', () => {
    for (const stage of ALL) {
      expect(() => canTransition(stage, 'ACTIVATED')).not.toThrow();
    }
  });

  it('errors name the attempted move', () => {
    try {
      assertTransition('ACTIVATED', 'ACTIVATED');
      throw new Error('should have thrown');
    } catch (error) {
      const typed = error as { code: string; message: string };
      expect(typed.code).toBe('PROVIDER_INVALID_STAGE_TRANSITION');
      expect(typed.message).toContain('ACTIVATED to ACTIVATED');
    }
  });
});
