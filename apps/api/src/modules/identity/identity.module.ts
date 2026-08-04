import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import type { Env } from '../../config/env.validation';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { OrganisationsModule } from '../organisations/organisations.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';

import { RefreshTokenRepository } from './repositories/refresh-token.repository';
import { UserRepository } from './repositories/user.repository';
import { StaffService } from './staff.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenService } from './token.service';

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    OrganisationsModule,
    // registerAsync because the secret comes from validated config, which does
    // not exist until ConfigModule has run.
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
        signOptions: {
          expiresIn: config.get('JWT_ACCESS_TTL_SECONDS', { infer: true }),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
    StaffService,
    UserRepository,
    RefreshTokenRepository,
    JwtStrategy,
    JwtAuthGuard,
  ],
  exports: [TokenService, StaffService, UserRepository, JwtAuthGuard],
})
export class IdentityModule {}
