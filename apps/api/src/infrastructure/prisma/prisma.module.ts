import { Module } from '@nestjs/common';

import { PrismaService } from './prisma.service';

/** DECISION: this module is deliberately NOT declared @Global(). */
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
