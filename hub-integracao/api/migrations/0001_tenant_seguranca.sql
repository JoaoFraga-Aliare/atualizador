-- 0001: tenant (empresa, caixa), usuários, escopos, tokens e auditoria, com RLS.
-- Convenção de RLS: a API define, por transação, app.empresa_id (tenant) ou app.admin = '1'
-- (painel do admin geral / multiempresa, que filtra por vínculo na camada de aplicação).

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hub_app') THEN
    CREATE ROLE hub_app NOLOGIN NOBYPASSRLS;
  END IF;
END $$;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE FUNCTION hub_empresa_atual() RETURNS uuid
  LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.empresa_id', true), '')::uuid $$;

CREATE FUNCTION hub_eh_admin() RETURNS boolean
  LANGUAGE sql STABLE AS
$$ SELECT coalesce(current_setting('app.admin', true), '') = '1' $$;

CREATE FUNCTION hub_caixa_atual() RETURNS uuid
  LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.caixa_id', true), '')::uuid $$;

-- 'empresa' | 'caixa' (tokens) | 'usuario' (painel); vazio = nenhum
CREATE FUNCTION hub_papel_atual() RETURNS text
  LANGUAGE sql STABLE AS
$$ SELECT coalesce(current_setting('app.papel', true), '') $$;

-- Cursor global de sincronização incremental (ERP -> Hub -> PDV)
CREATE SEQUENCE hub_versao_seq;
CREATE FUNCTION hub_bump_versao() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN NEW.hub_versao := nextval('hub_versao_seq'); NEW.hub_atualizado_em := now(); RETURN NEW; END $$;

-- ---------------------------------------------------------------- empresa
CREATE TABLE empresa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  razao_social text NOT NULL,
  fantasia text,
  cnpj varchar(14) NOT NULL UNIQUE,
  inscricao_estadual varchar(15),
  fone varchar(15),
  cep varchar(10),
  endereco text,
  numero varchar(10),
  complemento text,
  bairro_nome text,
  cidade_nome text,
  cidade_ibge integer,
  uf char(2),
  logo text,
  -- ids no player (Agrosys: emp_empresa, uni_unidade, fil_filial, *_hlg, *_cx)
  ids_externos jsonb NOT NULL DEFAULT '{}',
  cota_caixas integer NOT NULL DEFAULT 1 CHECK (cota_caixas >= 0),
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

-- Fiscal (segredos cifrados com AES-256-GCM pela aplicação; nunca devolvidos em listagens)
CREATE TABLE empresa_fiscal (
  empresa_id uuid PRIMARY KEY REFERENCES empresa(id) ON DELETE CASCADE,
  ambiente smallint NOT NULL DEFAULT 2 CHECK (ambiente IN (1, 2)),   -- con_tpamb
  tipo_emissao smallint,                                             -- con_tpemis
  cert_serie text,                                                   -- con_certserie
  cert_nome text,                                                    -- con_certnome
  cert_url text,                                                     -- con_urlcertificado
  cert_arquivo_cifrado bytea,                                        -- .pfx cifrado (substitui con_certcaminho)
  cert_senha_cifrada bytea,                                          -- con_certsenha
  csc_cifrado bytea,                                                 -- con_csc
  id_csc varchar(10),                                                -- con_idcsc
  csrt_cifrado bytea,                                                -- cai_csrt
  id_csrt integer,                                                   -- cai_idcsrt
  escala_nfe integer,                                                -- cai_escalanfe
  escala_nfce integer,                                               -- cai_escalanfce
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE empresa_email (
  empresa_id uuid PRIMARY KEY REFERENCES empresa(id) ON DELETE CASCADE,
  smtp text,                -- con_emailsmtp
  porta integer,            -- con_emailporta
  seguro boolean,           -- con_emaismtpseguro
  remetente text,           -- con_email
  nome_remetente text,      -- con_emailnome
  assunto text,             -- con_emailassunto
  mensagem text,            -- con_emailmensagem
  copia text,               -- con_emailcopia
  destinatario text,        -- con_emaildest
  senha_cifrada bytea,      -- con_emailsenha
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- caixa
CREATE TABLE caixa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
  codigo integer NOT NULL,                       -- cai_codigo
  nome text,
  ids_externos jsonb NOT NULL DEFAULT '{}',
  -- numeração: série distinta por caixa dentro da empresa
  serie_nfe varchar(6),
  ultimo_numero_nfe integer NOT NULL DEFAULT 0,
  serie_nfce varchar(10),
  ultimo_numero_nfce integer NOT NULL DEFAULT 0,
  -- parâmetros do caixa (impressora, gaveta, balança bal_*, pinpad/TEF pdv_*, comportamento cai_*)
  parametros jsonb NOT NULL DEFAULT '{}',
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, codigo),
  UNIQUE (id, empresa_id)
);
CREATE UNIQUE INDEX caixa_serie_nfe_unica ON caixa (empresa_id, serie_nfe) WHERE serie_nfe IS NOT NULL;
CREATE UNIQUE INDEX caixa_serie_nfce_unica ON caixa (empresa_id, serie_nfce) WHERE serie_nfce IS NOT NULL;

