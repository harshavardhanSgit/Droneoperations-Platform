import { ApiProperty } from '@nestjs/swagger';

import { RegisteredOrganisationDto } from './register-response.dto';

export class LoginResponseDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'Short-lived access token. Hold in memory, never in localStorage.',
  })
  accessToken: string;

  @ApiProperty({ example: 900, description: 'Access token lifetime in seconds' })
  expiresIn: number;

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
