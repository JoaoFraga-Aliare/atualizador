import type { EmpresaResumo } from '../../lib/api';

// Esqueleto: lista de empresas/caixas. Os dados virão de GET /v1/admin/empresas (ainda não implementado),
// autenticado pela sessão do usuário. Por enquanto a lista fica vazia.
const empresas: EmpresaResumo[] = [];

export default function Empresas() {
  return (
    <main>
      <h1>Empresas e caixas</h1>
      {empresas.length === 0 ? (
        <p>Nenhuma empresa para exibir (API administrativa pendente).</p>
      ) : (
        <table>
          <thead>
            <tr><th>Empresa</th><th>CNPJ</th><th>Caixas (cota)</th></tr>
          </thead>
          <tbody>
            {empresas.map((e) => (
              <tr key={e.id}>
                <td>{e.razao_social}</td>
                <td>{e.cnpj}</td>
                <td>{e.caixas.length} / {e.cota_caixas}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
