# Integração CI/CD no Frontend

Este documento descreve a integração do portal com o backend para gerar tokens de upload, receber arquivos ZIP compilados e publicar versões.

## Visão geral

O fluxo possui duas credenciais diferentes:

- **JWT administrativo**: usado pelo portal para login, configuração do token, consulta de artefatos e publicação da versão.
- **Token de API**: gerado pelo usuário no portal e usado pelo pipeline CI/CD para enviar o ZIP.

O token de API pertence a um usuário e possui escopos próprios de produtos e canais. Um usuário pode selecionar vários produtos e vários canais.

O token completo é retornado somente no momento da geração. O backend armazena apenas o hash.

## URLs

Use uma variável para a URL do backend:

```js
const API_URL = 'http://localhost:3333';
```

Em produção, substituir pela URL pública da API.

## 1. Login do usuário

### Requisição

```http
POST /api/v1/auth/login
Content-Type: application/json
```

```json
{
  "user": "admin",
  "password": "senha-do-usuario"
}
```

### Resposta

```json
{
  "token": "jwt...",
  "user": {
    "id": 1,
    "username": "admin",
    "name": "Administrador",
    "role": "admin"
  }
}
```

O login também grava o cookie `central_session` (httpOnly, SameSite=Strict,
8 horas). No navegador, o portal não guarda o JWT: as chamadas usam
`credentials: 'same-origin'` e o cookie vai sozinho. `POST /api/v1/auth/logout`
revoga a sessão e apaga o cookie. Desativar o usuário revoga as sessões dele.

Scripts fora do navegador podem continuar usando o `token` retornado como
`Authorization: Bearer <JWT>`; ele vale enquanto a sessão não for revogada.

## 2. Produtos disponíveis

Use o endpoint existente para montar os checkboxes de produtos:

```http
GET /api/v1/admin/products
Authorization: Bearer <JWT>
```

Exemplo de resposta:

```json
[
  {
    "id": 1,
    "code": "pdv",
    "name": "PDV",
    "active": 1
  },
  {
    "id": 2,
    "code": "retaguarda",
    "name": "Retaguarda",
    "active": 1
  }
]
```

O front deve usar o campo `id` em `productIds`.

## 3. Gerar ou atualizar o token de API

Na tela do usuário, exibir:

- Lista de produtos com seleção múltipla.
- Lista de canais com seleção múltipla:
  - `test`
  - `beta`
  - `production`
- Botão para gerar ou substituir o token.
- Aviso de que o token completo será exibido apenas uma vez.

### Requisição

```http
POST /api/v1/admin/me/api-token
Authorization: Bearer <JWT>
Content-Type: application/json
```

```json
{
  "productIds": [1, 2],
  "channels": ["test", "beta", "production"]
}
```

`productIds` e `channels` são obrigatórios e devem conter pelo menos um item.

### Exemplo em JavaScript

```js
const response = await fetch(`${API_URL}/api/v1/admin/me/api-token`, {
  method: 'POST',
  headers: {
    ...authHeaders,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    productIds: [1, 2],
    channels: ['test', 'beta', 'production']
  })
});

const data = await response.json();
if (!response.ok) throw new Error(data.error);

// Mostrar e permitir copiar imediatamente.
// Não esperar obter este valor novamente pela API.
console.log(data.token);
```

### Resposta

```json
{
  "token": "cu_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  "productIds": [1, 2],
  "channels": ["test", "beta", "production"],
  "createdAt": "2026-08-28T12:00:00.000Z"
}
```

Ao gerar um novo token, o token anterior deixa de funcionar.

## 4. Consultar a configuração do token

Use ao abrir a tela de configuração:

```http
GET /api/v1/admin/me/api-token
Authorization: Bearer <JWT>
```

### Resposta com token configurado

```json
{
  "generated": true,
  "createdAt": "2026-08-28T12:00:00.000Z",
  "productIds": [1, 2],
  "channels": ["beta", "production"]
}
```

### Resposta sem token

```json
{
  "generated": false,
  "createdAt": null,
  "productIds": [],
  "channels": []
}
```

O token original nunca é retornado neste endpoint.

## 5. Revogar o token

```http
DELETE /api/v1/admin/me/api-token
Authorization: Bearer <JWT>
```

Resposta:

```json
{
  "revoked": true
}
```

## 6. Upload do ZIP pelo CI/CD

O pipeline deve usar o token de API, e não o JWT do portal.

### Endpoint

```http
POST /api/v1/ci/artifacts
Authorization: Bearer <TOKEN_DE_API>
Content-Type: multipart/form-data
```

Campos obrigatórios:

| Campo | Tipo | Descrição |
|---|---|---|
| `artifact` | arquivo | ZIP compilado |
| `product` | string | Código do produto, por exemplo `pdv` |
| `version` | string | Versão compilada, por exemplo `1.2.0` |
| `channel` | string | `test`, `beta` ou `production` |

### Exemplo com JavaScript

```js
const form = new FormData();
form.append('artifact', zipFile);
form.append('product', 'pdv');
form.append('version', '1.2.0');
form.append('channel', 'production');

const response = await fetch(`${API_URL}/api/v1/ci/artifacts`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${apiToken}`
  },
  body: form
});

