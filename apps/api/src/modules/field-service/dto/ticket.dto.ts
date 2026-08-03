import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Min } from 'class-validator';

import { TicketStatus } from '../../../generated/prisma/client';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class RaiseTicketDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  droneId: string;

  @ApiProperty({ example: 'Pump losing pressure mid-flight; spray pattern uneven on the right boom.' })
  @IsString()
  @Length(10, 1000)
  description: string;
}

export class AssignEngineerDto {
  @ApiProperty({ format: 'uuid', description: 'A user with the SERVICE_ENGINEER role' })
  @IsUUID()
  engineerUserId: string;
}

export class RequestReportUploadDto {
  @ApiProperty({ example: 'service-report.pdf' })
  @IsString()
  @Length(1, 255)
  filename: string;

  @ApiProperty({ enum: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] })
  @IsString()
  @Length(3, 100)
  contentType: string;
}

export class ConfirmReportUploadDto {
  @ApiProperty({ example: 20481 })
  @IsInt()
  @Min(1)
  sizeBytes: number;
}

export class CloseTicketDto {
  @ApiProperty({ example: 'Replaced pump diaphragm and recalibrated nozzles.' })
  @IsString()
  @Length(10, 1000)
  resolutionNote: string;

  @ApiProperty({ format: 'uuid', description: 'BR11 — a ticket cannot be closed without a report' })
  @IsUUID()
  reportDocumentId: string;
}

export class TicketQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: Object.values(TicketStatus) })
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;
}

export class TicketEventDto {
  @ApiPropertyOptional({ enum: Object.values(TicketStatus) }) fromStatus?: string;
  @ApiProperty({ enum: Object.values(TicketStatus) }) toStatus: string;
  @ApiPropertyOptional() note?: string;
  @ApiProperty({ format: 'date-time' }) at: string;
}

export class TicketDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: Object.values(TicketStatus) }) status: string;
  @ApiProperty({ example: 'Marut AG365' }) droneModel: string;
  @ApiProperty({ example: 'UIN-TG-0042' }) droneRegistration: string;
  @ApiProperty({ example: 'Kumar Agri Services' }) providerName: string;
  @ApiProperty() description: string;
  @ApiPropertyOptional({ format: 'uuid' }) assignedEngineerUserId?: string;
  @ApiPropertyOptional() resolutionNote?: string;
  @ApiPropertyOptional({ format: 'uuid' }) reportDocumentId?: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}

export class TicketDetailDto extends TicketDto {
  @ApiProperty({ type: [TicketEventDto] }) history: TicketEventDto[];
}

export class TicketListDto {
  @ApiProperty({ type: [TicketDto] }) items: TicketDto[];
  @ApiProperty({ example: 3 }) total: number;
}