-- Cota de caixas por empresa (aplicada no banco, não só na API)
CREATE FUNCTION hub_checar_cota_caixas() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cota integer; usados integer;
BEGIN
  SELECT cota_caixas INTO cota FROM empresa WHERE id = NEW.empresa_id FOR UPDATE;
  SELECT count(*) INTO usados FROM caixa WHERE empresa_id = NEW.empresa_id AND ativo;
  IF NEW.ativo AND usados >= cota THEN
    RAISE EXCEPTION 'cota de caixas da empresa excedida' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER caixa_cota BEFORE INSERT ON caixa FOR EACH ROW EXECUTE PROCEDURE hub_checar_cota_caixas();

-- ---------------------------------------------------------------- usuários e escopos
CREATE TABLE usuario_hub (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  nome text NOT NULL,
  senha_hash text NOT NULL,                      -- argon2id
  mfa_segredo_cifrado bytea,                     -- TOTP
  mfa_ativo boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now()
);

-- geral: sem empresa/caixa | empresa: empresa_id (várias linhas = multiempresa) | caixa: empresa_id + caixa_id
CREATE TABLE usuario_escopo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES usuario_hub(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('geral', 'empresa', 'caixa')),
  empresa_id uuid REFERENCES empresa(id) ON DELETE CASCADE,
  caixa_id uuid,
  FOREIGN KEY (caixa_id, empresa_id) REFERENCES caixa(id, empresa_id) ON DELETE CASCADE,
  CHECK ((tipo = 'geral'   AND empresa_id IS NULL AND caixa_id IS NULL)
      OR (tipo = 'empresa' AND empresa_id IS NOT NULL AND caixa_id IS NULL)
      OR (tipo = 'caixa'   AND empresa_id IS NOT NULL AND caixa_id IS NOT NULL))
);
CREATE UNIQUE INDEX usuario_escopo_unico
  ON usuario_escopo (usuario_id, tipo, coalesce(empresa_id, '00000000-0000-0000-0000-000000000000'),
                     coalesce(caixa_id, '00000000-0000-0000-0000-000000000000'));

-- ---------------------------------------------------------------- tokens de integração
-- O valor do token nunca é guardado: só o hash SHA-256 (token tem 256 bits de entropia).
CREATE TABLE token_acesso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('empresa', 'caixa')),
  empresa_id uuid NOT NULL REFERENCES empresa(id) ON DELETE CASCADE,
  caixa_id uuid,
  hash bytea NOT NULL UNIQUE,
  prefixo varchar(12) NOT NULL,                  -- só para o admin identificar o token
  descricao text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  expira_em timestamptz,
  revogado_em timestamptz,
  ultimo_uso_em timestamptz,
  FOREIGN KEY (caixa_id, empresa_id) REFERENCES caixa(id, empresa_id) ON DELETE CASCADE,
  CHECK ((tipo = 'empresa' AND caixa_id IS NULL) OR (tipo = 'caixa' AND caixa_id IS NOT NULL))
);

