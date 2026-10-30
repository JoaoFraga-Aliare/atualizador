import Dashboard from '../../dashboard/Dashboard';

// Um so painel atende todos os enderecos de /hub/...: na exportacao estatica gera-se a pagina base e o
// servidor (Nginx) entrega a mesma pagina para os enderecos mais fundos; em desenvolvimento o Next ja aceita qualquer um.
export const generateStaticParams = () => [{ slug: [] }];

export default function Page() {
  return <Dashboard />;
}
