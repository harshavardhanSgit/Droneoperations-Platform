import { ApiProperty } from '@nestjs/swagger';

export class RegisteredOrganisationDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Kumar Agri Services' })
  name: string;

  @ApiProperty({ enum: ['CUSTOMER', 'PROVIDER', 'PLATFORM'] })
  kind: string;

  @ApiProperty({ enum: ['INDIVIDUAL', 'BUSINESS', 'INSTITUTION'] })
  type: string;
}

export class RegisterResponseDto {
  @ApiProperty({ format: 'uuid' })
  userId: string;

  @ApiProperty({ example: 'ramesh@example.com' })
  email: string;

  @ApiProperty({ example: 'Ramesh Kumar' })
  fullName: string;

  @ApiProperty({ type: RegisteredOrganisationDto })
  organisation: RegisteredOrganisationDto;

  @ApiProperty({ enum: ['OWNER', 'MEMBER', 'ADMIN', 'SERVICE_ENGINEER'] })
  role: string;
}
