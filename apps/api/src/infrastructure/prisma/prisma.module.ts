import { Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';

/**
 * DECISION: this module is deliberately NOT declared @Global().
 *
 * The common Nest convention is to mark PrismaModule global so that no module
 * has to import it. That is convenient, and it is the wrong trade for this
 * codebase.
 *
 * A global provider is an invisible dependency: nothing in a module's `imports`
 * reveals that it touches the database. Since only repositories are permitted
 * to inject PrismaService, an explicit import is a useful signal — a module
 * that imports PrismaModule owns data, and a module that does not, does not.
 * That is worth one line per module.
 *
 * The cost is real: twelve modules will eventually repeat this import. Accepted,
 * because the architecture's central claim is that dependencies are declared
 * rather than ambient.
 */
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
