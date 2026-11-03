import { z } from 'zod';

// API publica de terminais: o sistema do cliente cadastra/atualiza o terminal inteiro (empresa, parametros do
// caixa e certificado). Nomes simples no contrato; internamente tudo vira "valores" do terminal (colunas da tabela
// caixa do PDV), que e o que o Integrador recebe.

// grupo.campo (contrato) -> parametro do caixa
export const EMPRESA: Record<string, string> = {
  razaoSocial: 'con_razsoc', nomeFantasia: 'con_fantasia', cnpj: 'con_cnpj', inscricaoEstadual: 'con_inscest',
  telefone: 'con_fone', cep: 'con_cep', endereco: 'con_endereco', numero: 'con_numendereco', complemento: 'con_compendereco',
  bairro: 'con_bainome', cidade: 'con_cidnome', uf: 'con_uf', codigoCidade: 'cid_cidade',
};
export const FISCAL: Record<string, string> = {
  serieNfce: 'con_serienfc', ultimaNfce: 'con_ultimanfc', serieNfe: 'con_serie', ultimaNfe: 'con_ultimanota',
  csc: 'con_csc', idCsc: 'con_idcsc', operacao: 'tip_operacao', consumidorFinal: 'cai_consufinal',
};

const so = (grupo: Record<string, string>) => z.object(Object.fromEntries(Object.keys(grupo).map((k) => [k, z.union([z.string(), z.number(), z.boolean(), z.null()]).optional()]))).strict();

export const corpoTerminal = z.object({
  codigo: z.union([z.string(), z.number()]).transform(String).optional(),
  nome: z.string().trim().min(1).max(100).optional(),
  ambiente: z.enum(['producao', 'homologacao']).optional(),
  forcarNumeracao: z.boolean().optional(),      // deixa a numeracao (ultimaNfce/ultimaNfe) voltar; sem isso ela so sobe
  ativo: z.union([z.literal(0), z.literal(1), z.boolean()]).transform((v) => v === 1 || v === true).optional(),
  empresa: so(EMPRESA).optional(),
  fiscal: so(FISCAL).optional(),
  parametros: z.record(z.unknown()).optional(),
  certificado: z.object({
    pfx: z.string().min(100).max(1_400_000), senha: z.string().min(1).max(200), nome: z.string().trim().max(200).default('certificado.pfx'),
  }).strict().optional(),
}).strict();
export type CorpoTerminal = z.infer<typeof corpoTerminal>;

const soDigitos = (v: unknown) => String(v).replace(/\D/g, '');
const DIGITOS = new Set(['con_cnpj', 'con_cep']);

// Corpo do contrato -> valores do terminal. Campos enviados como null limpam o valor.
export function paraValores(b: CorpoTerminal): { valores: Record<string, unknown>; conflitos: string[] } {
  const valores: Record<string, unknown> = {};
  const conflitos: string[] = [];
  const poe = (campo: string, v: unknown) => {
    if (campo in valores) conflitos.push(campo);
    valores[campo] = v === null ? null : DIGITOS.has(campo) ? soDigitos(v) : v;
  };
  for (const [k, v] of Object.entries(b.empresa ?? {})) poe(EMPRESA[k], v);
  for (const [k, v] of Object.entries(b.fiscal ?? {})) poe(FISCAL[k], v);
  for (const [k, v] of Object.entries(b.parametros ?? {})) poe(k, v);
  return { valores, conflitos };
}

// Valores do terminal -> contrato (empresa, fiscal e o restante em parametros).
export function paraContrato(valores: Record<string, unknown>) {
  const usados = new Set<string>();
  const grupo = (mapa: Record<string, string>) => {
    const out: Record<string, unknown> = {};
    for (const [k, campo] of Object.entries(mapa)) { usados.add(campo); if (valores[campo] !== undefined) out[k] = valores[campo]; }
    return out;
  };
  const empresa = grupo(EMPRESA);
  const fiscal = grupo(FISCAL);
  const parametros = Object.fromEntries(Object.entries(valores).filter(([k]) => !usados.has(k) && k !== 'con_certsenha' && k !== 'con_certcaminho'));
  return { empresa, fiscal, parametros };
}
