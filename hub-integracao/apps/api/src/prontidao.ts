import { parametros } from '@hub/contracts';
import type { Db } from './db.js';

// Prontidao para vender: o que o PDV exige (docs/hub/07-dados-para-venda.md) contra o que a empresa
// ja tem no Hub. Alimenta o checklist da homologacao do desenvolvedor.
export type ItemProntidao = {
  id: string; grupo: string; titulo: string; descricao: string;
  obrigatorio: boolean; ok: boolean; detalhe: string;
  semApi?: boolean;   // o PDV exige, mas ainda nao ha recurso na API publica para enviar
  enviar?: string[]; como?: string;
};

// Criterios de homologacao: o que o PDV exige para vender e COMO o integrador envia cada coisa ao Hub.
// `enviar` = recursos da API publica (POST /v1/<recurso>); `como` = o que fazer quando nao e pela API.
export type CriterioDef = {
  id: string; grupo: string; titulo: string; descricao: string; obrigatorio: boolean; semApi?: boolean;
  enviar: string[]; como?: string;
};
const SEM_API = 'Ainda não há recurso na API pública: combine o envio com a Aliare.';
export const CRITERIOS: CriterioDef[] = [
  { id: 'terminal', grupo: 'Terminal', titulo: 'Terminal cadastrado', descricao: 'Pelo menos um caixa ativo com token.', obrigatorio: true, enviar: ['terminals'], como: 'Via API: POST /v1/terminals (o token vem na criação). Ou pelo painel: Hub > Clientes > (cliente) > Terminais > Novo terminal.' },
  { id: 'emitente', grupo: 'Terminal', titulo: 'Dados do emitente', descricao: 'Razão social, CNPJ, IE, endereço, cidade e UF (aparecem na nota).', obrigatorio: true, enviar: ['terminals'], como: 'No terminal, grupo empresa: razaoSocial, cnpj, inscricaoEstadual, cep, endereco, numero, bairro, cidade, uf e codigoCidade (código IBGE do município). Ou pelo painel (Parâmetros do caixa).' },
  { id: 'nfce', grupo: 'Terminal', titulo: 'NFC-e: série, CSC e ID do CSC', descricao: 'Necessários para numerar a nota e gerar o QR-Code.', obrigatorio: true, enviar: ['terminals'], como: 'No terminal, grupo fiscal: serieNfce, csc e idCsc (fornecidos pela SEFAZ do estado). Ou pelo painel.' },
  { id: 'certificado', grupo: 'Terminal', titulo: 'Certificado digital', descricao: 'Certificado A1 (.pfx) da empresa, enviado ao Hub (guardado cifrado) para assinar a nota.', obrigatorio: true, enviar: ['terminals', 'certificado'], como: 'No terminal, campo certificado (pfx em base64 + senha), ou PUT /v1/certificado. Vale para todos os terminais da empresa; o CNPJ precisa ter a mesma raiz do emitente. Ou pelo painel.' },
  { id: 'venda', grupo: 'Terminal', titulo: 'Operação e consumidor final', descricao: 'Operação do terminal (tip_operacao) e o código do cliente consumidor final.', obrigatorio: true, enviar: ['terminals'], como: 'No terminal, grupo fiscal: operacao e consumidorFinal (o cliente consumidor final também precisa ser enviado em customer e customer-unit).' },

  { id: 'operacoes', grupo: 'Fiscal', titulo: 'Operações', descricao: 'Cadastro de operações (entra na busca de CFOP e de imposto).', obrigatorio: true, enviar: ['operation'] },
  { id: 'naturezas', grupo: 'Fiscal', titulo: 'Naturezas de operação (CFOP)', descricao: 'Natureza de cada CFOP, com entrada/saída.', obrigatorio: true, enviar: ['fiscal-operation'] },
  { id: 'opernat', grupo: 'Fiscal', titulo: 'Vínculo operação × natureza', descricao: 'Liga cada natureza às operações (tabela opernat).', obrigatorio: true, enviar: ['operation-fiscal-link'], como: 'Uma linha por vínculo, com um sequencial próprio (inteiro único).' },
  { id: 'tabcfop', grupo: 'Fiscal', titulo: 'Tabela de CFOP', descricao: 'Define o CFOP de cada venda por UF, operação, grupo, NCM ou item.', obrigatorio: true, enviar: ['cfop-rule'], como: 'Pelo menos uma regra "todos" (tipoSelecao 0) para a UF do emitente e o tipo de operação do terminal; regras por NCM, item, origem ou grupo refinam.' },
  { id: 'impostos', grupo: 'Fiscal', titulo: 'Regras de imposto', descricao: 'ICMS, PIS, COFINS (e IPI/ST/CBS-IBS quando se aplicam) com CST e alíquotas.', obrigatorio: true, enviar: ['tax-rule'], como: 'Uma regra por imposto (tipoImposto 1, 4, 5…) e natureza, com vigência. Sem regra o item sai sem CST/alíquota e a nota pode ser rejeitada.' },
  { id: 'cidades', grupo: 'Fiscal', titulo: 'Cidades', descricao: 'Cadastro comum carregado do IBGE (Hub > Cidades).', obrigatorio: true, enviar: [], como: 'Nada a enviar: é um cadastro único mantido pelo Hub (carga do IBGE).' },

  { id: 'produtos', grupo: 'Cadastros', titulo: 'Produtos prontos para vender', descricao: 'Ativos, com NCM, com preço e com saldo (sem uma dessas partes o PDV nem encontra o produto).', obrigatorio: true, enviar: ['product', 'price', 'stock-balance'], como: 'Envie o produto (ativo, com NCM), o preço de cada tabela usada pelos clientes e o saldo. Promoções (promotional-price), atacado (volume-price) e lotes (stock-lot) são opcionais.' },
  { id: 'consumidor', grupo: 'Cadastros', titulo: 'Cliente consumidor final', descricao: 'O cliente indicado em cai_consufinal precisa existir, com sua linha de unidade (customer-unit).', obrigatorio: true, enviar: ['customer', 'customer-unit'], como: 'Envie o cliente consumidor final em customer e a condição comercial dele em customer-unit (sem ela o PDV não o encontra).' },
  { id: 'condicoes', grupo: 'Cadastros', titulo: 'Condições de pagamento', descricao: 'Pelo menos a condição à vista usada na venda.', obrigatorio: true, enviar: ['payment-term'] },
  { id: 'usuarios', grupo: 'Cadastros', titulo: 'Usuários do PDV', descricao: 'Operadores que fazem login no PDV.', obrigatorio: true, semApi: true, enviar: [], como: SEM_API },

  { id: 'bandeiras', grupo: 'Recomendado', titulo: 'Bandeiras de cartão', descricao: 'Para vendas em cartão (TEF).', obrigatorio: false, enviar: ['card-brand'] },
  { id: 'credenciadoras', grupo: 'Recomendado', titulo: 'Credenciadoras', descricao: 'Adquirentes do cartão.', obrigatorio: false, enviar: ['accreditation'] },
  { id: 'vendedores', grupo: 'Recomendado', titulo: 'Vendedores', descricao: 'Para registrar o vendedor na nota.', obrigatorio: false, enviar: ['sales-rep'] },
  { id: 'webhook', grupo: 'Recomendado', titulo: 'Webhook ativo', descricao: 'Para receber notas, caixa e e-mails do PDV no seu sistema.', obrigatorio: false, enviar: [], como: 'Painel: Hub > Clientes > (cliente) > ⋮ > Webhooks.' },
];

