import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';

import { PaginationQueryDto, pageOf } from '../../common/dto/pagination.dto';
import { ApiEnvelope } from '../../common/swagger/api-envelope.decorator';
import type { ActorContext } from '../identity/actor-context';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { PushStatusDto, RegisterDeviceDto } from './dto/device.dto';
import { NotificationListDto } from './dto/notification.dto';
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
    return this.notifications.list(actor, pageOf(query));
  }

  /**
   * Whether push is available at all.
   *
   * The client asks BEFORE prompting for notification permission. A browser
   * only ever asks once — deny it and the prompt is gone for good — so asking
   * on a server that cannot send would burn the user's single chance on
   * nothing.
   */
  @Get('push-status')
  @ApiOperation({ summary: 'Whether the server can send push notifications' })
  @ApiEnvelope(PushStatusDto)
  pushStatus(): PushStatusDto {
    return { enabled: this.notifications.pushEnabled };
  }

  @Post('devices')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Register this browser for push',
    description:
      'Idempotent — FCM re-issues the same token to the same browser, so this upserts rather than accumulating a row per page load.',
  })
  async registerDevice(
    @CurrentUser() actor: ActorContext,
    @Body() dto: RegisterDeviceDto,
  ): Promise<void> {
    await this.notifications.registerDevice(actor, dto.token, dto.platform ?? 'web');
  }

  /**
   * No ownership check, deliberately: possession of the token IS the claim.
   *
   * It arrives from the browser that holds it, and the only thing an attacker
   * could achieve by guessing one is to stop someone's notifications — an
   * outcome the owner can undo by re-registering, and which needs a
   * 4096-character secret to attempt.
   */
  @Delete('devices')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Unregister this browser',
    description: 'Called on sign-out, so a shared browser stops ringing for the last user.',
  })
  async unregisterDevice(@Body() dto: RegisterDeviceDto): Promise<void> {
    await this.notifications.unregisterDevice(dto.token);
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
