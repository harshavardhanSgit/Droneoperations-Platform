import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches, ValidateIf } from 'class-validator';

/**
 * Editing your own details.
 *
 * NO EMAIL FIELD, deliberately. Email is the login identity, so changing it is
 * a verification flow — prove the new address, keep the old one working until
 * then — not a profile edit. Accepting it here would let anyone holding a
 * stolen access token lock the real owner out of their own account in one
 * request.
 */
export class UpdateAccountDto {
  @ApiPropertyOptional({ example: 'Ramesh Kumar' })
  @IsOptional()
  @IsString()
  @Length(2, 120)
  fullName?: string;

  /**
   * An empty string means "remove my phone number"; omitting the field means
   * "leave it alone". Those are different intents and the API must be able to
   * tell them apart — a single optional field that treats "" as absent gives
   * the user no way to delete a number they entered by mistake.
   *
   * ValidateIf rather than IsOptional: IsOptional short-circuits every other
   * validator on undefined AND on null, which would let a null through the
   * pattern check.
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

  /**
   * Length is the only rule, matching registration. NIST 800-63B explicitly
   * advises AGAINST composition requirements — they push people toward
   * predictable substitutions like "Password1!" and add no real entropy.
   */
  @ApiProperty({ example: 'a long passphrase works best', minLength: 10 })
  @IsString()
  @Length(10, 128)
  newPassword: string;
}
