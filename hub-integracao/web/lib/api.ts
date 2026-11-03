// URL da API do Hub (lida no servidor; não expor segredos ao navegador).
export const API_URL = process.env.API_URL ?? 'http://127.0.0.1:3333';

export interface EmpresaResumo {
  id: string;
  razao_social: string;
  cnpj: string;
  cota_caixas: number;
  caixas: { id: string; codigo: number; nome: string | null; ativo: boolean }[];
}
