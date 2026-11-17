// Transporte SOAP do Agrosys (Progress OpenEdge, document/literal, wsagroServer01).
// Replica o que o PDV/Integrador fazem hoje com o THTTPRIO (untagrosys.pas):
//   POST <url>  SOAPAction: ""   corpo: <wsagroServer01 xmlns="urn:progress-org:Agrosys:wsagro">
//   <vuid/> <vdadosParam/> <vdadosReceb/>   e a resposta traz <vdadosRetorno/>.

export const NS_AGROSYS = 'urn:progress-org:Agrosys:wsagro';

export type ConexaoAgrosys = {
  con_sincurl: string;
  cai_urlsoapvr12?: boolean;
  cai_timeout?: number;
};

// Mesma regra do GetwsagroObj: sem porta na URL (ignorando o prefixo "http:") acrescenta
// :8829 (SOAP v12) ou :9080; o caminho e /soap/ (v12) ou /wsa/wsa1/.
export function urlAgrosys(c: ConexaoAgrosys): string {
  let addr = c.con_sincurl.trim();
  const semPorta = !addr.replace(/http:/g, '').includes(':');
  const v12 = c.cai_urlsoapvr12 === true;
  if (semPorta) addr += v12 ? ':8829' : ':9080';
  return addr + (v12 ? '/soap/' : '/wsa/wsa1/');
}

const escXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const desescXml = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_m, c: string) => c)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, n: string) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&');

export function montarEnvelope(uid: string, param: string, receb: string): string {
  return '<?xml version="1.0" encoding="UTF-8"?>' +
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body>' +
    `<wsagroServer01 xmlns="${NS_AGROSYS}">` +
    `<vuid>${escXml(uid)}</vuid><vdadosParam>${escXml(param)}</vdadosParam><vdadosReceb>${escXml(receb)}</vdadosReceb>` +
    '</wsagroServer01></soapenv:Body></soapenv:Envelope>';
}

export class ErroSoap extends Error {
  constructor(mensagem: string, public status?: number) { super(mensagem); }
}

// Extrai vdadosRetorno (qualquer prefixo de namespace) ou levanta o Fault.
export function lerEnvelope(xml: string): string {
  const fault = xml.match(/<(?:\w+:)?Fault[\s>][\s\S]*?<\/(?:\w+:)?Fault>/);
  if (fault) {
    const msg = fault[0].match(/<(?:\w+:)?(?:errorMessage|faultstring)[^>]*>([\s\S]*?)<\/(?:\w+:)?(?:errorMessage|faultstring)>/);
    throw new ErroSoap(`Fault do Agrosys: ${msg ? desescXml(msg[1]).trim() : 'sem detalhe'}`);
  }
  const m = xml.match(/<(?:\w+:)?vdadosRetorno[^>]*>([\s\S]*?)<\/(?:\w+:)?vdadosRetorno>/);
  if (!m) {
    if (/<(?:\w+:)?vdadosRetorno[^>]*\/>/.test(xml)) return '';
    throw new ErroSoap('Resposta SOAP sem vdadosRetorno.');
  }
  return desescXml(m[1]);
}

export type OpcoesSoap = { fetch?: typeof fetch; uid?: string };

// Uma chamada wsagroServer01. Erros de rede/HTTP/Fault viram ErroSoap.
export async function chamarAgrosys(
  conexao: ConexaoAgrosys,
  req: { param: string; receb: string },
  opcoes: OpcoesSoap = {},
): Promise<string> {
  const f = opcoes.fetch ?? fetch;
  const timeout = conexao.cai_timeout && conexao.cai_timeout > 0 ? Math.max(conexao.cai_timeout, 3000) : 30000;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await f(urlAgrosys(conexao), {
      method: 'POST',
      headers: { 'content-type': 'text/xml; charset=utf-8', SOAPAction: '""' },
      body: montarEnvelope(opcoes.uid ?? crypto.randomUUID(), req.param, req.receb),
      signal: ctl.signal,
    });
    const texto = await r.text();
    if (!r.ok && !/<(?:\w+:)?Fault[\s>]/.test(texto)) throw new ErroSoap(`Agrosys respondeu HTTP ${r.status}.`, r.status);
    return lerEnvelope(texto);
  } catch (e) {
    if (e instanceof ErroSoap) throw e;
    if ((e as Error).name === 'AbortError') throw new ErroSoap(`Tempo limite de ${Math.round(timeout / 1000)} s ao chamar o Agrosys.`);
    throw new ErroSoap(`Falha ao chamar o Agrosys: ${(e as Error).message}`);
  } finally {
    clearTimeout(t);
  }
}
