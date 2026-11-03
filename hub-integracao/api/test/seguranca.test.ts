import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { comAdmin, comTenant } from '../src/db.js';
import { criarCofre } from '../src/seguranca/cripto.js';
import { rotacionarToken, revogarToken } from '../src/seguranca/tokens.js';
import { CHAVE_TESTE, auth, criarEmpresa, iniciar } from './ajuda.js';

type Ctx = Awaited<ReturnType<typeof iniciar>>;
type Emp = Awaited<ReturnType<typeof criarEmpresa>>;
let h: Ctx;
let A: Emp;
let B: Emp;

beforeAll(async () => {
  h = await iniciar();
  A = await criarEmpresa(h.pool, 2);
  B = await criarEmpresa(h.pool, 1);
});
afterAll(async () => h.fechar());

const produto = (n: number, extra = {}) => ({ pro_codigo: n, pro_descricao: `Produto ${n}`, ...extra });
const putProdutos = (token: string, registros: unknown[]) =>
  h.app.inject({ method: 'PUT', url: '/v1/cadastros/produto', headers: auth(token), payload: { registros } });

describe('saúde e autenticação por token', () => {
  it('health check responde ok', async () => {
    const r = await h.app.inject({ method: 'GET', url: '/saude' });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({ status: 'ok' });
  });

  it('sem token ou com token inválido -> 401 com a mesma resposta', async () => {
    const sem = await h.app.inject({ method: 'GET', url: '/v1/eu' });
    const ruim = await h.app.inject({ method: 'GET', url: '/v1/eu', headers: auth('hub_emp_' + 'x'.repeat(43)) });
    expect(sem.statusCode).toBe(401);
    expect(ruim.statusCode).toBe(401);
    expect(ruim.json()).toEqual(sem.json());
  });

  it('token revogado -> 401', async () => {
    const t = await comAdmin(h.pool, async (c) => {
      const { emitirToken } = await import('../src/seguranca/tokens.js');
      const novo = await emitirToken(c, { tipo: 'empresa', empresaId: A.empresaId });
      await revogarToken(c, novo.id);
      return novo;
    });
    const r = await h.app.inject({ method: 'GET', url: '/v1/eu', headers: auth(t.valor) });
    expect(r.statusCode).toBe(401);
  });

  it('token expirado -> 401', async () => {
    const t = await comAdmin(h.pool, async (c) => {
      const { emitirToken } = await import('../src/seguranca/tokens.js');
      return emitirToken(c, { tipo: 'empresa', empresaId: A.empresaId, expiraEm: new Date(Date.now() - 1000) });
    });
    expect((await h.app.inject({ method: 'GET', url: '/v1/eu', headers: auth(t.valor) })).statusCode).toBe(401);
  });

  it('o valor do token não é guardado no banco, só o hash', async () => {
    const r = await comAdmin(h.pool, (c) =>
      c.query(`SELECT count(*)::int n FROM token_acesso WHERE encode(hash,'escape') = $1 OR prefixo = $1`, [A.tokenEmpresa.valor]),
    );
    expect(r.rows[0].n).toBe(0);
  });

  it('rotação emite token novo e revoga o antigo', async () => {
    const novo = await comAdmin(h.pool, async (c) => {
      const { emitirToken } = await import('../src/seguranca/tokens.js');
      const antigo = await emitirToken(c, { tipo: 'empresa', empresaId: A.empresaId });
      return { antigo, novo: await rotacionarToken(c, antigo.id) };
    });
    expect((await h.app.inject({ method: 'GET', url: '/v1/eu', headers: auth(novo.antigo.valor) })).statusCode).toBe(401);
    expect((await h.app.inject({ method: 'GET', url: '/v1/eu', headers: auth(novo.novo.valor) })).statusCode).toBe(200);
  });

  it('/v1/eu identifica empresa e caixa do token', async () => {
    const r = await h.app.inject({ method: 'GET', url: '/v1/eu', headers: auth(A.caixas[0]!.token.valor) });
    expect(r.json()).toMatchObject({ empresa_id: A.empresaId, caixa_id: A.caixas[0]!.id, papel: 'caixa' });
  });
});

