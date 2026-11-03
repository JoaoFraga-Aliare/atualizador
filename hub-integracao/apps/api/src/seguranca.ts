import { createHash } from 'node:crypto';
import { lookup as dnsLookup, type LookupAddress, type LookupOptions } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import type { NextFunction, Request, Response } from 'express';

// Protecoes de borda do Hub: cabecalhos de seguranca e limites de taxa (forca bruta e abuso), sem dependencias.
// Todos os limites vem do ambiente (HUB_RATE_*) e tem padroes pensados para lojas atras de um mesmo IP (NAT).

type Janela = { n: number; ate: number };

// Contador de janela fixa em memoria (por processo). Chaves expiram sozinhas.
export class Contador {
  private mapa = new Map<string, Janela>();
  constructor(private janelaMs: number) {
    setInterval(() => { const t = Date.now(); for (const [k, v] of this.mapa) if (v.ate <= t) this.mapa.delete(k); }, Math.max(1000, Math.min(janelaMs, 60_000))).unref();
  }
  private atual(chave: string): Janela {
    const t = Date.now();
    const j = this.mapa.get(chave);
    if (j && j.ate > t) return j;
    const nova = { n: 0, ate: t + this.janelaMs };
    this.mapa.set(chave, nova);
    return nova;
  }
  contar(chave: string): number { return this.atual(chave).n; }
  somar(chave: string): number { const j = this.atual(chave); j.n += 1; return j.n; }
  limpar(chave: string) { this.mapa.delete(chave); }
  segundosAte(chave: string): number { return Math.max(1, Math.ceil((this.atual(chave).ate - Date.now()) / 1000)); }
}

const num = (nome: string, padrao: number) => { const v = Number(process.env[nome]); return Number.isFinite(v) && v > 0 ? v : padrao; };

export type Limites = ReturnType<typeof lerLimites>;
export const lerLimites = () => ({
  loginMax: num('HUB_RATE_LOGIN_MAX', 10),            // falhas de login por IP+e-mail na janela
  loginIpMax: num('HUB_RATE_LOGIN_IP_MAX', 40),       // falhas de login por IP (varios e-mails)
  loginJanelaS: num('HUB_RATE_LOGIN_JANELA_S', 300),
  falha401Max: num('HUB_RATE_401_MAX', 100),          // respostas 401 por IP por minuto (chute de token/chave)
  credencialMax: num('HUB_RATE_CRED_MAX', 1200),      // requisicoes por credencial (ou IP, sem credencial) por minuto
});

export const ipDe = (req: Request) => req.ip ?? req.socket.remoteAddress ?? 'desconhecido';
const hash = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 24);

function bloquear(res: Response, segundos: number, motivo: string) {
  res.setHeader('Retry-After', String(segundos));
  res.status(429).json({ erro: motivo });
}

// Cabecalhos para uma API JSON (nada de cache, nada de sniffing, nada de iframe).
export function cabecalhosSeguros(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  res.setHeader('Cache-Control', 'no-store');
  next();
}