// Ordem em que a carga costuma ser feita (uma etapa depende da anterior).
export const ORDEM_DE_CARGA = [
  'Terminal e parâmetros do caixa (emitente, NFC-e, certificado) pelo painel.',
  'Operações, naturezas de operação, vínculo operação × natureza, tabela de CFOP e regras de imposto.',
  'Condições de pagamento, bandeiras, credenciadoras, vendedores e usuários.',
  'Marcas, produtos, preços (todas as tabelas usadas), saldo, lotes e promoções.',
  'Clientes (customer + customer-unit), incluindo o consumidor final.',
];

const PARAMETROS = {
  emitente: ['con_razsoc', 'con_cnpj', 'con_inscest', 'con_cep', 'con_endereco', 'con_numendereco', 'con_bainome', 'con_cidnome', 'con_uf', 'cid_cidade'],
  nfce: ['con_serienfc', 'con_csc', 'con_idcsc'],
  venda: ['tip_operacao', 'cai_consufinal'],
} as const;

// Nome do campo como aparece na tela de parametros do caixa ("Razao Social (con_razsoc)").
const rotulo = (campo: string) => { const p = parametros.find((x) => x.campo === campo); return p ? `${p.rotulo} (${campo})` : campo; };
const preenchido = (v: unknown) => v !== null && v !== undefined && String(v).trim() !== '' && String(v) !== '0';

