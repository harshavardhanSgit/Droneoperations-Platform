import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

/** Registration can only create the two marketplace sides. */
export enum RegisterAccountType {
  CUSTOMER = 'CUSTOMER',
  PROVIDER = 'PROVIDER',
}

export class RegisterDto {
  @ApiProperty({ example: 'ramesh@example.com' })
  @IsEmail()
  @MaxLength(254)
  email: string;

  /** Length is the only rule. */
  @ApiProperty({ example: 'a long passphrase works best', minLength: 10 })
  @IsString()
  @Length(10, 128)
  password: string;

  @ApiProperty({ example: 'Ramesh Kumar' })
  @IsString()
  @Length(2, 120)
  fullName: string;

  @ApiPropertyOptional({ example: '+919876543210' })
  @IsOptional()
  @Matches(/^\+?[0-9]{7,15}$/, { message: 'phone must be 7-15 digits, optionally starting with +' })
  phone?: string;

  @ApiProperty({ enum: RegisterAccountType, example: RegisterAccountType.CUSTOMER })
  @IsEnum(RegisterAccountType)
  accountType: RegisterAccountType;

  /** Omit for an individual. Supplying it creates a BUSINESS organisation. */
  @ApiPropertyOptional({ example: 'Kumar Agri Services' })
  @IsOptional()
  @IsString()
  @Length(2, 200)
  organisationName?: string;
}