export function criarLimitadores(l: Limites) {
  const porMinuto = new Contador(60_000);
  const falhas401 = new Contador(60_000);
  const login = new Contador(l.loginJanelaS * 1000);

  // Por credencial: um terminal/chave/usuario nao deve fazer mais que credencialMax pedidos por minuto; sem credencial, por IP.
  // Antes disso, IP com muitas respostas 401 seguidas (tentativa de adivinhar token ou chave) recebe 429.
  const geral = (req: Request, res: Response, next: NextFunction) => {
    const ip = ipDe(req);
    if (falhas401.contar(ip) >= l.falha401Max) return bloquear(res, falhas401.segundosAte(ip), 'Muitas tentativas com credencial invalida. Aguarde.');
    const cred = req.header('authorization') ?? req.header('x-hub-service-key');
    const chave = cred ? `c:${hash(cred)}` : `i:${ip}`;
    if (porMinuto.somar(chave) > l.credencialMax) return bloquear(res, porMinuto.segundosAte(chave), 'Limite de requisicoes por minuto excedido.');
    res.on('finish', () => { if (res.statusCode === 401) falhas401.somar(ip); });
    next();
  };

  const chaveLogin = (req: Request, email: string) => `${ipDe(req)}|${email.trim().toLowerCase().slice(0, 200)}`;
  return {
    geral,
    login: {
      bloqueado(req: Request, email: string): number {
        const ip = ipDe(req);
        if (login.contar(`ip:${ip}`) >= l.loginIpMax) return login.segundosAte(`ip:${ip}`);
        const k = chaveLogin(req, email);
        return login.contar(k) >= l.loginMax ? login.segundosAte(k) : 0;
      },
      falhou(req: Request, email: string) { login.somar(`ip:${ipDe(req)}`); login.somar(chaveLogin(req, email)); },
      acertou(req: Request, email: string) { login.limpar(chaveLogin(req, email)); },
    },
    bloquear,
  };
}

// ---- destino seguro (SSRF) ----------------------------------------------------------------------------------
// Chamadas que o Hub faz a enderecos informados por terceiros (webhooks, download de certificado) nunca alcancam a rede
// interna, a menos que HUB_WEBHOOK_REDE_INTERNA=sim. A verificacao acontece NA CONEXAO (lookup proprio), entao nao ha
// janela para DNS rebinding, e IPv6 e analisado byte a byte (mapeado ::ffff:, NAT64, 6to4, link-local...).
export const redeInternaPermitida = () => process.env.HUB_WEBHOOK_REDE_INTERNA === 'sim';

