import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import { exigirToken } from '../auth.js';
import { comTenant } from '../db.js';
import { ident, type InfoTabela } from '../esquema.js';

interface Deps {
  pool: pg.Pool;
  tabelas: Map<string, InfoTabela>;
}

const MAX_REGISTROS = 1000;
const registro = z.record(z.string(), z.unknown());
const corpoCadastro = z.object({ registros: z.array(registro).min(1).max(MAX_REGISTROS) });
const corpoMovimento = z.object({ id: z.string().uuid(), dados: registro });
const consultaCadastro = z.object({
  desde: z.coerce.number().int().min(0).default(0),
  limite: z.coerce.number().int().min(1).max(MAX_REGISTROS).default(500),
});

function desconhecidas(tabela: InfoTabela, registros: Record<string, unknown>[]): string[] {
  const aceitas = new Set(tabela.colunas);
  return [...new Set(registros.flatMap((r) => Object.keys(r)).filter((k) => !aceitas.has(k)))];
}

/** Traduz erros do Postgres em respostas 4xx; o resto vira 500 genérico (tratado pelo Fastify). */
function erroDeBanco(e: unknown) {
  const code = (e as { code?: string }).code;
  if (code === '23502' || code === '22P02' || code === '22003' || code === '22007' || code === '22001')
    return { status: 400, erro: 'dados_invalidos', mensagem: 'Registro com valor ausente ou em formato inválido.' };
  if (code === '23505')
    return { status: 409, erro: 'conflito', mensagem: 'Registro conflita com outro já existente.' };
  if (code === '42501')
    return { status: 403, erro: 'proibido', mensagem: 'Operação não permitida para este token.' };
  return null;
}

