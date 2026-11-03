import { z } from 'zod';

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(3333),
  HOST: z.string().default('127.0.0.1'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatória'),
  // 32 bytes em base64 (AES-256-GCM)
  SEGREDOS_CHAVE: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'SEGREDOS_CHAVE deve ter 32 bytes em base64'),
  WEB_ORIGEM: z.string().default('http://localhost:3000'),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
});

export type Config = z.infer<typeof esquema>;

export function carregarConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const r = esquema.safeParse(env);
  if (!r.success) {
    const problemas = r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuração inválida: ${problemas}`);
  }
  return r.data;
}