export async function calcularProntidao(db: Db, tenantId: string): Promise<{ itens: ItemProntidao[]; obrigatorios: number; faltam: number }> {
  // Registros enviados pelo Postman (Referer: postman) ficam fora da conta: sao de teste.
  const cont = new Map<string, number>();
  for (const r of (await db.query(
    `select entidade, count(*) filter (where not excluido and not pausado and not teste)::int as n,
            count(*) filter (where not excluido and not pausado and teste)::int as t from sync_rows where tenant_id = $1 group by entidade`, [tenantId],
  )).rows as { entidade: string; n: number; t: number }[]) { cont.set(r.entidade, r.n); cont.set(`teste:${r.entidade}`, r.t); }
  const n = (e: string) => cont.get(e) ?? 0;
  const nTeste = (e: string) => cont.get(`teste:${e}`) ?? 0;
  const avisoTeste = (e: string) => (nTeste(e) ? ` (${nTeste(e)} de teste do Postman ignorado(s))` : '');

  const terminais = (await db.query(
    `select t.nome, coalesce(s.valores, '{}'::jsonb) as valores from terminals t left join terminal_settings s on s.terminal_id = t.id
      where t.tenant_id = $1 and t.ativo and not t.teste order by t.criado_em`, [tenantId],
  )).rows as { nome: string; valores: Record<string, unknown> }[];
  const padroes = ((await db.query('select provider_config from tenants where id = $1', [tenantId])).rows[0]?.provider_config?.padroes ?? {}) as Record<string, unknown>;
  const valorDe = (t: { valores: Record<string, unknown> }, campo: string) => (campo in t.valores ? t.valores[campo] : padroes[campo]);
  // Um terminal "completo" tem todos os campos do grupo; informa o que falta no melhor candidato.
  const grupo = (campos: readonly string[]) => {
    if (!terminais.length) return { ok: false, detalhe: 'Nenhum terminal cadastrado.' };
    let menor: string[] | null = null;
    for (const t of terminais) {
      const falta = campos.filter((c) => !preenchido(valorDe(t, c)));
      if (!falta.length) return { ok: true, detalhe: `Terminal ${t.nome} completo.` };
      if (!menor || falta.length < menor.length) menor = falta;
    }
    return { ok: false, detalhe: `Falta: ${menor!.map(rotulo).join(', ')}.` };
  };

  const cidades = (await db.query('select count(*)::int as n from cidades')).rows[0].n as number;

  // Produtos "prontos para vender": ativos, com NCM, com preco e com saldo (a busca do PDV junta as tres coisas).
  const prod = (await db.query(
    `select count(*) filter (where p.dados->>'pro_ativo' in ('yes', 'true') and nullif(trim(p.dados->>'pro_clasfis'), '') is not null
                              and exists (select 1 from sync_rows x where x.tenant_id = p.tenant_id and x.entidade = 'prices' and not x.excluido and not x.teste and x.dados->>'ite_codigo' = p.chave)
                              and exists (select 1 from sync_rows s where s.tenant_id = p.tenant_id and s.entidade = 'stock-balance' and not s.excluido and not s.teste and s.chave = p.chave))::int as prontos,
            count(*)::int as total
       from sync_rows p where p.tenant_id = $1 and p.entidade = 'products' and not p.excluido and not p.teste`, [tenantId],
  )).rows[0] as { prontos: number; total: number };

  // Consumidor final: o cliente apontado por cai_consufinal precisa existir com sua linha de unidade (facliuni).
  const consFinal = terminais.map((t) => valorDe(t, 'cai_consufinal')).find(preenchido);
  let consOk = false;
  if (consFinal !== undefined) {
    const r = await db.query(
      `select exists (select 1 from sync_rows c where c.tenant_id = $1 and c.entidade = 'customers' and not c.excluido and not c.teste and c.chave = $2)
          and exists (select 1 from sync_rows u where u.tenant_id = $1 and u.entidade = 'customer-units' and not u.excluido and not u.teste and u.chave = $2) as ok`,
      [tenantId, String(consFinal)]);
    consOk = r.rows[0].ok;
  }

  // Certificado: o enviado ao Hub (cifrado) vale mais que caminho/senha digitados nos parametros.
  const cert = (await db.query('select titular, valido_ate from certificados where tenant_id = $1 and not teste', [tenantId])).rows[0] as { titular: string; valido_ate: Date } | undefined;
  const certItem = cert
    ? (() => {
        const dias = Math.floor((new Date(cert.valido_ate).getTime() - Date.now()) / 86_400_000);
        return { ok: dias >= 0, detalhe: dias >= 0 ? `${cert.titular} - valido ate ${new Date(cert.valido_ate).toLocaleDateString('pt-BR')} (${dias} dia(s)).` : `Certificado vencido em ${new Date(cert.valido_ate).toLocaleDateString('pt-BR')}.` };
      })()
    : { ok: false, detalhe: 'Nenhum certificado enviado.' };

  const webhooks = (await db.query('select count(*)::int as n from webhooks where tenant_id = $1 and ativo', [tenantId])).rows[0].n as number;

  const g = { emitente: grupo(PARAMETROS.emitente), nfce: grupo(PARAMETROS.nfce), venda: grupo(PARAMETROS.venda) };
  const cad = (ent: string) => ({ ok: n(ent) > 0, detalhe: (n(ent) > 0 ? `${n(ent)} registro(s).` : 'Nenhum registro.') + avisoTeste(ent) });
  const res: Record<string, { ok: boolean; detalhe: string }> = {
    terminal: { ok: terminais.length > 0, detalhe: `${terminais.length} terminal(is).` },
    emitente: g.emitente, nfce: g.nfce, certificado: certItem, venda: g.venda,
    operacoes: cad('operations'), naturezas: cad('fiscal-operations'), opernat: cad('operation-fiscal-links'),
    tabcfop: cad('cfop-table'), impostos: cad('taxes'),
    cidades: { ok: cidades > 0, detalhe: `${cidades} cidade(s).` },
    produtos: { ok: prod.prontos > 0, detalhe: (prod.total ? `${prod.prontos} pronto(s) de ${prod.total} produto(s).` : 'Nenhum produto.') + avisoTeste('products') },
    consumidor: { ok: consOk, detalhe: consFinal === undefined ? 'Defina cai_consufinal no terminal.' : consOk ? `Cliente ${consFinal} cadastrado.` : `Cliente ${consFinal} não encontrado (cliente + unidade).` },
    condicoes: cad('payment-terms'), usuarios: cad('users'),
    bandeiras: cad('card-brands'), credenciadoras: cad('accreditations'), vendedores: cad('sales-reps'),
    webhook: { ok: webhooks > 0, detalhe: `${webhooks} webhook(s) ativo(s).` },
  };
  const itens: ItemProntidao[] = CRITERIOS.map((c) => ({ ...c, ...res[c.id] }));
  const obrigatorios = itens.filter((i) => i.obrigatorio);
  return { itens, obrigatorios: obrigatorios.length, faltam: obrigatorios.filter((i) => !i.ok).length };
}
