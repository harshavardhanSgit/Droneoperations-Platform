import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { NotificationType } from '../../../generated/prisma/client';

export class NotificationDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: Object.values(NotificationType) }) type: string;
  @ApiProperty({ example: 'Kumar Agri Services declined your booking' }) title: string;
  @ApiPropertyOptional() body?: string;
  @ApiPropertyOptional({ format: 'uuid', description: 'Where clicking it should go' }) bookingId?: string;
  @ApiProperty({ example: false }) read: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}

export class NotificationListDto {
  @ApiProperty({ type: [NotificationDto] }) items: NotificationDto[];
  @ApiProperty({ example: 12 }) total: number;
  @ApiProperty({ example: 3 }) unread: number;
}
