// Camada de roteamento do Hub: cada empresa tem uma origem (agrosys | api) e o Hub
// decide para onde vai cada dado. O Agrosys e acessado por SOAP; na origem "api" o
// proprio sistema do cliente empurra o catalogo e busca os envios (outbox).
import { entidades, type NomeEntidade } from '@hub/contracts';
import { montarRequisicao, lerRetorno, linhasDaEntidade, type RetornoLido } from './agrosys';
import { chamarAgrosys, type ConexaoAgrosys, type OpcoesSoap } from './soap';

export class ErroProvider extends Error {
  constructor(mensagem: string, public naoSuportado = false) { super(mensagem); }
}

// ---- configuracao efetiva (padroes da empresa + parametros do terminal) --------
export type ConfigAgrosys = {
  conexao: ConexaoAgrosys;
  empresa: number; unidade: number; filial: number;
  empresaCx?: number; unidadeCx?: number; filialCx?: number;
};

export function configAgrosys(valores: Record<string, unknown>): ConfigAgrosys {
  const n = (k: string) => (valores[k] === undefined || valores[k] === null || valores[k] === '' ? undefined : Number(valores[k]));
  const url = String(valores.con_sincurl ?? '');
  if (!url) throw new ErroProvider('Empresa sem URL do Agrosys (con_sincurl).');
  const empresa = n('emp_empresa'), unidade = n('uni_unidade'), filial = n('fil_filial');
  if (!empresa || !unidade || !filial) throw new ErroProvider('Empresa sem empresa/unidade/filial do Agrosys.');
  return {
    conexao: { con_sincurl: url, cai_urlsoapvr12: valores.cai_urlsoapvr12 === true, cai_timeout: n('cai_timeout') },
    empresa, unidade, filial,
    empresaCx: n('emp_empresa_cx'), unidadeCx: n('uni_unidade_cx'), filialCx: n('fil_filial_cx'),
  };
}

// ---- operacoes ---------------------------------------------------------------
// Tempo real: perguntas ao ERP (e consultas sob demanda de cadastro). Envios
// (nota, caixa, e-mail) entram pelo outbox, nao por aqui.
export const operacoesTempoReal = [
  'PDVLOGIN', 'PDVVERSAO', 'PDVPEDIDO', 'PDVFECHAMENTO', 'PDVPENDFIN', 'PDVCANCNOTA', 'PDVSUPCAIXA', 'PDVSALDO',
  'PDVCLIENTE', 'PDVFACLIUNI', 'PDVPRODUTO', 'PDVPRECO', 'PDVTRANSP', 'PDVSALLOTE',
] as const;
export type OperacaoTempoReal = (typeof operacoesTempoReal)[number];

// Operacoes de caixa usam empresa/unidade/filial "_cx" quando configuradas.
const operacoesCaixa = new Set(['PDVSUPCAIXA', 'PDVMOVCAIXA', 'PDVHISCAIXA']);

export type EntradaOperacao = {
  quantidade?: number;                               // tpp-quant
  parametros?: Record<string, string | number>;      // campos da operacao (cli-codigo, pro-codigo...)
  receb?: string;                                    // corpo (vdadosReceb) quando a operacao tem
};

export function parametrosDaOperacao(cfg: ConfigAgrosys, operacao: string, e: EntradaOperacao = {}): string {
  const cx = operacoesCaixa.has(operacao);
  return montarRequisicao(
    { empresa: cx ? cfg.empresaCx ?? cfg.empresa : cfg.empresa, unidade: cx ? cfg.unidadeCx ?? cfg.unidade : cfg.unidade, filial: cx ? cfg.filialCx ?? cfg.filial : cfg.filial },
    { operacao, quantidade: e.quantidade ?? 0, extras: e.parametros },
  );
}

export type ResultadoOperacao = RetornoLido & { retorno: string };   // retorno = vdadosRetorno cru

// ---- envios (terminal -> ERP) ---------------------------------------------------
export const tiposEnvio = ['nota', 'movimento-caixa', 'email'] as const;
export type TipoEnvio = (typeof tiposEnvio)[number];

export type ResultadoEnvio = {
  entrega: 'imediata' | 'manual';   // manual = o sistema do cliente busca no outbox
  ok: boolean;
  mensagem: string;
  retorno?: string;
};

// Sucesso por tipo, como o Integrador decide hoje.
export function envioFoiAceito(tipo: TipoEnvio, r: RetornoLido): boolean {
  if (!r.ok) return false;
  if (tipo === 'nota') {
    return r.texto.trim().toUpperCase() === 'NOTA FISCAL INTEGRADA COM SUCESSO.';
  }
  return true;
}

// ---- interface ---------------------------------------------------------------------
export interface Provider {
  readonly tipo: 'agrosys' | 'api';
  /** Paginas de linhas do catalogo; vazio quando a origem empurra os dados (api). */
  catalogo(entidade: NomeEntidade, opts?: { maxPaginas?: number }): AsyncGenerator<Record<string, unknown>[]>;
  operacao(operacao: string, entrada?: EntradaOperacao): Promise<ResultadoOperacao>;
  enviar(tipo: TipoEnvio, payload: Record<string, unknown>): Promise<ResultadoEnvio>;
}

