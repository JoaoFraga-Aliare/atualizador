import fs from 'node:fs';
import path from 'node:path';
import { readArtifactZip } from './ci-artifacts.js';

// Leitura de arquivos .map "Detailed" do Delphi para localizar unit, procedure e linha de um endereço.
const SEGMENT = /^\s*([0-9A-F]{4}):([0-9A-F]{8})\s+([0-9A-F]{8})H\s+(\S+)\s+(\S+)/i,
  DETAIL = /^\s*([0-9A-F]{4}):([0-9A-F]{8})\s+([0-9A-F]{8})\s+C=\S+\s+S=\S+\s+G=\S+\s+M=(\S+)/i,
  PUBLIC = /^\s*([0-9A-F]{4}):([0-9A-F]{8})\s+(\S.*?)\s*$/i,
  LINE_HEADER = /^Line numbers for (\S+)\((.+?)\) segment (\S+)/,
  LINE_ENTRY = /(\d+)\s+([0-9A-F]{4}):([0-9A-F]{8})/gi,
  CODE_SEGMENT = '0001',
  MAX_CACHE = 3,
  cache = new Map();

export function parseMap(text) {
  const modules = [],
    publics = [],
    lines = [];
  let base = 0x401000,
    mode = '',
    unit = null;
  for (const raw of text.split(/\r?\n/)) {
    if (/^\s*Start\s+Length\s+Name/.test(raw)) mode = 'segments';
    else if (/^Detailed map of segments/.test(raw)) mode = 'detail';
    else if (/^\s*Address\s+Publics by/.test(raw) || /^Publics by/.test(raw)) mode = 'publics';
    else if (LINE_HEADER.test(raw)) {
      const [, name, file, segment] = raw.match(LINE_HEADER);
      mode = 'lines';
      unit = segment === '.text' ? { name, file } : null;
    } else if (mode === 'segments') {
      const m = raw.match(SEGMENT);
      if (m && m[1] === CODE_SEGMENT) base = parseInt(m[2], 16);
    } else if (mode === 'detail') {
      const m = raw.match(DETAIL);
      if (m && m[1] === CODE_SEGMENT) {
        const start = parseInt(m[2], 16);
        modules.push({ start, end: start + parseInt(m[3], 16), name: m[4] });
      }
    } else if (mode === 'publics') {
      const m = raw.match(PUBLIC);
      if (m && m[1] === CODE_SEGMENT) publics.push({ offset: parseInt(m[2], 16), name: m[3] });
    } else if (mode === 'lines' && unit) {
      for (const m of raw.matchAll(LINE_ENTRY))
        if (m[2] === CODE_SEGMENT)
          lines.push({ offset: parseInt(m[3], 16), line: Number(m[1]), unit: unit.name, file: unit.file });
    }
  }
  const byOffset = (a, b) => a.offset - b.offset;
  modules.sort((a, b) => a.start - b.start);
  publics.sort(byOffset);
  lines.sort(byOffset);
  return { base, modules, publics, lines };
}

// Maior índice cujo item satisfaz key(item) <= value.
function floorIndex(items, value, key) {
  let low = 0,
    high = items.length - 1,
    found = -1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (key(items[mid]) <= value) {
      found = mid;
      low = mid + 1;
    } else high = mid - 1;
  }
  return found;
}

export function parseAddress(value) {
  const text = String(value ?? '').trim();
  const m = text.match(/^(?:\$|0x)?(?:([0-9A-F]{4}):)?([0-9A-F]{1,16})$/i);
  if (!m) return null;
  return { segmented: Boolean(m[1]), value: parseInt(m[2], 16) };
}

export function resolveAddress(map, address, { returnAddress = false } = {}) {
  const parsed = typeof address === 'object' && address ? address : parseAddress(address);
  if (!parsed) return null;
  // Em quadros de pilha o endereço aponta para a instrução seguinte à chamada.
  let offset = parsed.segmented || parsed.value < map.base ? parsed.value : parsed.value - map.base;
  if (returnAddress && offset > 0) offset -= 1;
  const moduleIndex = floorIndex(map.modules, offset, x => x.start),
    module = moduleIndex >= 0 && offset < map.modules[moduleIndex].end ? map.modules[moduleIndex] : null;
  if (!module) return null;
  const publicIndex = floorIndex(map.publics, offset, x => x.offset),
    symbol = publicIndex >= 0 && map.publics[publicIndex].offset >= module.start ? map.publics[publicIndex] : null,
    lineIndex = floorIndex(map.lines, offset, x => x.offset),
    line =
      lineIndex >= 0 &&
      map.lines[lineIndex].unit.toLowerCase() === module.name.toLowerCase() &&
      map.lines[lineIndex].offset >= module.start
        ? map.lines[lineIndex]
        : null;
  return {
    address: `0001:${offset.toString(16).toUpperCase().padStart(8, '0')}`,
    unit: module.name,
    file: line?.file || null,
    procedure: symbol?.name || null,
    line: line?.line || null,
    offsetInProcedure: symbol ? offset - symbol.offset : null
  };
}

