import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'ramesh@example.com' })
  @IsEmail()
  @MaxLength(254)
  email: string;

  /**
   * No Length(10) here on purpose. Login must accept whatever the user
   * previously registered with — tightening the rule later would lock out
   * existing accounts. Registration is where policy is enforced.
   */
  @ApiProperty({ example: 'a long passphrase' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;
}
