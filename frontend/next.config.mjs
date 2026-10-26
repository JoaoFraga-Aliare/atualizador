import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';

// O package-lock da raiz (ferramentas de lint) nao deve virar a raiz do Next.
const root = path.dirname(fileURLToPath(import.meta.url));

export default phase => {
  const development = phase === PHASE_DEVELOPMENT_SERVER;

  if (development) {
    return {
      outputFileTracingRoot: root,
      trailingSlash: true,
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
