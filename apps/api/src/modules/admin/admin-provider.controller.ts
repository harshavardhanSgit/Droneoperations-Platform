import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { ApiEnvelope, ApiErrorEnvelope } from '../../common/swagger/api-envelope.decorator';
import { ProviderStage } from '../../generated/prisma/client';
import type { ActorContext } from '../identity/actor-context';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { RequirePermissions } from '../identity/decorators/require-permissions.decorator';
import {
  DocumentDto,
  ProviderDetailDto,
  ProviderDto,
  ProviderListDto,
  RejectProviderDto,
} from '../organisations/dto/provider.dto';
import { ProviderService } from '../organisations/provider.service';

class ListProvidersQuery extends PaginationQueryDto {
  @ApiPropertyOptional({
    enum: Object.values(ProviderStage),
    description: 'Use UNDER_REVIEW for the review queue',
  })
  @IsOptional()
  @IsEnum(ProviderStage)
  stage?: ProviderStage;
}

class DocumentLinkDto {
  @ApiProperty({ description: 'Short-lived signed URL. Expires in minutes, not hours.' })
  url: string;
}

/** Controllers only. All behaviour belongs to ProviderService. */
@ApiTags('Administration')
@ApiBearerAuth('access-token')
@Controller('admin/providers')
export class AdminProviderController {
  constructor(private readonly providers: ProviderService) {}

  @Get()
  @RequirePermissions('provider:review')
  @ApiOperation({
    summary: 'Provider pipeline',
    description: 'Filter by stage. Ordered oldest-waiting first, so a review queue is FIFO.',
  })
  @ApiEnvelope(ProviderListDto)
  list(@Query() query: ListProvidersQuery): Promise<ProviderListDto> {
    return this.providers.list(
      query.stage ? { stage: query.stage } : {},
      { skip: query.skip, take: query.take },
    );
  }

  @Get(':id')
  @RequirePermissions('provider:review')
  @ApiOperation({ summary: 'One provider, with full stage history' })
  @ApiEnvelope(ProviderDetailDto)
  @ApiErrorEnvelope(HttpStatus.NOT_FOUND, 'No such provider')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ProviderDetailDto> {
    return this.providers.findByIdDetail(id);
  }

  @Get(':id/documents')
  @RequirePermissions('provider:review')
  @ApiOperation({ summary: "A provider's uploaded documents" })
  @ApiEnvelope(DocumentDto, { description: 'Array of documents' })
  listDocuments(@Param('id', ParseUUIDPipe) id: string): Promise<DocumentDto[]> {
    return this.providers.listDocumentsFor(id);
  }

  @Get(':id/documents/:documentId/link')
  @RequirePermissions('provider:review')
  @ApiOperation({
    summary: 'Signed link to view a document',
    description:
      'Returns a short-lived URL rather than the bytes, so the file is served by storage and never by this API.',
  })
  @ApiEnvelope(DocumentLinkDto)
  @ApiErrorEnvelope(HttpStatus.NOT_FOUND, 'Document does not belong to this provider')
  async documentLink(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ): Promise<DocumentLinkDto> {
    return { url: await this.providers.createDocumentDownloadUrl(id, documentId) };
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('provider:review')
  @ApiOperation({
    summary: 'Activate a provider',
    description: 'UNDER_REVIEW → ACTIVATED. BR1 satisfied from this point.',
  })
  @ApiEnvelope(ProviderDto)
  @ApiErrorEnvelope(HttpStatus.CONFLICT, 'Illegal stage transition')
  activate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: ActorContext,
  ): Promise<ProviderDto> {
    return this.providers.activate(id, actor);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('provider:review')
  @ApiOperation({
    summary: 'Reject a provider',
    description:
      'UNDER_REVIEW → REJECTED. A reason is mandatory; the provider may correct it and resubmit.',
  })
  @ApiEnvelope(ProviderDto)
  @ApiErrorEnvelope(HttpStatus.CONFLICT, 'Illegal stage transition')
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: ActorContext,
    @Body() dto: RejectProviderDto,
  ): Promise<ProviderDto> {
    return this.providers.reject(id, actor, dto.reason);
  }
}
