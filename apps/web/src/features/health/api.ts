import { apiFetch } from '@/core/api/client';
import type { Liveness, Readiness } from '@/core/api/types';

export const getLiveness = () => apiFetch<Liveness>('/api/v1/health');

export const getReadiness = () => apiFetch<Readiness>('/api/v1/health/ready');
