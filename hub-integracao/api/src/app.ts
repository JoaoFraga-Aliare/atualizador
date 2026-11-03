import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import type pg from 'pg';
import { exigirToken } from './auth.js';
import type { Config } from './config.js';
import { carregarEsquema } from './esquema.js';
import { rotasSincronizacao } from './rotas/sincronizacao.js';

export async function criarApp(config: Config, pool: pg.Pool): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      config.NODE_ENV === 'test'
        ? false
        : { level: 'info', redact: ['req.headers.authorization', 'req.headers.cookie'] },
    trustProxy: config.NODE_ENV === 'production', // atrás do reverse proxy com TLS
  });

  await app.register(helmet);
  await app.register(cors, { origin: config.WEB_ORIGEM });
  await app.register(rateLimit, { max: config.RATE_LIMIT_MAX, timeWindow: '1 minute' });

  app.get('/saude', { config: { rateLimit: false } }, async () => {
    await pool.query('SELECT 1');
    return { status: 'ok' };
  });

  // Identidade do token (útil para o PDV validar o token e descobrir empresa/caixa)
  app.get('/v1/eu', { preHandler: exigirToken(pool, 'cadastros:ler') }, async (req) => {
    const { empresaId, caixaId, papel, escopos } = req.identidade!;
    return { empresa_id: empresaId, caixa_id: caixaId ?? null, papel, escopos };
  });

  rotasSincronizacao(app, { pool, tabelas: await carregarEsquema(pool) });

  app.setErrorHandler((erro: Error & { statusCode?: number; code?: string }, req, reply) => {
    if (erro.statusCode && erro.statusCode < 500) {
      return reply.code(erro.statusCode).send({ erro: erro.code ?? 'requisicao_invalida', mensagem: erro.message });
    }
    req.log.error(erro);
    return reply.code(500).send({ erro: 'erro_interno', mensagem: 'Erro interno.' });
  });

  return app;
}