export function rotasSincronizacao(app: FastifyInstance, { pool, tabelas }: Deps) {
  const buscar = (tipo: InfoTabela['tipo']) => (nome: string) => {
    const t = tabelas.get(nome);
    return t && t.tipo === tipo ? t : undefined;
  };
  const cadastro = buscar('cadastro');
  const movimento = buscar('movimento');

  // ERP -> Hub (token da empresa): upsert em lote, chave = PK original dentro da empresa
  app.put<{ Params: { tabela: string } }>(
    '/v1/cadastros/:tabela',
    { preHandler: exigirToken(pool, 'cadastros:escrever'), bodyLimit: 20 * 1024 * 1024 },
    async (req, reply) => {
      const t = cadastro(req.params.tabela);
      if (!t || t.chave.length === 0) return reply.code(404).send({ erro: 'tabela_desconhecida' });
      const corpo = corpoCadastro.safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: 'corpo_invalido', detalhes: corpo.error.issues });
      const extras = desconhecidas(t, corpo.data.registros);
      if (extras.length) return reply.code(400).send({ erro: 'campos_desconhecidos', campos: extras });

      const cols = t.colunas.map(ident).join(', ');
      const sel = t.colunas.map((c) => t.selecao[c]).join(', ');
      const atualiza = t.colunas.filter((c) => !t.chave.includes(c)).map((c) => `${ident(c)} = EXCLUDED.${ident(c)}`);
      const sql = `INSERT INTO ${ident(t.nome)} (empresa_id, ${cols})
                   SELECT $1, ${sel} FROM jsonb_populate_recordset(null::${ident(t.nome)}, $2::jsonb)
                   ON CONFLICT (empresa_id, ${t.chave.map(ident).join(', ')})
                   DO ${atualiza.length ? `UPDATE SET ${atualiza.join(', ')}` : 'NOTHING'}`;
      try {
        const id = req.identidade!;
        const n = await comTenant(pool, id, async (c) => {
          const r = await c.query(sql, [id.empresaId, JSON.stringify(corpo.data.registros)]);
          await c.query(
            `INSERT INTO auditoria (empresa_id, ator_tipo, ator_id, acao, alvo, detalhes, ip)
             VALUES ($1, 'token', $2, 'cadastro.upsert', $3, $4, $5)`,
            [id.empresaId, id.tokenId, t.nome, { registros: r.rowCount }, req.ip],
          );
          return r.rowCount ?? 0;
        });
        return { tabela: t.nome, gravados: n };
      } catch (e) {
        const m = erroDeBanco(e);
        if (!m) throw e;
        return reply.code(m.status).send({ erro: m.erro, mensagem: m.mensagem });
      }
    },
  );

  // Hub -> PDV (token da empresa ou do caixa): leitura incremental por cursor (hub_versao)
  app.get<{ Params: { tabela: string } }>(
    '/v1/cadastros/:tabela',
    { preHandler: exigirToken(pool, 'cadastros:ler') },
    async (req, reply) => {
      const t = cadastro(req.params.tabela);
      if (!t) return reply.code(404).send({ erro: 'tabela_desconhecida' });
      const q = consultaCadastro.safeParse(req.query);
      if (!q.success) return reply.code(400).send({ erro: 'consulta_invalida', detalhes: q.error.issues });
      const id = req.identidade!;
      const linhas = await comTenant(pool, id, async (c) => {
        const r = await c.query(
          `SELECT ${t.colunas.map(ident).join(', ')}, hub_versao FROM ${ident(t.nome)}
            WHERE hub_versao > $1 ORDER BY hub_versao LIMIT $2`,
          [q.data.desde, q.data.limite],
        );
        return r.rows as Array<Record<string, unknown> & { hub_versao: string }>;
      });
      const ultimo = linhas.at(-1);
      return { registros: linhas, cursor: ultimo ? Number(ultimo.hub_versao) : q.data.desde };
    },
  );

  // PDV -> Hub (token do caixa): idempotente pelo UUID gerado no caixa
  app.post<{ Params: { tabela: string } }>(
    '/v1/movimento/:tabela',
    { preHandler: exigirToken(pool, 'movimento:escrever'), bodyLimit: 5 * 1024 * 1024 },
    async (req, reply) => {
      const t = movimento(req.params.tabela);
      if (!t) return reply.code(404).send({ erro: 'tabela_desconhecida' });
      const corpo = corpoMovimento.safeParse(req.body);
      if (!corpo.success) return reply.code(400).send({ erro: 'corpo_invalido', detalhes: corpo.error.issues });
      const extras = desconhecidas(t, [corpo.data.dados]);
      if (extras.length) return reply.code(400).send({ erro: 'campos_desconhecidos', campos: extras });

      const cols = t.colunas.map(ident).join(', ');
      const sel = t.colunas.map((c) => t.selecao[c]).join(', ');
      const sql = `INSERT INTO ${ident(t.nome)} (empresa_id, caixa_id, id, ${cols})
                   SELECT $1, $2, $3, ${sel} FROM jsonb_populate_record(null::${ident(t.nome)}, $4::jsonb)
                   ON CONFLICT (empresa_id, id) DO NOTHING`;
      try {
        const id = req.identidade!;
        const novo = await comTenant(pool, id, async (c) => {
          const r = await c.query(sql, [id.empresaId, id.caixaId, corpo.data.id, JSON.stringify(corpo.data.dados)]);
          if (r.rowCount) {
            await c.query(
              `INSERT INTO auditoria (empresa_id, ator_tipo, ator_id, acao, alvo, detalhes, ip)
               VALUES ($1, 'token', $2, 'movimento.recebido', $3, $4, $5)`,
              [id.empresaId, id.tokenId, t.nome, { id: corpo.data.id, caixa_id: id.caixaId }, req.ip],
            );
          }
          return (r.rowCount ?? 0) > 0;
        });
        // reenvio do mesmo UUID: 200 sem duplicar; primeira vez: 201
        return reply.code(novo ? 201 : 200).send({ id: corpo.data.id, duplicada: !novo });
      } catch (e) {
        const m = erroDeBanco(e);
        if (!m) throw e;
        return reply.code(m.status).send({ erro: m.erro, mensagem: m.mensagem });
      }
    },
  );
}
