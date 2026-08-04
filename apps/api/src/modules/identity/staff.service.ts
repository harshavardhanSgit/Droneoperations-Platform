import { Injectable } from '@nestjs/common';

import { UserRepository } from './repositories/user.repository';
import { StaffListDto } from './dto/staff.dto';

/**
 * Platform staff, read by the Admin Console.
 *
 * This lives in Identity because Identity owns users — not in modules/admin,
 * which holds controllers and no business logic. Assigning a ticket needs an
 * engineer's id; discovering that id is an Identity question, and answering it
 * anywhere else would put a second owner on the same data.
 */
@Injectable()
export class StaffService {
  constructor(private readonly users: UserRepository) {}

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
}
