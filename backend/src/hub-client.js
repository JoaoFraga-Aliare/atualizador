// Cliente da API do Hub (servico separado): o painel autentica o usuario e repassa a chamada
// com a chave de servico, que a API do Hub trata como administrador.
export class HubError extends Error {
  constructor(status, message, detail) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

export function createHubClient({ url = process.env.HUB_API_URL, key = process.env.HUB_SERVICE_KEY } = {}) {
  const configured = Boolean(url && key);
  async function call(path, { method = 'GET', body } = {}) {
    if (!configured) throw new HubError(503, 'hub_not_configured');
    let response;
    try {
      response = await fetch(url.replace(/\/$/, '') + path, {
        method,
        headers: {
          'x-hub-service-key': key,
          ...(body === undefined ? {} : { 'content-type': 'application/json' })
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30000)
      });
    } catch {
      throw new HubError(502, 'hub_unreachable');
    }
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new HubError(response.status, data?.erro || `hub_error_${response.status}`, data?.detalhe);
    return data;
  }
  return { configured, call };
}