describe('escopos', () => {
  it('token de caixa não escreve cadastros (403)', async () => {
    const r = await putProdutos(A.caixas[0]!.token.valor, [produto(1)]);
    expect(r.statusCode).toBe(403);
    expect(r.json().erro).toBe('escopo_insuficiente');
  });

  it('token de empresa não envia movimento (403)', async () => {
    const r = await h.app.inject({
      method: 'POST', url: '/v1/movimento/venda', headers: auth(A.tokenEmpresa.valor),
      payload: { id: randomUUID(), dados: { ven_codigo: 1 } },
    });
    expect(r.statusCode).toBe(403);
  });

  it('empresa grava cadastros e caixa lê incrementalmente por cursor', async () => {
    expect((await putProdutos(A.tokenEmpresa.valor, [produto(10), produto(11)])).json().gravados).toBe(2);
    const l1 = (await h.app.inject({ method: 'GET', url: '/v1/cadastros/produto', headers: auth(A.caixas[0]!.token.valor) })).json();
    expect(l1.registros.map((x: { pro_codigo: number }) => x.pro_codigo)).toEqual([10, 11]);

    await putProdutos(A.tokenEmpresa.valor, [produto(11, { pro_descricao: 'Alterado' }), produto(12)]);
    const l2 = (await h.app.inject({ method: 'GET', url: `/v1/cadastros/produto?desde=${l1.cursor}`, headers: auth(A.caixas[1]!.token.valor) })).json();
    expect(l2.registros.map((x: { pro_codigo: number }) => x.pro_codigo).sort()).toEqual([11, 12]);
    expect(l2.registros.find((x: { pro_codigo: number }) => x.pro_codigo === 11).pro_descricao).toBe('Alterado');
  });

  it('rejeita campos desconhecidos, chave ausente e tabela fora da lista', async () => {
    expect((await putProdutos(A.tokenEmpresa.valor, [{ pro_codigo: 1, campo_x: 1 }])).statusCode).toBe(400);
    expect((await putProdutos(A.tokenEmpresa.valor, [{ pro_descricao: 'sem chave' }])).statusCode).toBe(400);
    expect((await putProdutos(A.tokenEmpresa.valor, [{ pro_codigo: 'abc' }])).statusCode).toBe(400);
    const r = await h.app.inject({ method: 'GET', url: '/v1/cadastros/usuario_hub', headers: auth(A.tokenEmpresa.valor) });
    expect(r.statusCode).toBe(404);
    const e = await h.app.inject({ method: 'PUT', url: '/v1/cadastros/empresa', headers: auth(A.tokenEmpresa.valor), payload: { registros: [{}] } });
    expect(e.statusCode).toBe(404);
  });
});

