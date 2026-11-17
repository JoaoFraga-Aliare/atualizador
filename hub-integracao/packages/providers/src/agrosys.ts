// Adaptador do Agrosys (SOAP wsagroServer01, Progress). Aqui ficam as funcoes
// puras: montar o vdadosParam e interpretar o vdadosRetorno, exatamente como o
// Integrador faz hoje. O transporte SOAP (HTTP) entra na proxima etapa.
import { entidades, type NomeEntidade } from '@hub/contracts';

export type EscopoAgrosys = {
  empresa: number;
  unidade: number;
  filial: number;
};

export type PedidoAgrosys = {
  operacao: string;                       // ex.: 'PDVCFOP'
  quantidade?: number;                    // tpp-quant (tamanho do lote)
  extras?: Record<string, string | number>; // ex.: { 'pre-tiporeg': '1', 'cli-codigo': 10 }
};

export function montarRequisicao(escopo: EscopoAgrosys, pedido: PedidoAgrosys): string {
  const item: Record<string, string | number> = {
    'tip-operacao': pedido.operacao,
    'emp-empresa': escopo.empresa,
    'uni-unidade': escopo.unidade,
    'fil-filial': escopo.filial,
    'tpp-quant': pedido.quantidade ?? 0,
    ...pedido.extras,
  };
  return JSON.stringify({ 'tp-param': [item] });
}

export type RetornoLido = {
  ok: boolean;
  codigo: number;                         // msg-codigo: 1 = ok, 9 = erro de negocio
  descricao: string;
  texto: string;                          // msg-retorno quando e texto puro (ex.: "NOTA FISCAL INTEGRADA COM SUCESSO.")
  tabelas: Record<string, Record<string, unknown>[]>; // 'natoperacao' -> linhas
};

// tp-<tabela> (ou tp_<tabela> em clifor/operacao) -> nome da tabela
const tabelaDe = (chave: string) => chave.replace(/^tp[-_]/, '');

export function lerRetorno(json: string): RetornoLido {
  const raiz = JSON.parse(json) as { 'tp-retorno'?: unknown };
  const lista = raiz['tp-retorno'];
  if (!Array.isArray(lista) || lista.length === 0 || typeof lista[0] !== 'object' || lista[0] === null) {
    throw new Error('retorno sem tp-retorno');
  }
  const r = lista[0] as Record<string, unknown>;
  const codigo = Number(r['msg-codigo']);
  const descricao = String(r['msg-descricao'] ?? '');
  const tabelas: RetornoLido['tabelas'] = {};

  let corpo: unknown = r['msg-retorno'];
  const texto = typeof corpo === 'string' ? corpo : '';
  if (typeof corpo === 'string') {
    try { corpo = JSON.parse(corpo); } catch { corpo = undefined; }   // mensagem em texto puro
  }
  if (Array.isArray(corpo)) corpo = corpo[0];
  if (codigo === 1 && corpo && typeof corpo === 'object') {
    for (const [k, v] of Object.entries(corpo as Record<string, unknown>)) {
      if (/^tp[-_]/.test(k) && Array.isArray(v)) tabelas[tabelaDe(k)] = v as Record<string, unknown>[];
    }
  }
  return { ok: codigo === 1, codigo, descricao, texto, tabelas };
}

// Pedido padrao de cada entidade do catalogo (a partir da operacao legada).
export function pedidoDaEntidade(nome: NomeEntidade, quantidade = 0): PedidoAgrosys {
  const e = entidades[nome];
  return { operacao: e.operacaoLegada, quantidade };
}

export function linhasDaEntidade(retorno: RetornoLido, nome: NomeEntidade): Record<string, unknown>[] {
  return retorno.tabelas[entidades[nome].tabelaLegada] ?? [];
}
