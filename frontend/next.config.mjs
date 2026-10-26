import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';

export default phase => {
  const development = phase === PHASE_DEVELOPMENT_SERVER;

  if (development) {
    return {
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
    trailingSlash: true
  };
};