const data = await response.json();
if (!response.ok) throw new Error(data.error);
```

### Resposta

```json
{
  "id": "0d8e4f85-8b7f-4d08-88dd-7f2d7b7d8f34",
  "product": "pdv",
  "version": "1.2.0",
  "channel": "production",
  "fileName": "pdv.zip",
  "sha256": "...",
  "sizeBytes": 12345678,
  "status": "pending"
}
```

Guardar o campo `id` caso o pipeline também tenha integração com o portal. O portal poderá localizar o mesmo artefato pela listagem.

### Regras do upload

- O arquivo precisa ter extensão `.zip`.
- O produto precisa estar ativo.
- O produto precisa estar selecionado no token.
- O canal precisa estar selecionado no token.
- O usuário também precisa ter permissão para o produto e canal.
- O limite atual do arquivo é 1 GB.

## 7. Listar artefatos enviados pelo usuário

Na tela de publicação, carregar os arquivos pendentes:

```http
GET /api/v1/admin/artifacts
Authorization: Bearer <JWT>
```

O backend filtra automaticamente pelo usuário autenticado. Não é necessário enviar `userId` e o front não deve permitir alterar esse filtro.

### Exemplo de resposta

```json
[
  {
    "id": "0d8e4f85-8b7f-4d08-88dd-7f2d7b7d8f34",
    "user_id": 1,
    "product_code": "pdv",
    "version": "1.2.0",
    "channel": "production",
    "file_path": ".incoming/0d8e4f85-8b7f-4d08-88dd-7f2d7b7d8f34.zip",
    "original_name": "pdv.zip",
    "sha256": "...",
    "size_bytes": 12345678,
    "created_at": "2026-08-28 12:00:00",
    "consumed_at": null,
    "product_name": "PDV"
  }
]
```

Recomendação de exibição:

- Nome do arquivo.
- Produto.
- Versão.
- Canal.
- Data do upload.
- Tamanho.
- Hash SHA-256.
- Status pendente.

Depois que um artefato for usado em uma release, ele deixa de aparecer na listagem de pendentes.

## 8. Publicar a versão usando o artefato

O usuário escolhe um artefato e preenche os demais dados da release no portal.

### Requisição

```http
POST /api/v1/admin/releases
Authorization: Bearer <JWT>
Content-Type: multipart/form-data
```

Campos necessários para usar um artefato CI/CD:

| Campo | Valor |
|---|---|
| `artifactType` | `package` |
| `artifactId` | ID retornado no upload/listagem |
| `productId` | ID numérico do produto |
| `version` | Igual à versão do artefato |
| `channel` | Igual ao canal do artefato |
| `targetType` | `all` ou `client` |
| `targetClientIds` | JSON, por exemplo `[]` ou `[3, 5]` |
| `deadlineAt` | Data futura em ISO 8601 |
| `mandatory` | `true` ou `false` |
| `minimumVersion` | Opcional |
| `notes` | Opcional |
| `technicalNotes` | Opcional |
| `showNotesPdv` | `true` ou `false` |

Não enviar o campo `artifact` quando usar `artifactId`.

### Exemplo em JavaScript

```js
const form = new FormData();
form.append('artifactType', 'package');
form.append('artifactId', artifact.id);
form.append('productId', String(productId));
form.append('version', artifact.version);
form.append('channel', artifact.channel);
form.append('targetType', 'all');
form.append('targetClientIds', '[]');
form.append('deadlineAt', '2026-09-01T12:00:00.000Z');
form.append('mandatory', 'false');
form.append('showNotesPdv', 'false');
form.append('technicalNotes', 'Correções da versão 1.2.0');

const response = await fetch(`${API_URL}/api/v1/admin/releases`, {
  method: 'POST',
  headers: authHeaders,
  body: form
});

const data = await response.json();
if (!response.ok) throw new Error(data.error);
```

O backend irá:

1. Validar que o artefato pertence ao usuário logado.
2. Validar produto, versão e canal.
3. Gerar o `manifest.json` no ZIP.
4. Calcular o hash final do pacote.
5. Criar a release.
6. Consumir o artefato pendente.

## 9. Erros que o front deve tratar

| HTTP | Código | Tratamento |
|---|---|---|
| 400 | `api_token_scope_required` | Selecionar pelo menos um produto e canal |
| 400 | `zip_required` | Enviar um arquivo ZIP |
| 400 | `version_required` | Informar a versão no upload |
| 400 | `invalid_channel` | Usar `test`, `beta` ou `production` |
| 400 | `artifact_not_found` | Atualizar a lista de artefatos |
| 400 | `artifact_metadata_mismatch` | Usar produto, versão e canal do artefato |
| 401 | `invalid_api_token` | Gerar um novo token de API |
| 401 | `unauthorized` | Fazer login novamente no portal |
| 403 | `api_token_scope_denied` | Ajustar produtos/canais do token |
| 403 | `scope_denied` | Usuário sem permissão para produto/canal |
| 404 | `product_not_found` | Atualizar a lista de produtos |
| 409 | `release_file_already_exists` | Escolher outra versão ou canal |

## 10. Fluxo recomendado da tela

1. Usuário faz login.
2. Front carrega `/api/v1/admin/products`.
3. Front carrega `/api/v1/admin/me/api-token`.
4. Usuário seleciona produtos e canais.
5. Usuário clica em gerar token.
6. Front mostra o token e oferece botão copiar.
7. Pipeline usa o token para enviar o ZIP.
8. Usuário abre a tela de publicação.
9. Front carrega `/api/v1/admin/artifacts`.
10. Usuário seleciona o artefato.
11. Front preenche versão, produto e canal a partir do artefato.
12. Usuário informa destino, prazo e notas.
13. Front envia `/api/v1/admin/releases` com `artifactId`.
14. Front atualiza a lista de artefatos e releases.

## Observações de segurança

- Nunca enviar o JWT do portal para o pipeline.
- Nunca salvar o token completo em banco ou log do frontend.
- O token deve ser mostrado somente após a geração.
- Ao substituir o token, o anterior é invalidado.
- Não aceitar `userId` vindo da interface para filtrar artefatos.
- O backend já restringe a listagem ao usuário autenticado.
