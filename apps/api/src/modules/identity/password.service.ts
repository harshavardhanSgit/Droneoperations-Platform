import { Injectable } from '@nestjs/common';
import { argon2id, hash, verify, type HashOptions } from 'argon2';

@Injectable()
export class PasswordService {
  /**
   * OWASP-recommended argon2id parameters. Deliberately slow: ~50-100ms per
   * hash. That is imperceptible on login and makes offline brute-forcing a
   * stolen database table economically painful.
   */
  private readonly options: HashOptions = {
    type: argon2id,
    memoryCost: 19456, // 19 MiB
    timeCost: 2,
    parallelism: 1,
  };

  hash(plaintext: string): Promise<string> {
    return hash(plaintext, this.options);
  }

  verify(storedHash: string, plaintext: string): Promise<boolean> {
    return verify(storedHash, plaintext);
  }
}
