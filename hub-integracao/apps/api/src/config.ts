export function config() {
  const jwtSecret = process.env.HUB_JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 16) {
    throw new Error('HUB_JWT_SECRET ausente ou curto (minimo 16 caracteres).');
  }
  const databaseUrl = process.env.HUB_DATABASE_URL;
  if (!databaseUrl) throw new Error('HUB_DATABASE_URL ausente.');
  return {
    databaseUrl,
    jwtSecret,
    port: Number(process.env.HUB_API_PORT ?? 4000),
    // Chave do Atualizador (painel unico): age como administrador do Hub; o painel aplica as permissoes.
    chaveServico: process.env.HUB_SERVICE_KEY && process.env.HUB_SERVICE_KEY.length >= 24 ? process.env.HUB_SERVICE_KEY : undefined,
  };
}
