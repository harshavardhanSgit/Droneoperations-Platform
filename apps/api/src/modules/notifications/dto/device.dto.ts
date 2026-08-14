import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';

export class RegisterDeviceDto {
  /** The FCM registration token. */
  @ApiProperty({ description: 'FCM registration token for this browser' })
  @IsString()
  @Length(10, 4096)
  token: string;

  @ApiPropertyOptional({ example: 'web', default: 'web' })
  @IsOptional()
  @IsIn(['web'])
  platform?: string;
}

export class PushStatusDto {
  @ApiProperty({
    example: true,
    description:
      'Whether the SERVER can send push at all. False when no Firebase credentials are configured — the client uses this to avoid asking for a permission it could not honour.',
  })
  enabled: boolean;
}
