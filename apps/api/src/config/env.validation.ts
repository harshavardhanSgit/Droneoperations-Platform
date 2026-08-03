import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z
    .string()
    .min(1)
    .refine((v) => v.startsWith('postgresql://') || v.startsWith('postgres://'), {
      message: 'must be a postgresql:// connection string',
    }),

  /** Browser origin allowed to send credentialed requests. */
  WEB_ORIGIN: z.string().min(1).default('http://localhost:3010'),

  /**
   * Signs access tokens. 32 chars is the floor for HS256 — a short secret is
   * brute-forceable offline against any token you have ever issued.
   */
  JWT_ACCESS_SECRET: z.string().min(32),

  /** Seconds, not a duration string. One representation means the signer and
   *  the `expiresIn` reported to the client cannot disagree. */
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),

  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  /** Where this API is reachable. Used to mint storage URLs that point back here. */
  API_PUBLIC_URL: z.string().min(1).default('http://localhost:3000'),

  /** Local-disk storage root, relative to the API working directory. Dev only. */
  STORAGE_LOCAL_DIR: z.string().min(1).default('.storage'),

  /** Hard ceiling on any single upload. */
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(5 * 1024 * 1024),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');

    throw new Error(
      `Invalid environment configuration:\n${details}\n\nCheck your .env file against .env.example.`,
    );
  }

  return parsed.data;
}
