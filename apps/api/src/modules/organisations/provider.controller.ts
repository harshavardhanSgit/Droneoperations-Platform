import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiEnvelope, ApiErrorEnvelope } from '../../common/swagger/api-envelope.decorator';
import type { ActorContext } from '../identity/actor-context';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { RequirePermissions } from '../identity/decorators/require-permissions.decorator';
import {
  ConfirmDocumentUploadDto,
  DocumentDto,
  ProviderDetailDto,
  ProviderDto,
  RequestDocumentUploadDto,
  UpdateProviderProfileDto,
  UploadTicketDto,
} from './dto/provider.dto';
import { ProviderService } from './provider.service';

@ApiTags('Provider onboarding')
@ApiBearerAuth('access-token')
@Controller('providers/me')
export class ProviderController {
  constructor(private readonly providers: ProviderService) {}

  @Get()
  @RequirePermissions('provider:read-own')
  @ApiOperation({
    summary: 'Your onboarding status',
    description: 'Current stage, business details, and the full stage history.',
  })
  @ApiEnvelope(ProviderDetailDto)
  @ApiErrorEnvelope(HttpStatus.FORBIDDEN, 'Not a provider organisation')
  findOwn(@CurrentUser() actor: ActorContext): Promise<ProviderDetailDto> {
    return this.providers.findOwn(actor);
  }

  @Put('profile')
  @RequirePermissions('provider:manage-own')
  @ApiOperation({
    summary: 'Save business details',
    description: 'Advances REGISTERED (or REJECTED) to PROFILE_COMPLETE. Locked while UNDER_REVIEW.',
  })
  @ApiEnvelope(ProviderDto)
  @ApiErrorEnvelope(HttpStatus.CONFLICT, 'Not editable in the current stage')
  updateProfile(
    @CurrentUser() actor: ActorContext,
    @Body() dto: UpdateProviderProfileDto,
  ): Promise<ProviderDto> {
    return this.providers.updateOwnProfile(actor, dto);
  }

  @Post('documents')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('provider:manage-own')
  @ApiOperation({
    summary: 'Request a document upload URL',
    description:
      'Step 1 of 3. Returns a short-lived URL to PUT the bytes to. The API never receives the file.',
  })
  @ApiEnvelope(UploadTicketDto, { status: HttpStatus.CREATED })
  requestUpload(
    @CurrentUser() actor: ActorContext,
    @Body() dto: RequestDocumentUploadDto,
  ): Promise<UploadTicketDto> {
    return this.providers.requestDocumentUpload(actor, dto);
  }

  @Post('documents/:id/confirm')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('provider:manage-own')
  @ApiOperation({
    summary: 'Confirm a document upload',
    description: 'Step 3 of 3. Marks it READY. The first confirmation advances the stage.',
  })
  @ApiEnvelope(DocumentDto)
  confirmUpload(
    @CurrentUser() actor: ActorContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmDocumentUploadDto,
  ): Promise<DocumentDto> {
    return this.providers.confirmDocumentUpload(actor, id, dto.sizeBytes);
  }

  @Get('documents')
  @RequirePermissions('provider:read-own')
  @ApiOperation({ summary: 'Your uploaded documents' })
  @ApiEnvelope(DocumentDto, { description: 'Array of documents' })
  listDocuments(@CurrentUser() actor: ActorContext): Promise<DocumentDto[]> {
    return this.providers.listOwnDocuments(actor);
  }

  @Post('submit')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('provider:manage-own')
  @ApiOperation({
    summary: 'Submit for review',
    description: 'PROFILE_COMPLETE → UNDER_REVIEW. Details are frozen until staff decide.',
  })
  @ApiEnvelope(ProviderDto)
  @ApiErrorEnvelope(HttpStatus.CONFLICT, 'Illegal stage transition')
  submit(@CurrentUser() actor: ActorContext): Promise<ProviderDto> {
    return this.providers.submitForReview(actor);
  }
}
