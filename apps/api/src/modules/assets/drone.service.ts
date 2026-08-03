import { Injectable } from '@nestjs/common';

import { ResourceConflictException, ResourceNotFoundException } from '../../common/errors/app.exception';
import { Prisma } from '../../generated/prisma/client';
import type { DroneModel } from '../../generated/prisma/models';
import type { ActorContext } from '../identity/actor-context';
import { ProviderRepository } from '../organisations/provider.repository';
import type { CreateDroneDto, DroneDto, UpdateDroneDto } from './dto/drone.dto';
import { DroneRepository, type DroneWithTicketCount } from './drone.repository';

const UNIQUE_VIOLATION = 'P2002';

@Injectable()
export class DroneService {
  constructor(
    private readonly drones: DroneRepository,
    private readonly providers: ProviderRepository,
  ) {}

  async listOwn(actor: ActorContext): Promise<DroneDto[]> {
    const provider = await this.requireProvider(actor);
    const drones = await this.drones.listForProvider(provider.id);

    return drones.map((drone) => this.toDto(drone));
  }

  async create(actor: ActorContext, dto: CreateDroneDto): Promise<DroneDto> {
    const provider = await this.requireProvider(actor);

    try {
      const drone = await this.drones.create({
        providerId: provider.id,
        model: dto.model.trim(),
        registrationNumber: dto.registrationNumber.trim().toUpperCase(),
        capacityLitres: dto.capacityLitres,
      });

      return this.toDto({ ...drone, _count: { tickets: 0 } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION) {
        throw new ResourceConflictException(
          'REGISTRATION_ALREADY_EXISTS',
          'That registration number is already on the platform',
          { registrationNumber: dto.registrationNumber },
        );
      }
      throw error;
    }
  }

  async update(actor: ActorContext, id: string, dto: UpdateDroneDto): Promise<DroneDto> {
    const drone = await this.requireOwnDrone(actor, id);

    // A provider cannot declare a grounded drone serviceable — only closing the
    // maintenance ticket can do that. Otherwise the flag and reality diverge.
    if (dto.serviceability && drone.serviceability === 'UNDER_MAINTENANCE') {
      throw new ResourceConflictException(
        'DRONE_UNDER_MAINTENANCE',
        'This drone has an open maintenance ticket. Close it to change availability.',
      );
    }

    const updated = await this.drones.update(id, {
      ...(dto.model !== undefined ? { model: dto.model.trim() } : {}),
      ...(dto.capacityLitres !== undefined ? { capacityLitres: dto.capacityLitres } : {}),
      ...(dto.serviceability !== undefined ? { serviceability: dto.serviceability } : {}),
    });

    return this.toDto({
      ...updated,
      _count: { tickets: await this.drones.countOpenTickets(id) },
    });
  }

  /** Used by Field Service to check ownership before raising a ticket. */
  async requireOwnDrone(actor: ActorContext, id: string): Promise<DroneModel> {
    const provider = await this.requireProvider(actor);
    const drone = await this.drones.findById(id);

    if (!drone || drone.providerId !== provider.id) {
      throw new ResourceNotFoundException('Drone', id);
    }

    return drone;
  }

  private async requireProvider(actor: ActorContext) {
    const provider = await this.providers.findByOrganisation(actor.organisationId);

    if (!provider) {
      throw new ResourceNotFoundException('Provider profile', actor.organisationId);
    }

    return provider;
  }

  private toDto(drone: DroneWithTicketCount): DroneDto {
    return {
      id: drone.id,
      model: drone.model,
      registrationNumber: drone.registrationNumber,
      ...(drone.capacityLitres !== null ? { capacityLitres: drone.capacityLitres } : {}),
      serviceability: drone.serviceability,
      openTickets: drone._count.tickets,
    };
  }
}
