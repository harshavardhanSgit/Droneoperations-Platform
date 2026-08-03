import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

import { RegisteredOrganisationDto } from './register-response.dto';

export class MeResponseDto {
  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({ example: 'ramesh@example.com' })
  email: string;

  @ApiProperty({ example: 'Ramesh Kumar' })
  fullName: string;

  @ApiPropertyOptional({ example: '+919876543210' })
  phone?: string;

  @ApiProperty({ type: RegisteredOrganisationDto })
  organisation: RegisteredOrganisationDto;

  @ApiProperty({ enum: ['OWNER', 'MEMBER', 'ADMIN', 'SERVICE_ENGINEER'] })
  role: string;
}
