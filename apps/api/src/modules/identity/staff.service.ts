import { Injectable } from '@nestjs/common';

import { ResourceConflictException } from '../../common/errors/app.exception';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { OrganisationRepository } from '../organisations/organisation.repository';
import { CreateStaffDto, StaffListDto, StaffMemberDto } from './dto/staff.dto';
import { PasswordService } from './password.service';
import { UserRepository } from './repositories/user.repository';

const UNIQUE_VIOLATION = 'P2002';

/** Platform staff, read and created by the Admin Console. */
@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UserRepository,
    private readonly organisations: OrganisationRepository,
    private readonly passwords: PasswordService,
  ) {}

  /** Who an open maintenance ticket can be handed to (D12). */
  async listEngineers(): Promise<StaffListDto> {
    const engineers = await this.users.listPlatformStaff('SERVICE_ENGINEER');

    return {
      items: engineers.map((user) => ({
        id: user.id,
        fullName: user.fullName,
        email: user.email,
      })),
      total: engineers.length,
    };
  }

  /** Everyone with access to the platform, admins included. */
  async listStaff(): Promise<StaffListDto> {
    const staff = await this.users.listAllPlatformStaff();

    const items: StaffMemberDto[] = staff.map((user) => ({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      ...(user.memberships[0]?.role ? { role: user.memberships[0].role } : {}),
      createdAt: user.createdAt.toISOString(),
    }));

    return { items, total: items.length };
  }

  /** Create an Admin or Service Engineer. */
  async createStaff(dto: CreateStaffDto): Promise<StaffMemberDto> {
    const email = dto.email.trim().toLowerCase();
    const passwordHash = await this.passwords.hash(dto.password);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await this.organisations.list({ kind: 'PLATFORM' }, { skip: 0, take: 1 }, tx);

        const organisation =
          existing.items[0] ??
          (await this.organisations.create(
            { name: 'Drone Operations Platform', kind: 'PLATFORM', type: 'BUSINESS' },
            tx,
          ));

        const user = await this.users.create(
          { email, passwordHash, fullName: dto.fullName.trim() },
          tx,
        );

        await this.organisations.addMembership(
          { userId: user.id, organisationId: organisation.id, role: dto.role },
          tx,
        );

        return {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          role: dto.role,
          createdAt: user.createdAt.toISOString(),
        };
      });
    } catch (error) {
      // The unique index is the real guard, not a prior existence check — check-then-act loses
      // a race between two admins adding the same person.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === UNIQUE_VIOLATION) {
        throw new ResourceConflictException(
          'EMAIL_ALREADY_REGISTERED',
          'An account with that email already exists',
          { email },
        );
      }

      throw error;
    }
  }
}