function bytesV6(ip: string): number[] | null {
  let s = ip.toLowerCase().split('%')[0];
  if (s.includes('.')) {
    const i = s.lastIndexOf(':');
    const v4 = s.slice(i + 1).split('.').map(Number);
    if (v4.length !== 4 || v4.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    s = `${s.slice(0, i + 1)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const partes = s.split('::');
  if (partes.length > 2) return null;
  const lista = (t: string) => (t === '' ? [] : t.split(':'));
  const a = lista(partes[0]);
  const b = partes.length === 2 ? lista(partes[1]) : [];
  const falta = 8 - a.length - b.length;
  if ((partes.length === 1 && a.length !== 8) || falta < (partes.length === 2 ? 0 : 0)) return null;
  const grupos = partes.length === 2 ? [...a, ...Array<string>(falta).fill('0'), ...b] : a;
  if (grupos.length !== 8) return null;
  const out: number[] = [];
  for (const g of grupos) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    const n = parseInt(g, 16);
    out.push(n >> 8, n & 255);
  }
  return out;
}

const v4Interno = (a: number, b: number, c: number) =>
  a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
  || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0 && c === 0) || (a === 198 && (b === 18 || b === 19));

// true para qualquer endereco que nao seja um IP publico roteavel (ou que nao de para entender).
export function ipPrivado(ip: string): boolean {
  const limpo = ip.replace(/^\[|\]$/g, '');
  if (isIP(limpo) === 4) { const [a, b, c] = limpo.split('.').map(Number); return v4Interno(a, b, c); }
  const by = bytesV6(limpo);
  if (!by) return true;
  const zeros = (de: number, ate: number) => by.slice(de, ate).every((x) => x === 0);
  const v4 = (i: number) => v4Interno(by[i], by[i + 1], by[i + 2]);
  if (zeros(0, 16)) return true;                                                         // ::
  if (zeros(0, 10) && by[10] === 0xff && by[11] === 0xff) return v4(12);                 // ::ffff:a.b.c.d (mapeado, inclusive em hexa)
  if (zeros(0, 12)) return true;                                                         // ::a.b.c.d e ::1 (compativel/loopback)
  if (by[0] === 0x00 && by[1] === 0x64 && by[2] === 0xff && by[3] === 0x9b && zeros(4, 12)) return v4(12);   // 64:ff9b::/96 (NAT64)
  if (by[0] === 0x20 && by[1] === 0x02) return v4(2);                                    // 2002::/16 (6to4)
  if (by[0] === 0x20 && by[1] === 0x01 && by[2] === 0x00 && by[3] === 0x00) return true; // Teredo
  if ((by[0] & 0xfe) === 0xfc) return true;                                              // fc00::/7 (unique local)
  if (by[0] === 0xfe && (by[1] & 0xc0) !== 0x40) return true;                            // fe80::/10 link-local e fec0::/10 site-local
  if (by[0] === 0xff) return true;                                                       // multicast
  return false;
}

// Confere o destino antes de conectar: IP literal interno e recusado aqui; nomes sao resolvidos e filtrados na conexao.
export function exigirDestinoPublico(url: string): void {
  const host = new URL(url).hostname.replace(/^\[|\]$/g, '');
  if (!redeInternaPermitida() && isIP(host) && ipPrivado(host)) throw new Error('Destino em rede interna nao permitido.');
}

type LookupCb = (err: NodeJS.ErrnoException | null, address?: string | LookupAddress[], family?: number) => void;
const lookupSeguro = (hostname: string, opcoes: LookupOptions | number | undefined, cb: LookupCb) => {
  const o: LookupOptions = typeof opcoes === 'number' ? { family: opcoes } : (opcoes ?? {});
  dnsLookup(hostname, { ...o, all: true }, (err, enderecos) => {
    if (err) return cb(err);
    const lista = (enderecos as LookupAddress[]).filter((x) => redeInternaPermitida() || !ipPrivado(x.address));
    if (!lista.length) return cb(Object.assign(new Error('Destino em rede interna nao permitido.'), { code: 'EDESTINOINTERNO' }) as NodeJS.ErrnoException);
    if (o.all) return cb(null, lista);
    cb(null, lista[0].address, lista[0].family);
  });
};

export type RespostaSegura = { status: number; corpo: Buffer };
// HTTP(S) sem seguir redirecionamentos, com tempo e tamanho maximos e destino validado na conexao.
export function requisicaoSegura(
  urlTexto: string, o: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs: number; maxBytes: number },
): Promise<RespostaSegura> {
  return new Promise((resolve, reject) => {
    let u: URL;
    try { u = new URL(urlTexto); exigirDestinoPublico(urlTexto); } catch (e) { return reject(e); }
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return reject(new Error('Protocolo nao permitido.'));
    const mod = u.protocol === 'https:' ? https : http;
    const corpo = o.body === undefined ? undefined : Buffer.from(o.body);
    const req = mod.request(u, {
      method: o.method ?? 'GET', lookup: lookupSeguro as never,
      headers: { ...o.headers, ...(corpo ? { 'content-length': String(corpo.length) } : {}) },
    }, (res) => {
      const partes: Buffer[] = [];
      let total = 0;
      res.on('data', (c: Buffer) => {
        total += c.length;
        if (total <= o.maxBytes) partes.push(c);
        else if (total > o.maxBytes * 4) req.destroy(new Error('Resposta grande demais.'));
      });
      res.on('end', () => { clearTimeout(timer); resolve({ status: res.statusCode ?? 0, corpo: Buffer.concat(partes).subarray(0, o.maxBytes) }); });
      res.on('error', (e) => { clearTimeout(timer); reject(e); });
    });
    const timer = setTimeout(() => req.destroy(Object.assign(new Error('Tempo esgotado.'), { name: 'TimeoutError' })), o.timeoutMs);
    req.on('error', (e) => { clearTimeout(timer); reject(e); });
    if (corpo) req.write(corpo);
    req.end();
  });
}

// Requisicoes do Postman (ou de qualquer teste manual) se identificam com Referer: postman. O que elas gravam e de teste
// e nao conta no calculo de homologacao (prontidao).
export const origemTeste = (req: Request): boolean => /^postman/i.test((req.header('referer') ?? '').trim());