-- Busca do token antes de conhecermos o tenant: só por hash, sem abrir a tabela inteira.
-- Roda como dono da tabela (token_acesso não usa FORCE RLS justamente para isso).
CREATE FUNCTION hub_buscar_token(p_hash bytea)
RETURNS TABLE (id uuid, tipo text, empresa_id uuid, caixa_id uuid, valido boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE token_acesso t SET ultimo_uso_em = now()
   WHERE t.hash = p_hash
  RETURNING t.id, t.tipo, t.empresa_id, t.caixa_id,
            (t.revogado_em IS NULL AND (t.expira_em IS NULL OR t.expira_em > now()))
$$;
REVOKE ALL ON FUNCTION hub_buscar_token(bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION hub_buscar_token(bytea) TO hub_app;

-- ---------------------------------------------------------------- auditoria (append-only)
CREATE TABLE auditoria (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  em timestamptz NOT NULL DEFAULT now(),
  empresa_id uuid,
  ator_tipo text NOT NULL CHECK (ator_tipo IN ('usuario', 'token', 'sistema')),
  ator_id uuid,
  acao text NOT NULL,
  alvo text,
  detalhes jsonb NOT NULL DEFAULT '{}',          -- nunca incluir segredos
  ip inet
);
CREATE INDEX auditoria_empresa_em ON auditoria (empresa_id, em DESC);

-- ---------------------------------------------------------------- RLS
ALTER TABLE empresa          ENABLE ROW LEVEL SECURITY;
ALTER TABLE empresa_fiscal   ENABLE ROW LEVEL SECURITY;
ALTER TABLE empresa_email    ENABLE ROW LEVEL SECURITY;
ALTER TABLE caixa            ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_acesso     ENABLE ROW LEVEL SECURITY;
ALTER TABLE auditoria        ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuario_escopo   ENABLE ROW LEVEL SECURITY;
ALTER TABLE empresa          FORCE ROW LEVEL SECURITY;
ALTER TABLE empresa_fiscal   FORCE ROW LEVEL SECURITY;
ALTER TABLE empresa_email    FORCE ROW LEVEL SECURITY;
ALTER TABLE caixa            FORCE ROW LEVEL SECURITY;
ALTER TABLE auditoria        FORCE ROW LEVEL SECURITY;
ALTER TABLE usuario_escopo   FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant ON empresa
  USING (hub_eh_admin() OR id = hub_empresa_atual())
  WITH CHECK (hub_eh_admin());
CREATE POLICY tenant ON empresa_fiscal
  USING (hub_eh_admin() OR empresa_id = hub_empresa_atual())
  WITH CHECK (hub_eh_admin() OR empresa_id = hub_empresa_atual());
CREATE POLICY tenant ON empresa_email
  USING (hub_eh_admin() OR empresa_id = hub_empresa_atual())
  WITH CHECK (hub_eh_admin() OR empresa_id = hub_empresa_atual());
CREATE POLICY tenant ON caixa
  USING (hub_eh_admin() OR empresa_id = hub_empresa_atual())
  WITH CHECK (hub_eh_admin());
CREATE POLICY tenant ON token_acesso
  USING (hub_eh_admin() OR empresa_id = hub_empresa_atual())
  WITH CHECK (hub_eh_admin());
CREATE POLICY tenant ON usuario_escopo
  USING (hub_eh_admin() OR empresa_id = hub_empresa_atual())
  WITH CHECK (hub_eh_admin());
CREATE POLICY ler ON auditoria FOR SELECT
  USING (hub_eh_admin() OR empresa_id = hub_empresa_atual());
CREATE POLICY gravar ON auditoria FOR INSERT
  WITH CHECK (hub_eh_admin() OR empresa_id IS NOT DISTINCT FROM hub_empresa_atual());

-- ---------------------------------------------------------------- permissões do papel da aplicação
GRANT USAGE ON SCHEMA public TO hub_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON empresa, empresa_fiscal, empresa_email, caixa,
      usuario_hub, usuario_escopo, token_acesso TO hub_app;
GRANT SELECT, INSERT ON auditoria TO hub_app;          -- sem UPDATE/DELETE: trilha imutável
GRANT USAGE ON SEQUENCE hub_versao_seq TO hub_app;
