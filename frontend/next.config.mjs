import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';

// O package-lock da raiz (ferramentas de lint) nao deve virar a raiz do Next.
const root = path.dirname(fileURLToPath(import.meta.url));

// Em desenvolvimento o Next so entrega os scripts da pagina (hidratacao) para origens permitidas: abrir o
// painel pelo IP da maquina sem listar o IP deixa a pagina "morta" (o login so recarrega e volta).
// Liberamos os IPs desta maquina; DEV_ORIGINS acrescenta outros hosts (separados por virgula).
const localIps = Object.values(os.networkInterfaces())
  .flat()
  .filter(item => item && item.family === 'IPv4')
  .map(item => item.address);
const extraOrigins = (process.env.DEV_ORIGINS ?? '')
  .split(',')
  .map(item => item.trim())
  .filter(Boolean);

export default phase => {
  const development = phase === PHASE_DEVELOPMENT_SERVER;

  if (development) {
    return {
      outputFileTracingRoot: root,
      trailingSlash: true,
      allowedDevOrigins: [...new Set([...localIps, ...extraOrigins])],
      async rewrites() {
        return [
          { source: '/api/:path*', destination: 'http://127.0.0.1:3333/api/:path*' },
          { source: '/downloads/:path*', destination: 'http://127.0.0.1:3333/downloads/:path*' }
        ];
      }
    };
  }

  return {
    // A exportacao estatica continua sendo usada no deploy com Nginx.
    output: 'export',
    outputFileTracingRoot: root,
    trailingSlash: true
  };
};
