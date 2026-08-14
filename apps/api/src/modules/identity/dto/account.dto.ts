import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches, ValidateIf } from 'class-validator';

/** Editing your own details. */
export class UpdateAccountDto {
  @ApiPropertyOptional({ example: 'Ramesh Kumar' })
  @IsOptional()
  @IsString()
  @Length(2, 120)
  fullName?: string;

  /**
   * An empty string means "remove my phone number"; omitting the field means "leave it alone".
   */
  @ApiPropertyOptional({
    example: '+919876543210',
    description: 'Empty string clears it. Omit the field to leave it unchanged.',
  })
  @ValidateIf((o: UpdateAccountDto) => o.phone !== undefined && o.phone !== '')
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'phone must be 7-15 digits, optionally starting with +' })
  phone?: string;
}

export class ChangePasswordDto {
  @ApiProperty({ example: 'the passphrase you use today' })
  @IsString()
  @Length(1, 128)
  currentPassword: string;

  /** Length is the only rule, matching registration. */
  @ApiProperty({ example: 'a long passphrase works best', minLength: 10 })
  @IsString()
  @Length(10, 128)
  newPassword: string;
}
