import { Body, Controller, Get, HttpStatus, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { ApiEnvelope, ApiErrorEnvelope } from '../../common/swagger/api-envelope.decorator';
import type { ActorContext } from '../identity/actor-context';
import { CurrentUser } from '../identity/decorators/current-user.decorator';
import { RequirePermissions } from '../identity/decorators/require-permissions.decorator';
import { CustomerService } from './customer.service';
import { CustomerProfileDto, UpdateCustomerProfileDto } from './dto/customer.dto';

@ApiTags('Organisations')
@ApiBearerAuth('access-token')
@Controller('customers/me')
export class CustomerController {
  constructor(private readonly customers: CustomerService) {}

  /** No id in the path — the actor's own organisation comes from their token. */
  @Get()
  @RequirePermissions('organisation:read-own')
  @ApiOperation({
    summary: 'Your saved defaults',
    description:
      'Returns an empty object when nothing has been saved — not a 404, because "not set yet" is a normal state rather than an error.',
  })
  @ApiEnvelope(CustomerProfileDto)
  @ApiErrorEnvelope(HttpStatus.FORBIDDEN, 'Not a customer organisation')
  findOwn(@CurrentUser() actor: ActorContext): Promise<CustomerProfileDto> {
    return this.customers.findOwn(actor);
  }

  @Put()
  @RequirePermissions('organisation:manage-own')
  @ApiOperation({
    summary: 'Save your default field',
    description:
      'Omitting a field leaves it alone; sending null clears it. Saves the search map from opening on the middle of India every time.',
  })
  @ApiEnvelope(CustomerProfileDto)
  @ApiErrorEnvelope(HttpStatus.FORBIDDEN, 'Not a customer organisation')
  @ApiErrorEnvelope(HttpStatus.NOT_FOUND, 'That district is not in the catalogue')
  updateOwn(
    @CurrentUser() actor: ActorContext,
    @Body() dto: UpdateCustomerProfileDto,
  ): Promise<CustomerProfileDto> {
    return this.customers.updateOwn(actor, dto);
  }
}
