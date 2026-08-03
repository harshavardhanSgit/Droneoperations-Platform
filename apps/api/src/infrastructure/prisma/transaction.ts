import type { Prisma } from '../../generated/prisma/client';

/**
 * Passed down from a service to its repositories so they can join the caller's
 * transaction. Lives here rather than inside a module because every module's
 * repositories need it — putting it in one of them would make the others
 * import a peer's internals.
 */
export type Tx = Prisma.TransactionClient;
