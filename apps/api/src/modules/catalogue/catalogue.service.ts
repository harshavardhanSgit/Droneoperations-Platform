import { Injectable } from '@nestjs/common';

import {
  InvalidInputException,
  ResourceConflictException,
  ResourceNotFoundException,
} from '../../common/errors/app.exception';
import { AreaLevel, type CatalogueStatus } from '../../generated/prisma/client';
import type { AreaModel, ServiceTypeModel } from '../../generated/prisma/models';
import type {
  AreaDto,
  AreaWithPathDto,
  CreateAreaDto,
  CreateServiceTypeDto,
  ServiceTypeDto,
  UpdateServiceTypeDto,
} from './dto/catalogue.dto';
import { CatalogueRepository } from './catalogue.repository';

/** A DISTRICT's parent must be a STATE, a TALUKA's must be a DISTRICT. */
const REQUIRED_PARENT_LEVEL: Record<AreaLevel, AreaLevel | null> = {
  STATE: null,
  DISTRICT: AreaLevel.STATE,
  TALUKA: AreaLevel.DISTRICT,
};

@Injectable()
export class CatalogueService {
  constructor(private readonly catalogue: CatalogueRepository) {}

  // -------------------------------------------------------- service types

  async listServiceTypes(includeRetired = false): Promise<ServiceTypeDto[]> {
    const types = await this.catalogue.listServiceTypes(includeRetired ? undefined : 'ACTIVE');

    return types.map((type) => this.toServiceTypeDto(type));
  }

  async createServiceType(dto: CreateServiceTypeDto): Promise<ServiceTypeDto> {
    if (await this.catalogue.findServiceTypeByCode(dto.code)) {
      throw new ResourceConflictException(
        'SERVICE_TYPE_CODE_TAKEN',
        `A service type with code ${dto.code} already exists`,
        { code: dto.code },
      );
    }

    return this.toServiceTypeDto(
      await this.catalogue.createServiceType({
        code: dto.code,
        name: dto.name.trim(),
        description: dto.description?.trim(),
        pricingUnit: dto.pricingUnit,
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      }),
    );
  }

  async updateServiceType(id: string, dto: UpdateServiceTypeDto): Promise<ServiceTypeDto> {
    await this.requireServiceType(id);

    return this.toServiceTypeDto(
      await this.catalogue.updateServiceType(id, {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description.trim() || null } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      }),
    );
  }

  /** Used by Offerings and Booking to reject retired or unknown service types. */
  async requireActiveServiceType(id: string): Promise<ServiceTypeModel> {
    const type = await this.requireServiceType(id);

    if (type.status !== 'ACTIVE') {
      throw new InvalidInputException('That service is no longer offered', {
        serviceTypeId: id,
        status: type.status,
      });
    }

    return type;
  }

  // ----------------------------------------------------------------- areas

  /** One level at a time — that is all a cascading picker needs. */
  async listAreas(parentId?: string, includeRetired = false): Promise<AreaDto[]> {
    const status: CatalogueStatus | undefined = includeRetired ? undefined : 'ACTIVE';

    const areas = await this.catalogue.listAreas({
      // null (not undefined) means "top level only" rather than "any parent".
      parentId: parentId ?? null,
      ...(status ? { status } : {}),
    });

    return areas.map((area) => this.toAreaDto(area));
  }

  async getAreaWithPath(id: string): Promise<AreaWithPathDto> {
    const chain = await this.catalogue.ancestorsOf(id);
    const area = chain.at(-1);

    if (!area) {
      throw new ResourceNotFoundException('Area', id);
    }

    return {
      ...this.toAreaDto(area),
      path: [...chain].reverse().map((node) => node.name).join(', '),
    };
  }

  /**
   * The database cannot enforce that a DISTRICT's parent is a STATE — one
   * self-referencing table has no way to express that. So the service does.
   */
  async createArea(dto: CreateAreaDto): Promise<AreaDto> {
    const requiredParent = REQUIRED_PARENT_LEVEL[dto.level];

    if (requiredParent === null && dto.parentId) {
      throw new InvalidInputException('A STATE cannot have a parent');
    }

    if (requiredParent !== null) {
      if (!dto.parentId) {
        throw new InvalidInputException(`A ${dto.level} requires a ${requiredParent} parent`);
      }

      const parent = await this.catalogue.findAreaById(dto.parentId);

      if (!parent) {
        throw new ResourceNotFoundException('Area', dto.parentId);
      }

      if (parent.level !== requiredParent) {
        throw new InvalidInputException(
          `A ${dto.level} must sit under a ${requiredParent}, not a ${parent.level}`,
          { parentLevel: parent.level, expected: requiredParent },
        );
      }
    }

    return this.toAreaDto(
      await this.catalogue.createArea({
        parentId: dto.parentId,
        level: dto.level,
        name: dto.name.trim(),
        code: dto.code?.trim(),
      }),
    );
  }

  async requireActiveArea(id: string): Promise<AreaModel> {
    const area = await this.catalogue.findAreaById(id);

    if (!area) {
      throw new ResourceNotFoundException('Area', id);
    }

    if (area.status !== 'ACTIVE') {
      throw new InvalidInputException('That area is no longer available', { areaId: id });
    }

    return area;
  }

  // --------------------------------------------------------------- private

  private async requireServiceType(id: string): Promise<ServiceTypeModel> {
    const type = await this.catalogue.findServiceTypeById(id);

    if (!type) {
      throw new ResourceNotFoundException('Service type', id);
    }

    return type;
  }

  private toServiceTypeDto(type: ServiceTypeModel): ServiceTypeDto {
    return {
      id: type.id,
      code: type.code,
      name: type.name,
      ...(type.description ? { description: type.description } : {}),
      pricingUnit: type.pricingUnit,
      status: type.status,
      sortOrder: type.sortOrder,
    };
  }

  private toAreaDto(area: AreaModel): AreaDto {
    return {
      id: area.id,
      ...(area.parentId ? { parentId: area.parentId } : {}),
      level: area.level,
      name: area.name,
      ...(area.code ? { code: area.code } : {}),
      status: area.status,
    };
  }
}
