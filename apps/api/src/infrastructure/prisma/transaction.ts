import type { Prisma } from '../../generated/prisma/client';

/** Passed down from a service to its repositories so they can join the caller's transaction. */
export type Tx = Prisma.TransactionClient;