// Localiza o .map dentro do pacote da versão publicada, com cache do índice já processado.
export function loadMapFromPackage(zipFile, preferredNames = []) {
  const stat = fs.statSync(zipFile),
    key = `${zipFile}:${stat.mtimeMs}:${stat.size}:${preferredNames.join(',')}`;
  if (cache.has(key)) return cache.get(key);
  const files = readArtifactZip(zipFile),
    maps = [...files.values()].filter(x => x.name.toLowerCase().endsWith('.map')),
    wanted = preferredNames.map(x => x.toLowerCase()),
    entry =
      wanted.map(name => maps.find(x => path.posix.basename(x.name).toLowerCase() === name)).find(Boolean) || null;
  const result = entry ? { name: entry.name, map: parseMap(new TextDecoder('latin1').decode(entry.data)) } : null;
  cache.set(key, result);
  if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
  return result;
}

const HINTS = [
  [
    /EAccessViolation/i,
    'Acesso a memória inválida: normalmente objeto nil, já liberado (Free) ou ponteiro não inicializado. Verifique se o objeto foi criado antes do uso.'
  ],
  [
    /EDivByZero|EZeroDivide/i,
    'Divisão por zero: confira se o divisor (quantidade, parcelas, fator) pode chegar zerado.'
  ],
  [
    /EInvalidOp|EOverflow|EUnderflow/i,
    'Operação de ponto flutuante inválida: valores NaN/infinito ou fora do intervalo em cálculos.'
  ],
  [
    /EConvertError|EVariantError|EVariantTypeCastError/i,
    'Falha de conversão de tipo: texto/valor em formato inesperado (número, data, boolean) ou campo nulo.'
  ],
  [
    /ERangeError|EIntOverflow|EListError|EStringListError/i,
    'Índice fora do limite: acesso a posição inexistente em lista, array ou string.'
  ],
  [
    /EOleException|EOleSysError/i,
    'Erro de COM/OLE (ex.: Excel, impressora fiscal, ADO). Veja o código HRESULT e se o componente está instalado/registrado.'
  ],
  [
    /EDatabaseError|EFDDBEngineException|EFDException|EZSQLException/i,
    'Erro de banco de dados: conexão, SQL inválido, constraint, campo/tabela inexistente ou dataset fechado.'
  ],
  [
    /EFOpenError|EFCreateError|EInOutError|EFileStreamError/i,
    'Falha de arquivo: arquivo ausente, em uso por outro processo ou sem permissão de acesso.'
  ],
  [
    /ESocketError|EIdSocketError|EIdConnClosedGracefully|EIdReadTimeout|ESSL|EIdHTTPProtocolException/i,
    'Falha de rede: servidor indisponível, timeout, conexão encerrada ou certificado inválido.'
  ],
  [
    /EOutOfMemory|EStackOverflow/i,
    'Falta de memória ou recursão infinita: procure por loops de chamada (evento que dispara a si mesmo).'
  ],
  [/EInvalidPointer/i, 'Ponteiro inválido: liberação dupla de memória ou objeto já destruído.'],
  [/EAbort/i, 'Operação abortada intencionalmente (Abort); normalmente não indica falha.']
];

export function exceptionHints(exceptionClass, message) {
  const hints = HINTS.filter(([pattern]) => pattern.test(exceptionClass || '')).map(([, text]) => text);
  if (/out of memory|mem[oó]ria/i.test(message || ''))
    hints.push('A mensagem cita memória: verifique consumo e vazamentos no terminal.');
  if (/access violation/i.test(message || '') && !hints.length) hints.push(HINTS[0][1]);
  return hints;
}

function extractAddresses(payload) {
  const found = [],
    push = (value, kind) => {
      const parsed = parseAddress(value);
      if (parsed) found.push({ ...parsed, kind });
    },
    first = payload.exceptionAddress ?? payload.exceptAddr ?? payload.address ?? payload.endereco;
  if (first != null) push(first, 'exception');
  const stack = payload.stackTrace ?? payload.stack ?? payload.callStack;
  const tokens = Array.isArray(stack)
    ? stack.map(String)
    : typeof stack === 'string'
      ? stack.match(/(?:\b[0-9A-F]{4}:)?\b[0-9A-F]{6,8}\b/gi) || []
      : [];
  for (const token of tokens) push(token, 'stack');
  const seen = new Set();
  return found.filter(x => {
    const id = `${x.segmented}:${x.value}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

// Monta a análise exibida no detalhe do erro. Nunca lança: falhas viram status descritivos.
export function analyzeError({ payload, productCode, packageFile }) {
  const exception = payload.exceptionClass || payload.exception || '',
    hints = exceptionHints(exception, payload.message),
    addresses = extractAddresses(payload);
  if (!addresses.length) return { status: 'no_address', hints, frames: [] };
  if (!packageFile || !fs.existsSync(packageFile)) return { status: 'package_not_found', hints, frames: [] };
  try {
    const executable = path.win32.basename(String(payload.executable || payload.exe || '')).replace(/\.exe$/i, ''),
      names = [...new Set([executable, productCode].filter(Boolean).map(x => `${x}.map`))],
      loaded = loadMapFromPackage(packageFile, names);
    if (!loaded) return { status: 'map_not_found', hints, frames: [] };
    const frames = addresses
      .map(x => {
        const location = resolveAddress(loaded.map, x, { returnAddress: x.kind === 'stack' });
        return location && { kind: x.kind, ...location };
      })
      .filter(Boolean);
    return { status: frames.length ? 'resolved' : 'unresolved', map: loaded.name, hints, frames };
  } catch {
    return { status: 'map_error', hints, frames: [] };
  }
}
