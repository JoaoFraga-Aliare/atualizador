// Cria uma empresa de desenvolvimento com 1 caixa e imprime os tokens UMA vez.
// Só para ambiente local: nunca rodar em produção.
import { comAdmin, criarPool } from '../src/db.js';
import { emitirToken } from '../src/seguranca/tokens.js';

if (process.env.NODE_ENV === 'production') throw new Error('seed-dev não roda em produção');
const pool = criarPool(process.env.DATABASE_URL ?? '');

const r = await comAdmin(pool, async (c) => {
  const e = await c.query(
    `INSERT INTO empresa (razao_social, cnpj, cota_caixas) VALUES ('Empresa Dev', $1, 3) RETURNING id`,
    [String(Date.now()).padStart(14, '0').slice(-14)],
  );
  const empresaId: string = e.rows[0].id;
  const cx = await c.query(
    `INSERT INTO caixa (empresa_id, codigo, nome, serie_nfce) VALUES ($1, 1, 'Caixa 1', '1') RETURNING id`,
    [empresaId],
  );
  return {
    empresaId,
    tokenEmpresa: (await emitirToken(c, { tipo: 'empresa', empresaId, descricao: 'dev' })).valor,
    tokenCaixa: (await emitirToken(c, { tipo: 'caixa', empresaId, caixaId: cx.rows[0].id, descricao: 'dev' })).valor,
  };
});
console.log(JSON.stringify(r, null, 2));
await pool.end();