// Quanto pedir por chamada em cada entidade (tpp-quant), segundo as cargas do Integrador.
// 0 = sem limite. A semantica de paginacao do ERP deve ser confirmada com dados reais.
export const buscaPadrao: Partial<Record<NomeEntidade, { quantidade: number; extras?: Record<string, string | number> }>> = {
  customers: { quantidade: 100 }, 'customer-units': { quantidade: 100 }, products: { quantidade: 100 },
  brands: { quantidade: 100 }, prices: { quantidade: 1460 }, 'payment-terms': { quantidade: 1460, extras: { 'pre-tiporeg': '1' } },
};

// O que aconteceu em cada chamada ao ERP (alimenta o log de requisicoes do Hub).
export type EventoErp = {
  operacao: string; param: string; receb: string; ms: number; ok: boolean;
  retorno?: string; codigo?: number; descricao?: string; erro?: string; itens?: number;
};
export type Observador = (e: EventoErp) => void;

export class ProviderAgrosys implements Provider {
  readonly tipo = 'agrosys' as const;
  constructor(private cfg: ConfigAgrosys, private soap: OpcoesSoap = {}, private observar?: Observador) {}

  async operacao(operacao: string, entrada: EntradaOperacao = {}): Promise<ResultadoOperacao> {
    const param = parametrosDaOperacao(this.cfg, operacao, entrada);
    // Sem corpo explicito o ERP recebe o proprio param (como o Integrador faz nas cargas e consultas).
    const receb = entrada.receb ?? param;
    const t0 = Date.now();
    let retorno = '';
    try {
      retorno = await chamarAgrosys(this.cfg.conexao, { param, receb }, this.soap);
      const lido = lerRetorno(retorno);
      this.observar?.({
        operacao, param, receb, ms: Date.now() - t0, ok: lido.ok, retorno, codigo: lido.codigo,
        descricao: lido.descricao, itens: Object.values(lido.tabelas).reduce((s, l) => s + l.length, 0),
      });
      return { ...lido, retorno };
    } catch (e) {
      this.observar?.({ operacao, param, receb, ms: Date.now() - t0, ok: false, retorno: retorno || undefined, erro: (e as Error).message });
      throw e;
    }
  }

  async *catalogo(entidade: NomeEntidade, opts: { maxPaginas?: number } = {}) {
    const def = buscaPadrao[entidade] ?? { quantidade: 0 };
    const op = entidades[entidade].operacaoLegada;
    let anterior = '';
    for (let p = 0; p < (opts.maxPaginas ?? 50); p++) {
      const r = await this.operacao(op, { quantidade: def.quantidade, parametros: def.extras });
      if (!r.ok) throw new ErroProvider(`${op}: ${r.descricao || 'erro de negocio (msg-codigo ' + r.codigo + ')'}`);
      const linhas = linhasDaEntidade(r, entidade);
      const assinatura = JSON.stringify(linhas);
      if (assinatura === anterior) return;          // o ERP repetiu a pagina: nao avanca
      anterior = assinatura;
      if (linhas.length) yield linhas;
      if (def.quantidade === 0 || linhas.length < def.quantidade) return;
    }
  }

  async enviar(tipo: TipoEnvio, payload: Record<string, unknown>): Promise<ResultadoEnvio> {
    let op: string; let receb = ''; let parametros: Record<string, string | number> | undefined;
    if (tipo === 'nota') { op = 'PDVNFSCAPA'; receb = JSON.stringify(payload); }
    else if (tipo === 'movimento-caixa') { op = 'PDVMOVCAIXA'; receb = JSON.stringify(payload); }
    else {
      op = 'PDVENVEMAIL';
      parametros = {
        'nfs-serie': String(payload.serie ?? ''), 'nfs-numero': Number(payload.numero ?? 0),
        'usu-usuario': String(payload.usuario ?? ''), 'ema-destino': String(payload.destino ?? ''),
      };
    }
    const r = await this.operacao(op, { parametros, receb });
    const ok = envioFoiAceito(tipo, r);
    return { entrega: 'imediata', ok, mensagem: r.descricao || (ok ? 'ok' : 'recusado'), retorno: r.retorno };
  }
}

// Origem "api": o sistema do cliente envia o catalogo ao Hub (ingest) e busca os envios no
// outbox. Nao ha ERP para consultar em tempo real.
export class ProviderApi implements Provider {
  readonly tipo = 'api' as const;
  // eslint-disable-next-line require-yield
  async *catalogo(): AsyncGenerator<Record<string, unknown>[]> { return; }
  async operacao(operacao: string): Promise<ResultadoOperacao> {
    throw new ErroProvider(`A operacao ${operacao} nao e suportada na origem API (nao ha ERP para consultar em tempo real).`, true);
  }
  async enviar(): Promise<ResultadoEnvio> {
    return { entrega: 'manual', ok: true, mensagem: 'Aguardando o sistema do cliente buscar no outbox.' };
  }
}

export function criarProvider(
  origem: 'agrosys' | 'api', valores: Record<string, unknown>, soap?: OpcoesSoap, observar?: Observador,
): Provider {
  return origem === 'agrosys' ? new ProviderAgrosys(configAgrosys(valores), soap, observar) : new ProviderApi();
}
