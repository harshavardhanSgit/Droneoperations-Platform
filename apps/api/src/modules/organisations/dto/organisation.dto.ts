import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class OrganisationDto {
  @ApiProperty({ format: 'uuid' })
  id: string;

  @ApiProperty({ example: 'Kumar Agri Services' })
  name: string;

  @ApiProperty({ enum: ['CUSTOMER', 'PROVIDER', 'PLATFORM'] })
  kind: string;

  @ApiProperty({ enum: ['INDIVIDUAL', 'BUSINESS', 'INSTITUTION'] })
  type: string;

  @ApiProperty({ enum: ['ACTIVE', 'SUSPENDED'] })
  status: string;

  @ApiProperty({ format: 'date-time' })
  createdAt: string;
}

export class UpdateOrganisationDto {
  @ApiProperty({ example: 'Kumar Agri Services Pvt Ltd' })
  @IsString()
  @Length(2, 200)
  name: string;
}

export class OrganisationListDto {
  @ApiProperty({ type: [OrganisationDto] })
  items: OrganisationDto[];

  @ApiProperty({ example: 12 })
  total: number;
}
