# Prompt: verificação da assinatura dos pacotes no Atualizador do PDV

Cole o texto abaixo numa sessão aberta em `D:\Projetos\PDV\PDV`.

---

Preciso que o Atualizador do PDV (`atualizador\`, projeto `Atualizador.dproj`,
Delphi 12) passe a verificar a assinatura digital que a Central de Atualização
agora envia em cada publicação, e recuse qualquer pacote cuja assinatura não
seja válida.

## Contexto

A Central (`/api/v1/updates/check`) já devolvia `releaseId`, `version`,
`sha256` e `sizeBytes`. Hoje o Atualizador só confere o SHA-256 e o tamanho do
arquivo baixado contra esses valores, o que garante integridade mas não
autoria: quem conseguir alterar a resposta da consulta e o arquivo no caminho
consegue instalar qualquer executável nos caixas.

A resposta passou a trazer também:

| Campo | Exemplo |
|---|---|
| `signature` | Base64 de 64 bytes (assinatura Ed25519) |
| `signatureKeyId` | `489b4bb1ee0aa58a` (16 hex: início do SHA-256 da chave pública crua) |
| `signatureAlgorithm` | `ed25519` |
| `signedPayloadFormat` | `agrosys-release-v1` |

## O que é assinado

Texto UTF-8, linhas separadas por `#10` (LF, nunca CRLF), sem quebra de linha
no final, exatamente nesta ordem:

```text
agrosys-release-v1
releaseId=<releaseId da resposta>
product=<produto que o Atualizador consultou, ex.: pdv>
channel=<canal que o Atualizador consultou, ex.: production>
version=<version da resposta>
sha256=<sha256 da resposta, em minúsculas>
sizeBytes=<sizeBytes da resposta, inteiro sem separador>
```

`product` e `channel` devem vir da configuração do Atualizador
(`Config.ProductCode` e `Config.Channel`), não da resposta: assim um pacote
assinado para `beta` não é aceito num terminal de `production`.

## Vetor de teste (use num teste unitário)

- Chave pública (32 bytes crus, Base64): `A6EHv/POEL4dcN0Y50vAmWfk1jCbpQ1fHdyGZBJVMbg=`
- Dados: releaseId `42`, product `pdv`, channel `production`, version `2.3.1.0`,
  sha256 = 64 letras `a`, sizeBytes `1048576`
- Texto assinado:
  `agrosys-release-v1#10releaseId=42#10product=pdv#10channel=production#10version=2.3.1.0#10sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa#10sizeBytes=1048576`
- Assinatura esperada (Base64):
  `dh+KJaRDlnc+9Ob597G0cAuhXOjCO7kpkCil2dRnuprXzA+5mkfo9+6aud/FFX22saH5xcX712DAzGJD5MnaCw==`
- A verificação deve falhar se qualquer campo mudar (por exemplo
  `channel=beta` ou outro sha256).

## O que implementar

1. **Biblioteca Ed25519.** O Delphi não traz Ed25519, e o OpenSSL que já vai
   com o PDV (`libeay32.dll`, 1.0.x) não suporta esse algoritmo. Escolha e me
   diga qual usou:
   - `libsodium.dll` (função `crypto_sign_verify_detached`), distribuída junto
     do Atualizador; ou
   - uma implementação em Pascal puro e de licença permissiva, como a
     CryptoLib4Pascal, para não depender de DLL.
   Isole a verificação numa unit própria (por exemplo `uUpdaterSignature.pas`)
   com uma função do tipo
   `VerifyReleaseSignature(const Info: TUpdateInfo; const Product, Channel: string): Boolean`.

2. **Chaves confiáveis embutidas no executável**, como constantes indexadas
   por `keyId` (Base64 dos 32 bytes). Precisa caber mais de uma: a de
   produção e a de homologação/teste, que são diferentes, e uma futura chave
   de rotação. A chave de cada Central é obtida em
   `GET <BaseUrl>/api/v1/packages/signing-key` (campos `keyId` e `publicKey`).
   Não leia a chave do `updater.ini`. Deixe marcadores claros para eu colar as
   chaves reais; para o teste use a do vetor acima.

3. **Leitura dos campos novos** em `TUpdaterHttp.Check`
   (`uUpdaterHttp.pas`): incluir `Signature`, `SignatureKeyId`,
   `SignatureAlgorithm` e `SignedPayloadFormat` em `TUpdateInfo`
   (`uUpdaterModels.pas`).

4. **Verificação antes do download**, nos dois fluxos:
   - `uAtualizadorCore.pas`, no ponto em que a consulta é processada e o
     pacote vai para o cache (`.updater\cache\<canal>\<releaseId>`);
   - `uUpdater.pas`, logo após `Http.Check`.
   Recuse se: `signatureAlgorithm` não for `ed25519`; `signedPayloadFormat`
   não for `agrosys-release-v1`; `signatureKeyId` não estiver entre as chaves
   embutidas; a assinatura estiver vazia ou não conferir. Depois de validada a
   assinatura, mantenha a conferência de SHA-256 e tamanho do arquivo baixado
   que já existe, e torne o tamanho obrigatório (hoje `SizeBytes = 0` pula a
   conferência).

5. **Cache.** `BuildCheckResult` grava `cache-info.json` e a instalação
   posterior confia nele (`ValidateCachedPackage`). Grave também a assinatura e
   os campos assinados no cache e verifique a assinatura de novo antes de
   instalar, para que editar o `cache-info.json` não permita instalar outro
   pacote.

6. **Falha de assinatura** deve ser tratada como erro de segurança: não baixar
   nem instalar, registrar no log, enviar evento com `status` `error` e uma
   mensagem curta (por exemplo `Assinatura do pacote invalida`) pelo
   `SendEvent`, e não cair em nenhum caminho que instale mesmo assim.

## Restrições

- Os `.pas` deste projeto estão em ANSI (Windows-1252); preserve a codificação
  e os finais de linha ao editar.
- Não mude o formato do texto assinado nem a ordem dos campos: ele precisa
  ficar idêntico ao da Central.
- A Central já está assinando todas as publicações, inclusive as antigas, então
  não é preciso aceitar pacote sem assinatura. Mesmo assim, me avise se algum
  fluxo (por exemplo artefatos `sql`) não passar pelo `/updates/check`.

## Pronto quando

- O teste unitário com o vetor acima passa, e falha ao alterar qualquer campo.
- O Atualizador compila em Release.
- Contra uma Central de teste com a chave dela embutida, uma atualização
  válida é baixada e instalada, e uma resposta com `signature` adulterada ou
  com `channel` diferente é recusada antes do download.
- Me diga quais arquivos mudaram, qual biblioteca Ed25519 foi usada e o que
  precisa ser distribuído junto (DLL, se houver).
