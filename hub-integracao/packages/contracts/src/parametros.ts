import { parametros as gerados } from './parametros.generated';
import { extrasDoAgrosys } from './pdvconfig2';

// Parametros do caixa (hoje a tela "Parametrizacao PDV" / tabela caixa do PDV),
// agora configurados no Hub, por terminal. O catalogo vem da propria tela.
export type ControleParametro = 'texto' | 'booleano' | 'lista' | 'arquivo' | 'cor' | 'minmax' | 'data';
export type TipoParametro = 'texto' | 'inteiro' | 'decimal' | 'booleano' | 'data';

export type ParametroDef = {
  campo: string;                 // nome da coluna em caixa
  rotulo: string;
  grupo: string;
  subgrupo?: string;
  bloco?: string;                // campos do mesmo bloco ficam na mesma linha
  largura: number;               // % da linha
  controle: ControleParametro;
  tipo: TipoParametro;
  minimo?: number;
  maximo?: number;
  padrao?: number;
  extensoes?: string;
  opcoes?: string[];
  valorPorIndice?: boolean;      // lista gravada como indice (0,1,2...) e nao como texto
  listaDoDispositivo?: boolean;  // opcoes vem da maquina (portas, impressoras, modelos ACBr)
  origem?: 'agrosys';            // so aparece/valem quando a origem da empresa e o Agrosys
};

// Tela do caixa + os campos que so o Agrosys devolve (PDVCONFIG2), no grupo "Agrosys".
export const parametros: readonly ParametroDef[] = [...gerados, ...extrasDoAgrosys(new Set(gerados.map((p) => p.campo)))];

const porCampo = new Map(parametros.map((p) => [p.campo, p]));
export const parametroDe = (campo: string) => porCampo.get(campo);
export const gruposDe = (origem: 'agrosys' | 'api') =>
  [...new Set(parametros.filter((p) => !p.origem || p.origem === origem).map((p) => p.grupo))];

export type ErroParametro = { campo: string; erro: string };

// Valida e normaliza um conjunto (parcial) de valores. null limpa o campo.
export function validarParametros(
  entrada: Record<string, unknown>,
  origem: 'agrosys' | 'api',
): { valores: Record<string, string | number | boolean | null>; erros: ErroParametro[] } {
  const valores: Record<string, string | number | boolean | null> = {};
  const erros: ErroParametro[] = [];
  for (const [campo, bruto] of Object.entries(entrada)) {
    const p = porCampo.get(campo);
    if (!p) { erros.push({ campo, erro: 'parametro desconhecido' }); continue; }
    if (p.origem && p.origem !== origem) { erros.push({ campo, erro: `so vale para origem ${p.origem}` }); continue; }
    if (bruto === null) { valores[campo] = null; continue; }

    if (p.tipo === 'booleano') {
      if (typeof bruto !== 'boolean') { erros.push({ campo, erro: 'esperado verdadeiro/falso' }); continue; }
      valores[campo] = bruto; continue;
    }
    if (p.tipo === 'inteiro' || p.controle === 'minmax' || (p.opcoes && p.valorPorIndice) || (p.listaDoDispositivo && p.valorPorIndice)) {
      const n = typeof bruto === 'string' && bruto.trim() !== '' ? Number(bruto) : bruto;
      if (typeof n !== 'number' || !Number.isInteger(n)) { erros.push({ campo, erro: 'esperado numero inteiro' }); continue; }
      if (p.controle === 'minmax' && ((p.minimo !== undefined && n < p.minimo) || (p.maximo !== undefined && n > p.maximo))) {
        erros.push({ campo, erro: `fora do intervalo ${p.minimo}..${p.maximo}` }); continue;
      }
      if (p.opcoes && p.valorPorIndice && (n < -1 || n >= p.opcoes.length)) {
        erros.push({ campo, erro: `indice fora da lista (0..${p.opcoes.length - 1})` }); continue;
      }
      valores[campo] = n; continue;
    }
    if (p.tipo === 'decimal') {
      const n = typeof bruto === 'string' && bruto.trim() !== '' ? Number(bruto) : bruto;
      if (typeof n !== 'number' || !Number.isFinite(n)) { erros.push({ campo, erro: 'esperado numero' }); continue; }
      valores[campo] = n; continue;
    }
    if (typeof bruto !== 'string') { erros.push({ campo, erro: 'esperado texto' }); continue; }
    const texto = bruto.trim();
    if (p.tipo === 'data' && texto !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
      erros.push({ campo, erro: 'data no formato AAAA-MM-DD' }); continue;
    }
    if (p.opcoes && !p.valorPorIndice && texto !== '' && !p.opcoes.includes(texto)) {
      erros.push({ campo, erro: 'valor fora das opcoes' }); continue;
    }
    valores[campo] = texto;
  }
  return { valores, erros };
}
