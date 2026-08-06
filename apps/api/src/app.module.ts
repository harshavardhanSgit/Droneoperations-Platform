import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';

import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { validateEnv } from './config/env.validation';
import { LoggingModule } from './infrastructure/logger/logging.module';
import { HealthModule } from './modules/health/health.module';
import { JwtAuthGuard } from './modules/identity/guards/jwt-auth.guard';
import { PermissionsGuard } from './modules/identity/guards/permissions.guard';
import { IdentityModule } from './modules/identity/identity.module';
import { AdminModule } from './modules/admin/admin.module';
import { AssetsModule } from './modules/assets/assets.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { FieldServiceModule } from './modules/field-service/field-service.module';
import { CatalogueModule } from './modules/catalogue/catalogue.module';
import { CoverageModule } from './modules/coverage/coverage.module';
import { DiscoveryModule } from './modules/discovery/discovery.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { OfferingsModule } from './modules/offerings/offerings.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrganisationsModule } from './modules/organisations/organisations.module';
import { ReputationModule } from './modules/reputation/reputation.module';
import { SettlementModule } from './modules/settlement/settlement.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    // In-process pub/sub. V1 swaps a durable transport in behind the same
    // event names — see the outbox note in the architecture review (F8).
    EventEmitterModule.forRoot(),
    LoggingModule,
    HealthModule,
    IdentityModule,
    DocumentsModule,
    CatalogueModule,
    OrganisationsModule,
    OfferingsModule,
    DiscoveryModule,
    BookingsModule,
    SettlementModule,
    ReputationModule,
    NotificationsModule,
    AssetsModule,
    FieldServiceModule,
    AdminModule,
    CoverageModule,
  ],
  providers: [
    // Registered as providers rather than via app.useGlobalFilters() so they
    // participate in dependency injection — the filter needs the Logger.
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    // SECURE BY DEFAULT. Every route requires a valid access token unless it
    // is explicitly marked @Public(). A new controller is protected the moment
    // it exists — the failure mode becomes "I forgot to open it", which is
    // visible, instead of "I forgot to close it", which is a breach.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Order matters: guards run in registration order, so authentication
    // populates request.user before authorisation reads it.
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
