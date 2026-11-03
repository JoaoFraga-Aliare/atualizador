import os from 'node:os';

// Em desenvolvimento o Next só entrega os scripts da página (hidratação) para origens
// permitidas; abrir o gerencial pelo IP da máquina (ex.: http://192.168.5.22:3100) sem
// listá-lo deixa a página renderizada mas "morta" (cliques não fazem nada).
// Liberamos automaticamente os IPs desta máquina; HUB_DEV_ORIGINS acrescenta outros
// (hosts separados por vírgula).
const ipsLocais = Object.values(os.networkInterfaces())
  .flat()
  .filter((i) => i && i.family === 'IPv4')
  .map((i) => i.address);
const extras = (process.env.HUB_DEV_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@hub/contracts'],
  allowedDevOrigins: [...new Set([...ipsLocais, ...extras])],
};

export default nextConfig;
