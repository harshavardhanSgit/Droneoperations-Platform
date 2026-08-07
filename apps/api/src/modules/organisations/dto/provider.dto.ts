import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

import { DocumentStatus, ProviderDocumentKind, ProviderStage } from '../../../generated/prisma/client';

// Derived from the Prisma enums, never hand-copied. A hand-written duplicate is
// how the OpenAPI spec ends up describing values the API no longer returns —
// and the generated frontend types then contradict reality.
const STAGES = Object.values(ProviderStage);
const DOCUMENT_KINDS = Object.values(ProviderDocumentKind);
const DOCUMENT_STATUSES = Object.values(DocumentStatus);

export class UpdateProviderProfileDto {
  @ApiProperty({ example: 'Kumar Agri Services Pvt Ltd' })
  @IsString()
  @Length(2, 200)
  legalName: string;

  @ApiPropertyOptional({ example: 'U01100TG2021PTC123456' })
  @IsOptional()
  @IsString()
  @Length(3, 60)
  registrationNumber?: string;

  @ApiProperty({ example: '+919876543210' })
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'contactPhone must be 7-15 digits, optionally starting with +' })
  contactPhone: string;

  @ApiProperty({ example: 'Plot 14, Industrial Estate' })
  @IsString()
  @Length(3, 200)
  addressLine: string;

  @ApiProperty({ example: 'Warangal' })
  @IsString()
  @Length(2, 100)
  city: string;

  @ApiProperty({ example: 'Telangana' })
  @IsString()
  @Length(2, 100)
  state: string;

  @ApiProperty({ example: '506002' })
  @Matches(/^[1-9][0-9]{5}$/, { message: 'pincode must be 6 digits and not start with 0' })
  pincode: string;

  /**
   * Where the business operates, picked on a map. Latitude and longitude are a
   * pair: sending one without the other is rejected by the ValidateIf rules
   * below, so a provider cannot save a point with a missing axis.
   *
   * NOTE — do NOT add @IsOptional to either field. The pair rule depends on
   * ValidateIf short-circuiting the @IsNumber check when the OTHER field is
   * absent: with only longitude sent, latitude's IsNumber sees `undefined` and
   * fails the request. @IsOptional would short-circuit that failure and let a
   * half-pair through. provider.dto.spec.ts pins this behaviour.
   */
  @ApiPropertyOptional({ example: 17.9689, description: 'Latitude of the business location' })
  @ValidateIf((o) => o.longitude !== undefined)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-90)
  @Max(90)
  latitude?: number;

  @ApiPropertyOptional({ example: 79.5941, description: 'Longitude of the business location' })
  @ValidateIf((o) => o.latitude !== undefined)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(-180)
  @Max(180)
  longitude?: number;

  /**
   * How far the business will travel from that base. This IS their coverage —
   * discovery matches a customer's pin against base + radius.
   *
   * Capped at 500 km because beyond that the straight-line measure stops being
   * a useful proxy for a day's drive with a machine on a trailer, and a radius
   * that large is really "anywhere", which is not a claim this platform should
   * help anyone make.
   *
   * A radius is only meaningful from a point, so it is rejected unless the
   * provider has also given coordinates. That check needs the persisted row and
   * therefore lives in the service, not here — a DTO cannot see whether a
   * latitude was saved on an earlier request.
   */
  @ApiPropertyOptional({
    example: 60,
    description: 'Kilometres this provider will travel from their base. Requires coordinates.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  serviceRadiusKm?: number;
}

export class RejectProviderDto {
  @ApiProperty({ example: 'Registration number could not be verified' })
  @IsString()
  @Length(5, 500)
  reason: string;
}

export class ProviderStageEventDto {
  @ApiPropertyOptional({ enum: STAGES })
  fromStage?: string;

  @ApiProperty({ enum: STAGES })
  toStage: string;

  @ApiPropertyOptional()
  reason?: string;

  @ApiProperty({ format: 'date-time' })
  at: string;
}

export class ProviderDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ format: 'uuid' })
  organisationId: string;

  @ApiProperty({ example: 'Kumar Agri Services' })
  organisationName: string;

  @ApiProperty({ enum: STAGES })
  stage: string;

  @ApiProperty({ description: 'BR1 — only an ACTIVATED provider may receive bookings' })
  bookable: boolean;

  @ApiProperty({ format: 'date-time', description: 'When the current stage was entered' })
  stageEnteredAt: string;

  @ApiPropertyOptional() legalName?: string;
  @ApiPropertyOptional() registrationNumber?: string;
  @ApiPropertyOptional() contactPhone?: string;
  @ApiPropertyOptional() addressLine?: string;
  @ApiPropertyOptional() city?: string;
  @ApiPropertyOptional() state?: string;
  @ApiPropertyOptional() pincode?: string;
  @ApiPropertyOptional({ example: 17.9689 }) latitude?: number;
  @ApiPropertyOptional({ example: 79.5941 }) longitude?: number;
  @ApiPropertyOptional({ example: 60, description: 'Kilometres they will travel from that base' })
  serviceRadiusKm?: number;
  @ApiPropertyOptional() rejectionReason?: string;
}

export class ProviderDetailDto extends ProviderDto {
  @ApiProperty({ type: [ProviderStageEventDto] })
  history: ProviderStageEventDto[];
}

export class ProviderListDto {
  @ApiProperty({ type: [ProviderDto] })
  items: ProviderDto[];

  @ApiProperty({ example: 7 })
  total: number;
}

export class RequestDocumentUploadDto {
  @ApiProperty({ enum: DOCUMENT_KINDS })
  @IsIn(DOCUMENT_KINDS)
  kind: string;

  @ApiProperty({ example: 'incorporation-certificate.pdf' })
  @IsString()
  @Length(1, 255)
  filename: string;

  @ApiProperty({ enum: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] })
  @IsString()
  @Length(3, 100)
  contentType: string;
}

export class ConfirmDocumentUploadDto {
  @ApiProperty({ example: 20481, description: 'Byte count the storage layer reported' })
  @IsInt()
  @Min(1)
  sizeBytes: number;
}

export class UploadTicketDto {
  @ApiProperty({ format: 'uuid' })
  documentId: string;

  @ApiProperty({ description: 'PUT the raw bytes here. Short-lived.' })
  uploadUrl: string;

  @ApiProperty({ example: 5242880 })
  maxBytes: number;
}

export class DocumentDto {
  @ApiProperty({ format: 'uuid' }) id: string;

  @ApiPropertyOptional({ type: String, enum: DOCUMENT_KINDS, nullable: true })
  kind?: string | null;

  @ApiProperty() originalFilename: string;
  @ApiProperty() contentType: string;
  @ApiProperty() sizeBytes: number;

  @ApiProperty({ enum: DOCUMENT_STATUSES }) status: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}
