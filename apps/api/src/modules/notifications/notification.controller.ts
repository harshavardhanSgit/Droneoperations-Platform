import { Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';

import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { ApiEnvelope } from '../../common/swagger/api-envelope.decorator';
import type { ActorContext } from '../identity/actor-context';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { NotificationDto, NotificationListDto } from './dto/notification.dto';
import { NotificationService } from './notification.service';

class UnreadCountDto {
  @ApiProperty({ example: 3 })
  unread: number;
}

@ApiTags('Notifications')
@ApiBearerAuth('access-token')
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'Your organisation’s notifications' })
  @ApiEnvelope(NotificationListDto)
  list(
    @CurrentUser() actor: ActorContext,
    @Query() query: PaginationQueryDto,
  ): Promise<NotificationListDto> {
    return this.notifications.list(actor, { skip: query.skip, take: query.take });
  }

  @Get('unread-count')
  @ApiOperation({
    summary: 'Unread count',
    description: 'Cheap enough to poll. Real-time delivery (SSE) is a V2 transport change.',
  })
  @ApiEnvelope(UnreadCountDto)
  async unread(@CurrentUser() actor: ActorContext): Promise<UnreadCountDto> {
    return { unread: await this.notifications.unreadCount(actor) };
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark one as read' })
  markRead(
    @CurrentUser() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.notifications.markRead(actor, id);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark everything as read' })
  markAllRead(@CurrentUser() actor: ActorContext): Promise<void> {
    return this.notifications.markAllRead(actor);
  }
}
