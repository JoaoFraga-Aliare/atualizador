import { z } from 'zod';

export { entidades, type NomeEntidade } from './entities.generated';
export { canonico, hashLinha, chaveDaLinha } from './canonical';

// ---- Envelope legado do Agrosys (vdadosRetorno) ---------------------------
export const retornoAgrosys = z.object({
  'tp-retorno': z.array(z.object({
    'msg-codigo': z.coerce.number(),
    'msg-descricao': z.string().optional(),
    'msg-retorno': z.unknown().optional(),
  })).min(1),
});
export type RetornoAgrosys = z.infer<typeof retornoAgrosys>;

// ---- API de sincronizacao (terminal -> Hub) -------------------------------
export const respostaSync = z.object({
  entidade: z.string(),
  seqMax: z.number().int(),      // novo cursor do terminal
  temMais: z.boolean(),          // repetir o pedido com desde=seqMax
  mudancas: z.array(z.object({
    chave: z.string(),
    seq: z.number().int(),
    dados: z.record(z.unknown()),
  })),
});
export type RespostaSync = z.infer<typeof respostaSync>;

// ---- Ingestao (provider/cliente -> Hub) -----------------------------------
// O ERP nunca exclui, so inativa: a ingestao e sempre upsert; "inativo" e um
// campo da entidade, nao uma lapide.
export const loteIngestao = z.object({
  linhas: z.array(z.record(z.unknown())).min(1).max(5000),
});
export type LoteIngestao = z.infer<typeof loteIngestao>;

// ---- Parametros do caixa (configurados no Hub, por terminal) --------------
export {
  parametros, parametroDe, gruposDe, validarParametros,
  type ParametroDef, type ErroParametro,
} from './parametros';
export { mapaPdvConfig2, ignoradosPdvConfig2 } from './pdvconfig2';
export type { MapaCampo } from './pdvconfig2';

// ---- Origem da integracao da empresa ---------------------------------------
// agrosys: o Hub busca no Agrosys (padroes de conexao no cadastro da empresa);
// api: o sistema do cliente envia pela API do Hub.
export const origens = ['agrosys', 'api'] as const;
export type Origem = (typeof origens)[number];
// Campos obrigatorios dos padroes de conexao quando a origem e o Agrosys.
export const padroesAgrosysObrigatorios = ['con_sincurl', 'emp_empresa', 'uni_unidade', 'fil_filial'] as const;

// ---- Contrato externo (nomes simples; o Hub traduz para o formato do terminal) ---------
export {
  contratos, emDefinicao, entidadesComuns, ehComum, contratoPorCaminho, contratoDaEntidade, caminhosPublicos, schemaExterno, schemaParcial, chaveExterna, paraLegado, paraExterno, verificarContrato,
  type Contrato, type CampoContrato, type TipoCampo, type Conversao,
} from './contratos';