describe('isolamento entre empresas (RLS)', () => {
  it('empresa B não enxerga cadastros da A pela API', async () => {
    await putProdutos(A.tokenEmpresa.valor, [produto(500)]);
    await putProdutos(B.tokenEmpresa.valor, [produto(900)]);
    const r = (await h.app.inject({ method: 'GET', url: '/v1/cadastros/produto', headers: auth(B.caixas[0]!.token.valor) })).json();
    expect(r.registros.map((x: { pro_codigo: number }) => x.pro_codigo)).toEqual([900]);
  });

  it('mesma chave em empresas distintas não conflita', async () => {
    await putProdutos(A.tokenEmpresa.valor, [produto(777, { pro_descricao: 'A' })]);
    await putProdutos(B.tokenEmpresa.valor, [produto(777, { pro_descricao: 'B' })]);
    const a = (await h.app.inject({ method: 'GET', url: '/v1/cadastros/produto', headers: auth(A.tokenEmpresa.valor) })).json();
    expect(a.registros.find((x: { pro_codigo: number }) => x.pro_codigo === 777).pro_descricao).toBe('A');
  });

  it('no banco: sem contexto não vê nada; com contexto B não vê nem escreve na A', async () => {
    const sem = await h.pool.query('SELECT count(*)::int n FROM produto');
    expect(sem.rows[0].n).toBe(0);
    const semEmpresa = await h.pool.query('SELECT count(*)::int n FROM empresa');
    expect(semEmpresa.rows[0].n).toBe(0);

    const ctxB = { empresaId: B.empresaId, papel: 'empresa' as const };
    await comTenant(h.pool, ctxB, async (c) => {
      const r = await c.query('SELECT count(*)::int n FROM produto WHERE empresa_id = $1', [A.empresaId]);
      expect(r.rows[0].n).toBe(0);
      const e = await c.query('SELECT id FROM empresa');
      expect(e.rows.map((x) => x.id)).toEqual([B.empresaId]);
    });
    await expect(
      comTenant(h.pool, ctxB, (c) => c.query('INSERT INTO produto (empresa_id, pro_codigo) VALUES ($1, 1)', [A.empresaId])),
    ).rejects.toMatchObject({ code: '42501' });
    // UPDATE/DELETE em linhas de outra empresa não afetam nada
    await comTenant(h.pool, ctxB, async (c) => {
      expect((await c.query('UPDATE produto SET pro_descricao = $1 WHERE empresa_id = $2', ['x', A.empresaId])).rowCount).toBe(0);
      expect((await c.query('DELETE FROM produto WHERE empresa_id = $1', [A.empresaId])).rowCount).toBe(0);
    });
  });

  it('no banco: papel caixa não escreve cadastros e papel empresa não escreve movimento', async () => {
    await expect(
      comTenant(h.pool, { empresaId: A.empresaId, caixaId: A.caixas[0]!.id, papel: 'caixa' }, (c) =>
        c.query('INSERT INTO produto (empresa_id, pro_codigo) VALUES ($1, 4242)', [A.empresaId])),
    ).rejects.toMatchObject({ code: '42501' });
    await expect(
      comTenant(h.pool, { empresaId: A.empresaId, papel: 'empresa' }, (c) =>
        c.query('INSERT INTO venda (empresa_id, id, caixa_id, ven_codigo) VALUES ($1, $2, $3, 1)', [A.empresaId, randomUUID(), A.caixas[0]!.id])),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('tokens e auditoria também são isolados por empresa', async () => {
    const t = await comTenant(h.pool, { empresaId: B.empresaId, papel: 'empresa' }, (c) => c.query('SELECT empresa_id FROM token_acesso'));
    expect(new Set(t.rows.map((r) => r.empresa_id))).toEqual(new Set([B.empresaId]));
    const au = await comTenant(h.pool, { empresaId: B.empresaId, papel: 'empresa' }, (c) => c.query('SELECT DISTINCT empresa_id FROM auditoria'));
    expect(au.rows.every((r) => r.empresa_id === B.empresaId)).toBe(true);
  });

  it('auditoria é imutável para a aplicação', async () => {
    await expect(comAdmin(h.pool, (c) => c.query(`UPDATE auditoria SET acao = 'x'`))).rejects.toMatchObject({ code: '42501' });
    await expect(comAdmin(h.pool, (c) => c.query(`DELETE FROM auditoria`))).rejects.toMatchObject({ code: '42501' });
  });
});

describe('movimento do caixa: idempotência e isolamento por caixa', () => {
  const postVenda = (token: string, id: string, dados: object) =>
    h.app.inject({ method: 'POST', url: '/v1/movimento/venda', headers: auth(token), payload: { id, dados } });

  it('reenvio do mesmo UUID não duplica', async () => {
    const id = randomUUID();
    const cx = A.caixas[0]!;
    const r1 = await postVenda(cx.token.valor, id, { ven_codigo: 1, ven_vlvenda: 10.5 });
    const r2 = await postVenda(cx.token.valor, id, { ven_codigo: 1, ven_vlvenda: 10.5 });
    expect(r1.statusCode).toBe(201);
    expect(r1.json().duplicada).toBe(false);
    expect(r2.statusCode).toBe(200);
    expect(r2.json().duplicada).toBe(true);
    const n = await comTenant(h.pool, { empresaId: A.empresaId, caixaId: cx.id, papel: 'caixa' }, (c) =>
      c.query('SELECT count(*)::int n FROM venda WHERE id = $1', [id]));
    expect(n.rows[0].n).toBe(1);
  });

  it('mesmo código de venda em caixas diferentes é permitido; no mesmo caixa com outro UUID -> 409', async () => {
    expect((await postVenda(A.caixas[1]!.token.valor, randomUUID(), { ven_codigo: 1 })).statusCode).toBe(201);
    expect((await postVenda(A.caixas[0]!.token.valor, randomUUID(), { ven_codigo: 1 })).statusCode).toBe(409);
  });

  it('o caixa só enxerga o próprio movimento; o caixa de outra empresa também não', async () => {
    const ver = (cx: { id: string }, emp: string) =>
      comTenant(h.pool, { empresaId: emp, caixaId: cx.id, papel: 'caixa' }, (c) => c.query('SELECT caixa_id FROM venda'));
    const a0 = await ver(A.caixas[0]!, A.empresaId);
    expect(a0.rows.length).toBeGreaterThan(0);
    expect(a0.rows.every((r) => r.caixa_id === A.caixas[0]!.id)).toBe(true);
    expect((await ver(B.caixas[0]!, B.empresaId)).rows.length).toBe(0);
  });

  it('caixa não grava movimento em nome de outro caixa', async () => {
    await expect(
      comTenant(h.pool, { empresaId: A.empresaId, caixaId: A.caixas[0]!.id, papel: 'caixa' }, (c) =>
        c.query('INSERT INTO venda (empresa_id, id, caixa_id, ven_codigo) VALUES ($1, $2, $3, 99)', [A.empresaId, randomUUID(), A.caixas[1]!.id])),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('exige UUID e campos conhecidos', async () => {
    const cx = A.caixas[0]!.token.valor;
    expect((await postVenda(cx, 'nao-e-uuid', { ven_codigo: 5 })).statusCode).toBe(400);
    expect((await postVenda(cx, randomUUID(), { ven_codigo: 5, xyz: 1 })).statusCode).toBe(400);
  });
});

describe('regras de tenant no banco', () => {
  it('série de NFC-e repetida na mesma empresa é recusada; em outra empresa é aceita', async () => {
    await expect(
      comAdmin(h.pool, (c) => c.query(`UPDATE caixa SET serie_nfce = '1' WHERE id = $1`, [A.caixas[1]!.id])),
    ).rejects.toMatchObject({ code: '23505' });
    await comAdmin(h.pool, (c) => c.query(`UPDATE caixa SET serie_nfce = '1' WHERE id = $1`, [B.caixas[0]!.id]));
  });

  it('cota de caixas por empresa', async () => {
    await expect(
      comAdmin(h.pool, (c) => c.query(`INSERT INTO caixa (empresa_id, codigo) VALUES ($1, 99)`, [B.empresaId])),
    ).rejects.toMatchObject({ code: '23514' });
  });
});

describe('cofre de segredos', () => {
  it('cifra e decifra; texto cifrado não contém o original; adulteração é detectada', () => {
    const cofre = criarCofre(CHAVE_TESTE);
    const dado = cofre.cifrar('senha-do-certificado');
    expect(dado.includes(Buffer.from('senha-do-certificado'))).toBe(false);
    expect(cofre.decifrar(dado)).toBe('senha-do-certificado');
    dado[dado.length - 1] = dado[dado.length - 1]! ^ 1;
    expect(() => cofre.decifrar(dado)).toThrow();
  });
});



describe('servidor HTTP real', () => {
  it('escuta numa porta e responde /saude com cabeçalhos do helmet', async () => {
    const h2 = await iniciar();
    try {
      const url = await h2.app.listen({ port: 0, host: '127.0.0.1' });
      const r = await fetch(`${url}/saude`);
      expect(r.status).toBe(200);
      expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    } finally {
      await h2.fechar();
    }
  });
});
