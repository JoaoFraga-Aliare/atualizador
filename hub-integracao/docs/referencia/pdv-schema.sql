--
-- PostgreSQL database dump
--

\restrict pB47czZzblWTcFuRoZp7iJgt8RhjTz6q725SvUayKIgUk958fdRiCOmdy0nIFH0

-- Dumped from database version 10.4
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: unaccent; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;


--
-- Name: EXTENSION unaccent; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION unaccent IS 'text search dictionary that removes accents';


--
-- Name: f_saldo_em_aberto(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.f_saldo_em_aberto(vite_codigo integer) RETURNS numeric
    LANGUAGE plpgsql
    AS $$ DECLARE   v_qtd DECIMAL(18,2); BEGIN   SELECT COALESCE(SUM(     CASE       WHEN UPPER(nfi_unidade) = 'KG' THEN nfi_psitem       ELSE nfi_qtitem     END   ), 0)   INTO v_qtd   FROM nfscapa   JOIN nfsitem ON nfsitem.nfs_numero = nfscapa.nfs_numero     AND nfsitem.nfs_serie = nfscapa.nfs_serie   WHERE ite_codigo = vite_codigo     AND nfs_exportado <> 'yes'     AND sit_nfelet = '100';   RETURN v_qtd; END; $$;


--
-- Name: f_saldo_lote_em_aberto(integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.f_saldo_lote_em_aberto(vite_codigo integer, vmov_lote text) RETURNS numeric
    LANGUAGE plpgsql
    AS $$ DECLARE   v_qtd DECIMAL(18,3); BEGIN   SELECT COALESCE(SUM(t.q), 0) INTO v_qtd FROM (     SELECT pil.pil_qtd AS q       FROM nfscapa c       JOIN pedidoitemlote pil ON pil.ped_codigo = c.ped_codigo        AND pil.ite_codigo = vite_codigo        AND TRIM(pil.mov_lote) = TRIM(vmov_lote)       JOIN pedidoitem pj ON pj.id_pedidoitem = pil.id_pedidoitem        AND pj.pit_status <> 9      WHERE c.nfs_exportado <> 'yes' AND c.sit_nfelet = '100'     UNION ALL     SELECT CASE WHEN UPPER(i.nfi_unidade) = 'KG' THEN i.nfi_psitem                 ELSE i.nfi_qtitem END       FROM nfscapa c       JOIN nfsitem i ON i.nfs_numero = c.nfs_numero AND i.nfs_serie = c.nfs_serie      WHERE i.ite_codigo = vite_codigo        AND TRIM(i.mov_lote) = TRIM(vmov_lote)        AND c.nfs_exportado <> 'yes' AND c.sit_nfelet = '100'        AND NOT EXISTS (SELECT 1 FROM pedidoitemlote p                         WHERE p.ped_codigo = c.ped_codigo                           AND p.ite_codigo = vite_codigo)   ) t;   RETURN v_qtd; END; $$;


--
-- Name: preocorre(integer, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.preocorre(vite_codigo integer, vpre_tiporeg integer, vpre_ocorrenc integer) RETURNS numeric
    LANGUAGE plpgsql
    AS $$

begin
  return (select precoprodu.pro_preconew[vpre_ocorrenc] from precoprodu where precoprodu.ite_codigo = vite_codigo and precoprodu.pre_tiporeg = vpre_tiporeg);
end;

$$;


--
-- Name: id_afcaixa; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.id_afcaixa
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


SET default_tablespace = '';

--
-- Name: afcaixa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.afcaixa (
    cai_codigo integer,
    afc_seq integer DEFAULT nextval('public.id_afcaixa'::regclass) NOT NULL,
    afc_dtabre date,
    afc_dtfecha date,
    afc_hrabre character varying(15),
    afc_hrfecha character varying(15),
    afc_vlabre numeric(15,2),
    afc_vlfecha numeric(15,2),
    usu_usuario character varying(8)
);


--
-- Name: agbanco; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agbanco (
    emp_empresa integer NOT NULL,
    agp_ctared integer NOT NULL,
    ban_banco integer NOT NULL,
    ban_nome character varying(50),
    ban_agencia integer,
    age_nome character varying(50),
    ban_ccorrente character(15),
    ban_cnpj character(14)
);


--
-- Name: agrosys_scripts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agrosys_scripts (
    scr_versao integer NOT NULL,
    scr_data timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


--
-- Name: bairro; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bairro (
    bai_codigo integer,
    bai_nome character(70),
    cid_cidade integer
);


--
-- Name: bandeira; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bandeira (
    ban_codigo integer NOT NULL,
    ban_descricao character(50),
    ban_sequencia integer
);


--
-- Name: bkp_afcaixa_20261021; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bkp_afcaixa_20261021 (
    cai_codigo integer,
    afc_seq integer,
    afc_dtabre date,
    afc_dtfecha date,
    afc_hrabre character varying(15),
    afc_hrfecha character varying(15),
    afc_vlabre numeric(15,2),
    afc_vlfecha numeric(15,2),
    usu_usuario character varying(8)
);


--
-- Name: bkp_pagmov_fech_20261021; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bkp_pagmov_fech_20261021 (
    id_codigo integer,
    ven_codigo integer,
    cli_codigo integer,
    fin_codigo integer,
    pag_valor numeric(15,2),
    ope_codigo integer,
    pag_data date,
    pag_hora character(10),
    pag_oper character(1),
    usu_usuario character(8),
    afc_seq integer,
    pag_autorizacao character(40),
    pag_bandeira character(20),
    pag_numvezes integer,
    pag_troco numeric(14,2),
    ped_codigo integer,
    pag_ctared character(10),
    pag_cnpj character(15),
    pef_sigla character(18),
    pef_empresa integer,
    pef_filial integer,
    pef_numero integer,
    pef_seq integer,
    pag_temtef boolean
);


--
-- Name: bkp_pedido_20261021; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bkp_pedido_20261021 (
    car_codigo integer,
    ced_seq integer,
    cli_codigo integer,
    cli_entrega integer,
    cli_tabpre integer,
    codformapg integer,
    cpg_condpag character(70),
    emp_empresa integer,
    emp_origem integer,
    mve_codigo integer,
    nae_codcompl integer,
    nat_codigo integer,
    ori_codigo integer,
    pac_sequencia integer,
    ped_ambulante integer,
    ped_analise character(3),
    ped_cargafecha character(3),
    ped_ciffob character(3),
    ped_clicpf character(70),
    ped_codcliamb integer,
    ped_codigo integer,
    ped_codpacx integer,
    ped_codpai integer,
    ped_codrefat numeric(18,2),
    ped_cpf character(70),
    ped_descon numeric(18,2),
    ped_descpro integer,
    ped_drpcod character(70),
    ped_dtembarque date,
    ped_dtlibcre date,
    ped_dtlibven date,
    ped_dtreprog date,
    ped_eancom character(70),
    ped_eanent character(70),
    ped_embarque date,
    ped_emissao date,
    ped_entrega date,
    ped_entrega2 date,
    ped_histori character(70),
    ped_hremi integer,
    ped_hrentrega character(70),
    ped_libcred integer,
    ped_libvend integer,
    ped_locentrega character(70),
    ped_mvecomis integer,
    ped_necpro character(3),
    ped_nomarq character(70),
    ped_nrpaco character(70),
    ped_nrpedori numeric(18,2),
    ped_numint numeric(18,2),
    ped_observ character(200),
    ped_obsger1 character(70),
    ped_operlog integer,
    ped_operpalet integer,
    ped_ordcarr integer,
    ped_ordcomp character(70),
    ped_origem integer,
    ped_oriped character(70),
    ped_pedterc integer,
    ped_percomis numeric(18,2),
    ped_pspallet numeric(18,2),
    ped_qtpacx integer,
    ped_qtpallet integer,
    ped_retcred character(70),
    ped_retvend character(70),
    ped_revisado character(70),
    ped_romterc integer,
    ped_saida date,
    ped_seqcarr integer,
    ped_sipreco integer,
    ped_sitcota integer,
    ped_sitcred integer,
    ped_situac character(70),
    ped_status integer,
    ped_tpanalise integer,
    ped_tpfrete integer,
    ped_tpnf integer,
    ped_ususelrom character(70),
    ped_vldesc numeric(18,2),
    ped_vldespaces numeric(18,2),
    ped_vlfrete numeric(18,2),
    ped_vloutros numeric(18,2),
    ped_vlprevfre numeric(18,2),
    pre_codigo integer,
    pre_tiporeg integer,
    reg_codigo character(70),
    rom_ambulante integer,
    rom_codigo integer,
    rom_origem integer,
    tip_operacao integer,
    tit_setor character(70),
    tpe_codigo integer,
    tpt_codigo integer,
    uni_origem integer,
    uni_unidade integer,
    usu_analise character(70),
    usu_usuario character(70),
    ven_codigo integer,
    ven_pcomiss numeric(18,2),
    ped_obsger2 character(70),
    ped_obsger3 character(70),
    id_pedido integer,
    mot_codigo integer,
    tra_codigo integer,
    nfs_numero integer,
    ped_vendamb character(3),
    nfs_serie character(10),
    cli_tpnfger integer,
    fil_filial integer,
    rvd_codigo integer,
    ped_extvend integer,
    ped_despe numeric(15,2),
    ped_vlsubtot numeric(15,2),
    ped_vltotal numeric(15,2),
    ped_caixafat integer,
    ped_identificacao character(50),
    ped_ocorrencia integer
);


--
-- Name: bkp_venda_20261021; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bkp_venda_20261021 (
    ven_codigo integer,
    usu_usuario character(8),
    emp_empresa integer,
    uni_unidade integer,
    cli_codigo integer,
    ven_dtabre date,
    ven_hrabre character(15),
    ven_dtfecha date,
    ven_hrfecha character(15),
    ven_vldesc numeric(15,2),
    ven_vlvenda numeric(15,2),
    cai_codigo integer,
    ven_vlpagto numeric(15,2),
    ven_obs text,
    ven_status integer,
    ven_vltroco numeric(15,2),
    ven_vltrocosol numeric(15,2),
    ven_desc numeric(15,2),
    cpg_condpag character(10),
    ven_vltotpag numeric(15,2),
    ven_clicpf character(15),
    ven_despe numeric(15,2),
    ven_identificacao character(50),
    rvd_codigo integer,
    ven_ocorrencia integer,
    ven_vlfrete numeric(15,2),
    ope_codigo integer
);


--
-- Name: caixa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.caixa (
    con_razsoc character(70),
    con_cnpj character(15),
    con_inscest character(15),
    con_fantasia character(70),
    con_fone character(15),
    con_cep character(10),
    con_endereco character(70),
    bai_codigo integer,
    cid_cidade integer,
    con_numendereco character(10),
    con_serie character(6),
    con_ultimanota integer,
    con_com character(5),
    con_baud character(8),
    con_stopb character(3),
    con_parity character(15),
    con_flow character(15),
    con_datab character(8),
    con_certcaminho character(200),
    con_certserie character(70),
    con_certsenha character(30),
    con_tpamb integer,
    con_emailsmtp character(30),
    con_email character(35),
    con_emailporta integer,
    con_emailsenha character(20),
    con_emailassunto character(50),
    con_emailnome character(70),
    con_emaismtpseguro character(3),
    con_emailmensagem character(500),
    con_logo character(100),
    con_uf character(2),
    con_bainome character(70),
    con_cidnome character(70),
    con_compendereco character(70),
    con_emailcopia character(500),
    con_emaildest character(70),
    tra_codigo integer,
    tra_cnpj character(15),
    tra_nome character(45),
    tra_inscest character(12),
    tra_endereco character(45),
    cid_tracidade integer,
    cid_ibge integer,
    cid_nome character(45),
    est_estado character(2),
    tra_placa character(8),
    tra_motorista character(45),
    tra_ajudante character(45),
    tra_antt character(20),
    con_tpemis integer,
    con_direpec character(250),
    con_sincurl character(100),
    con_sinclog character(3),
    con_direvento character(250),
    con_dirnfe character(250),
    con_dirpdf character(250),
    obs_vendamb character(1000),
    con_aux character(100),
    con_ambwebs character(3) DEFAULT '1'::bpchar,
    con_csc character(50),
    con_idcsc character(10),
    con_altped character(3) DEFAULT 'no'::bpchar,
    con_impleo character(3) DEFAULT 'no'::bpchar,
    emp_empresa integer NOT NULL,
    cai_codigo integer NOT NULL,
    cai_status integer,
    usu_usuario character(8),
    cai_vlcaixa numeric(15,5),
    cai_dtvlcaixa date,
    cai_hrvlcaixa character(10),
    cai_funtroco numeric(15,5),
    cai_boasvindas character(200),
    cai_consufinal integer,
    cai_pdv boolean,
    cai_balanca boolean DEFAULT false,
    cai_versaodf integer DEFAULT 0,
    cai_impressora character(40),
    cai_loja integer,
    cai_nomeloja character(100),
    con_impressoraaux character(50),
    cai_gaveta character(30),
    cai_versao character(10) DEFAULT 1.0,
    cai_descontos boolean DEFAULT false,
    cai_pcdesclib numeric(15,2),
    cai_capturaps boolean DEFAULT false,
    bal_modelo integer,
    bal_handshake integer,
    bal_parity integer,
    bal_stop integer,
    bal_data integer,
    bal_baud integer,
    bal_porta character(15),
    bal_arqlog character(100),
    bal_timeout integer,
    bal_monitora boolean DEFAULT false,
    con_ultimanfc integer,
    con_serienfc character(10),
    cai_cnpjresp character(14),
    cai_contatoresp character(20),
    cai_emailresp character(50),
    cai_foneresp character(14),
    cai_preocorre boolean DEFAULT false,
    dfv_pcmes numeric(15,2),
    pco_decracr boolean DEFAULT false,
    cai_cpgpadrao character(10) DEFAULT '0002'::bpchar,
    cai_hidebonif boolean DEFAULT false,
    cai_altcliabre boolean DEFAULT false,
    cai_altcpgabre boolean DEFAULT false,
    cai_vendedorpad integer DEFAULT 9,
    cai_tabprepad integer DEFAULT 1,
    uni_unidade integer DEFAULT 1,
    fil_filial integer DEFAULT 1,
    cai_logocli character(100),
    cai_receita boolean DEFAULT false,
    cai_subscreveite boolean DEFAULT false,
    cai_vendecliinat boolean DEFAULT true,
    cai_emsincroniza boolean DEFAULT true,
    cai_integranfaut boolean DEFAULT true,
    cai_qtdigualpeso boolean DEFAULT true,
    cai_comisnovo boolean DEFAULT true,
    id_sessao character(70),
    usu_logado character(50),
    cai_urlsoapvr12 boolean DEFAULT false,
    cai_urlsoap boolean DEFAULT false,
    tip_operacao integer DEFAULT 1,
    cai_obsnf character(2000),
    emp_empresa_hlg integer DEFAULT 51,
    uni_unidade_hlg integer DEFAULT 0,
    fil_filial_hlg integer DEFAULT 0,
    cai_consideralote boolean DEFAULT false,
    cai_qtmult boolean DEFAULT false,
    cai_vlminprazo numeric(15,5),
    cai_acresqtprod boolean DEFAULT false,
    cai_bloestzero boolean DEFAULT false,
    cai_cpg_vista character(30),
    cai_expnfauto boolean DEFAULT true,
    cai_impmodelo integer DEFAULT 2,
    cai_impbaudrate integer DEFAULT 9600,
    cai_reimprime boolean DEFAULT false,
    cai_cpfconsum boolean DEFAULT false,
    cai_excicmsbasepis boolean DEFAULT false,
    cai_excicmsbasecof boolean DEFAULT false,
    con_nfce boolean,
    con_atucliaut boolean,
    con_atuall boolean,
    con_temint integer,
    con_atuxmlass boolean,
    con_impcompvenda boolean,
    con_mosrestricao boolean,
    con_bloqlimcred boolean,
    cai_desccomercial boolean DEFAULT false,
    cai_condpagpadrao character(70),
    cai_tempoimpress integer DEFAULT 0,
    cc boolean DEFAULT false,
    cai_icmspordentro boolean DEFAULT false,
    con_compaprazo boolean DEFAULT false,
    con_reimpcompvenda boolean DEFAULT false,
    cai_contingencia boolean DEFAULT false NOT NULL,
    bal_cargamod integer,
    pdv_tpemisnfe character(50),
    pdv_tpemisnfce character(50),
    pdv_cfopporunidade boolean DEFAULT true,
    pdv_reimpressaonota boolean DEFAULT false,
    pdv_alterarqtd boolean DEFAULT false,
    pdv_exibepeso boolean DEFAULT false,
    pdv_seqtransacao integer DEFAULT 0,
    cai_controleoper boolean DEFAULT false,
    cai_horario time without time zone,
    cai_exclusivo boolean DEFAULT false,
    bal_tolerancia numeric(15,4) DEFAULT 0 NOT NULL,
    cai_limitesan numeric(15,2),
    cai_alertasan numeric(15,2),
    cai_usapinpad boolean DEFAULT false,
    cai_portapinpad character(15),
    cai_exibeqrcode integer,
    cai_ttpendentende integer,
    cai_ttinicializacao integer,
    cai_ttinicia integer,
    cai_viacliente integer,
    con_certnome character varying(100),
    con_urlcertificado character varying(100),
    pdv_integranova boolean DEFAULT true,
    pdv_modelopinpad integer,
    pdv_viareduzida boolean,
    pdv_transautomatica boolean,
    pdv_convfunc boolean DEFAULT false,
    pdv_usasaldovoucher boolean DEFAULT false,
    pdv_sincrononfe boolean DEFAULT true,
    pdv_sincrononfce boolean DEFAULT true,
    pdv_contapadrao integer,
    pdv_prevolume boolean DEFAULT false,
    pdv_prepromo boolean DEFAULT false,
    pdv_loginws boolean DEFAULT false,
    pdv_codemptef character(20),
    pdv_codfiltef character(20),
    pdv_codtertef character(20),
    pdv_servidortef character(100),
    pdv_desabpinpad boolean,
    cai_diavinf integer DEFAULT 24,
    cai_avisofuncionario boolean,
    cai_csrt character(50),
    cai_idcsrt integer,
    cai_escalanfe integer,
    cai_escalanfce integer,
    cai_telacriavenda boolean DEFAULT false,
    cai_consufinal2 integer,
    cai_soatendimento boolean,
    pdv_exportapedido boolean DEFAULT false,
    pdv_linhasavanco integer,
    cai_fatsimples boolean,
    cai_imprimevend boolean,
    cai_funruralsenar boolean,
    cai_funruralpadrao numeric(15,2),
    cai_senarpadrao numeric(15,2),
    cai_datacont date,
    cai_motivocont character(100),
    cai_balapenaskg boolean DEFAULT true,
    cai_tolerancia numeric(15,2),
    cai_preduf numeric(13,3),
    cai_predum numeric(13,3),
    cai_predue numeric(13,3),
    cai_dtinivigencia date DEFAULT '2026-06-01'::date,
    cai_dtinitotal date DEFAULT '2026-06-01'::date,
    cai_dtinientegov date DEFAULT '2026-06-01'::date,
    cai_dtfimentegov date DEFAULT '2026-06-01'::date,
    cai_parcelamento boolean DEFAULT true,
    cai_timeout integer DEFAULT 30000,
    cai_casasdecpeso integer DEFAULT 2,
    cai_logs boolean,
    cai_sugereusu boolean DEFAULT false,
    cai_frete boolean DEFAULT false,
    ean_utiliza boolean DEFAULT false,
    ean_codificacao character(13),
    cai_perguntafat boolean DEFAULT false,
    cai_novabuscaimp boolean DEFAULT false,
    cai_defltipocalc integer,
    cai_deflhierarquia integer,
    cai_imppedido boolean DEFAULT false,
    cai_minexpnf integer DEFAULT 30,
    cai_saldomin numeric(15,3) DEFAULT 0,
    cai_saldointervalo integer DEFAULT 30,
    cai_acrescmax numeric(15,2) DEFAULT 0,
    pdv_sincsangriasup boolean DEFAULT false,
    emp_empresa_cx integer DEFAULT 0,
    fil_filial_cx integer DEFAULT 0,
    uni_unidade_cx integer DEFAULT 0
);


--
-- Name: cheques; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cheques (
    age_agencia integer,
    ban_banco integer,
    ccorrente_emp character(20),
    chq_bompara date,
    chq_dtconcil date,
    chq_dtsist date,
    chq_hora character(20),
    chq_numtit integer,
    chq_obs character(200),
    chq_parcela integer,
    chq_status integer,
    chq_tpconcil integer,
    dtdeb date,
    dtemissao date,
    emp_empresa integer,
    nominal character(150),
    numcheque integer,
    serie character(10),
    usu_usuario character(10),
    valor numeric(18,2),
    ped_codigo integer
);


--
-- Name: cidade; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cidade (
    cid_cidade integer NOT NULL,
    cid_codsicred integer,
    cid_gta integer,
    cid_ibge integer,
    cid_nome character(70),
    cid_sif character(70),
    cid_sifporto character(70),
    codmicroreg integer,
    codmunicipio integer,
    codregfis integer,
    empvenda integer,
    est_estado character(5),
    pai_pais integer,
    populacao integer,
    qtrevendas integer,
    recsta character(70),
    univenda integer
);


--
-- Name: cimarca; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cimarca (
    mar_codigo integer NOT NULL,
    mar_descricao character(70)
);


--
-- Name: clifor; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clifor (
    bai_codigo integer,
    ban_cod integer,
    ccu_ccusto integer,
    cid_cidade integer,
    cli_apldesfin integer,
    cli_bairro character(70),
    cli_bloimpr character(3),
    cli_cep character(70),
    cli_cgc character(70),
    cli_codean character(70),
    cli_codfax character(70),
    cli_codigo integer NOT NULL,
    cli_codigopai integer,
    cli_codint character(70),
    cli_codmat integer,
    cli_codprop integer,
    cli_codrelac integer,
    cli_cpf character(70),
    cli_crt integer,
    cli_crticm integer,
    cli_csosn integer,
    cli_ctricm character(3),
    cli_cxpost character(70),
    cli_descfin numeric(18,2),
    cli_email character(300),
    cli_enqfisc integer,
    cli_fantasi character(150),
    cli_fisjur character(3),
    cli_fone1 character(70),
    cli_fone2 character(70),
    cli_fundac date,
    cli_iniativ date,
    cli_inscest character(70),
    cli_inscmuni character(70),
    cli_iso character(70),
    cli_iva character(3),
    cli_mailfisc character(70),
    cli_mailnf character(70),
    cli_motinativ character(70),
    cli_nacest character(3),
    cli_nfe character(3),
    cli_pcdescoop numeric(18,2),
    cli_pcfunrur numeric(18,2),
    cli_pcsenar numeric(18,2),
    cli_percfre numeric(18,2),
    cli_ptref character(70),
    cli_radcgc character(70),
    cli_razsoc character(150),
    cli_seqentre integer,
    cli_sif integer,
    cli_sitcli character(3),
    cli_suframa character(30),
    cli_titiva integer,
    cli_txt1 character(70),
    cli_txt2 character(70),
    cli_txt3 character(70),
    cli_txt4 character(70),
    cli_txt5 character(70),
    cli_unitpr integer,
    cna_codigo character(70),
    codfisc integer,
    con_conta integer,
    emp_empresa integer,
    est_estado character(70),
    grf_codigo integer,
    lgr_codigo character(70),
    loc_global character(70),
    cli_numero character(70),
    pai_pais integer,
    ram_codigo integer,
    recsta character(70),
    tcl_codigo integer,
    tcu_codigo integer,
    uni_unidade integer,
    cli_import character(3),
    tip_nota integer,
    cli_tpnfger integer,
    cli_aplicast boolean DEFAULT false,
    cli_consfinal boolean DEFAULT false,
    cli_atraso boolean DEFAULT false,
    rvd_codigo integer DEFAULT 0,
    hlc_vllimlib numeric(14,0) DEFAULT 0,
    fun_funcionario integer DEFAULT 0,
    cli_restricao character(150),
    cli_nrmaxdias integer,
    val_limcred numeric(18,2),
    val_liberado numeric(18,2),
    val_titaberto numeric(18,2),
    val_pedaberto numeric(18,2),
    cli_rede boolean DEFAULT false,
    fun_admissao date,
    cli_endere character(500),
    cli_tpentegov integer,
    cli_vlcredito numeric(15,2),
    for_subgrcxa integer,
    for_grupflcx integer,
    for_simples boolean,
    for_tipo text
);


--
-- Name: COLUMN clifor.tip_nota; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.clifor.tip_nota IS '1 - (NFs) - Danfe
2 - NFc
3 - NFc sem CPF';


--
-- Name: comcrit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comcrit (
    cct_codrelac integer,
    cct_criterio integer,
    cct_dtultatu date,
    cct_dtvig date,
    cct_fxfim numeric(18,2),
    cct_fxini numeric(18,2),
    cct_hrultatu integer,
    cct_nrtab integer,
    cct_perc numeric(18,2),
    cct_tpcodrelac character(30),
    emp_empresa integer,
    fil_filial integer,
    rvd_codigo integer,
    usu_usuario character(10),
    ven_codigo integer
);


--
-- Name: condpagto; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.condpagto (
    cli_tabpre integer,
    cpd_seq integer,
    cpg_carrecol character(3),
    cpg_codrelac character(70),
    cpg_condpag character(70) NOT NULL,
    cpg_ctacor character(3),
    cpg_deflator character(3),
    cpg_descricao character(70),
    cpg_nrdias integer,
    cpg_nrparcelas integer,
    cpg_pcdescon numeric(18,2),
    cpg_pdv character(3),
    cpg_percentual numeric(18,2),
    cpg_situac character(3),
    cpg_titulo character(3),
    cpg_tpcond integer,
    emp_empresa integer,
    tpd_tpdocmto character(70),
    cpg_avista boolean,
    cpg_media numeric(15,4),
    cpg_antecipado boolean,
    cpg_validadias boolean,
    cli_nrmaxdias integer
);


--
-- Name: condpagto2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.condpagto2 (
    cli_tabpre integer,
    cpd_seq integer,
    cpg_carrecol character(3),
    cpg_codrelac character(70),
    cpg_condpag character(70),
    cpg_ctacor character(3),
    cpg_deflator character(3),
    cpg_descricao character(70),
    cpg_nrdias integer,
    cpg_nrparcelas integer,
    cpg_pcdescon numeric(18,2),
    cpg_pdv character(3),
    cpg_percentual numeric(18,2),
    cpg_situac character(3),
    cpg_titulo character(3),
    cpg_tpcond integer,
    emp_empresa integer,
    tpd_tpdocmto character(70),
    cpg_avista boolean,
    cpg_media numeric(15,4),
    cpg_antecipado boolean,
    cpg_validadias boolean,
    cli_nrmaxdias integer
);


--
-- Name: credencia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.credencia (
    cre_codigo integer NOT NULL,
    cre_seq integer,
    cre_descricao character(70),
    cre_ativo boolean DEFAULT false,
    pag_ctared character(10),
    cre_bandeira integer,
    cre_cnpj character(15)
);


--
-- Name: credor; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.credor (
    cre_codigo integer,
    cre_tipo character varying(10),
    cre_nome text,
    cre_doc text
);


--
-- Name: estado; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.estado (
    est_cod integer,
    est_difaliq numeric(18,2),
    est_estado character(70) NOT NULL,
    est_icmsext numeric(18,2),
    est_icmsint numeric(18,2),
    est_nome character(70),
    est_sif character(70),
    pai_pais integer,
    recsta character(70)
);


--
-- Name: excecimp; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.excecimp (
    emp_empresa integer NOT NULL,
    uni_unidade integer NOT NULL,
    ite_codigo integer NOT NULL,
    exc_sigla character(30) NOT NULL,
    exc_chave character(30),
    exc_valor1 numeric(18,2),
    exc_descricao1 character(25),
    exc_valor2 numeric(18,2),
    exc_descricao2 character(25),
    exc_valor3 numeric(18,2),
    exc_descricao3 character(25),
    exc_valor4 numeric(18,2),
    exc_descricao4 character(25),
    exc_valor5 numeric(18,2),
    exc_descricao5 character(25),
    exc_valor6 numeric(18,2),
    exc_descricao6 character(25),
    exc_valor7 numeric(18,2),
    exc_descricao7 character(25),
    exc_valor8 numeric(18,2),
    exc_descricao8 character(25),
    exc_valor9 numeric(18,2),
    exc_descricao9 character(25),
    exc_valor10 numeric(18,2),
    exc_descricao10 character(25)
);


--
-- Name: facliuni; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.facliuni (
    agp_ctaredport integer,
    are_codigo integer,
    cli_codigo integer NOT NULL,
    cli_descfin numeric(18,2),
    cli_fatmul character(3),
    cli_negaport integer,
    cli_nrmaxdias integer,
    cli_nrrota integer,
    cli_obriportad integer,
    cli_tabpre integer,
    cpg_condpag character(70),
    emp_empresa integer,
    fil_filial integer,
    gpp_rota character(70),
    nae_codcompl integer,
    nat_codigo integer,
    ped_descon numeric(18,2),
    por_codigo integer,
    pre_tiporeg integer,
    rea_codigo integer,
    reg_codigo character(70),
    rot_codigo character(70),
    tpd_tpdocmto character(70),
    tpp_tpportad integer,
    uni_unidade integer,
    tip_nota integer DEFAULT 1,
    tit_vlsaldodev numeric(15,2) DEFAULT 0,
    cli_limcred numeric(15,2) DEFAULT 0,
    tit_atraso boolean DEFAULT false,
    tit_vlsalatraso numeric(15,2) DEFAULT 0,
    obs_codigo integer
);


--
-- Name: COLUMN facliuni.tip_nota; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.facliuni.tip_nota IS '1 - (NFs) - Danfe
2 - NFc
3 - NFc sem CPF';


--
-- Name: finalizadora; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.finalizadora (
    fin_codigo integer NOT NULL,
    fin_descricao character varying(40),
    fin_especie character varying(40),
    fin_ativa boolean,
    fin_sistema boolean,
    fin_operacao character varying(15),
    fin_acbr integer,
    fin_bandeira character varying(15),
    fin_codigocanc integer,
    fin_seqimp integer DEFAULT 0
);


--
-- Name: COLUMN finalizadora.fin_especie; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.finalizadora.fin_especie IS 'CARTAO
DINHEIRO
CHEQUE
CONVENIO';


--
-- Name: formapag; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.formapag (
    abrev character(70),
    codformapg integer NOT NULL,
    descricao character(70),
    fpgdifer integer,
    uso character(3)
);


--
-- Name: ftmotora; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ftmotora (
    bai_codigo integer,
    cid_cidade integer,
    cli_cpf character(70),
    fun_funcionario integer,
    lgr_codigo character(70),
    mot_carteira integer,
    mot_categoria character(70),
    mot_cep character(70),
    mot_codigo integer NOT NULL,
    mot_comissao character(3),
    mot_dtexpede date,
    mot_dtnascim date,
    mot_dtrenovacao date,
    mot_endereco character(70),
    mot_fone character(70),
    mot_nome character(70),
    mot_passaporte character(70),
    mot_proximoa character(70),
    mot_tipo character(3),
    mot_tpcarga integer,
    mot_tpfunc integer,
    mot_valpassaporte date,
    usu_usuario character(70),
    vei_proprio character(3)
);


--
-- Name: id_hiscaixa; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.id_hiscaixa
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hiscaixa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hiscaixa (
    cai_codigo integer,
    his_dtmov date,
    his_hrmov character(15),
    usu_usuario character(15),
    his_vlant numeric(15,5),
    his_vlatual numeric(15,5),
    his_codigo integer DEFAULT nextval('public.id_hiscaixa'::regclass) NOT NULL,
    his_host character(15),
    his_status integer,
    his_operacao character(15),
    his_vlmov numeric(15,2),
    his_obs text,
    ven_codigo integer,
    afc_seq integer,
    his_integrado boolean,
    his_tipomov integer,
    cre_tipo integer,
    cre_codigo integer,
    agp_ctared integer
);


--
-- Name: COLUMN hiscaixa.his_dtmov; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.hiscaixa.his_dtmov IS '
';


--
-- Name: COLUMN hiscaixa.his_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.hiscaixa.his_status IS '1 - Aberto
2 - Fechado
9 - Cancelado';


--
-- Name: id_hisnfe; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.id_hisnfe
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hisnfe; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hisnfe (
    chnfe character(70),
    cstat integer,
    cuf integer,
    dhrecbto character(70),
    digval character(70),
    dtemiss date,
    emp_empresa integer,
    fil_filial integer,
    his_codigo integer NOT NULL,
    idlote numeric(18,2),
    nfc_numint numeric(18,2),
    numero integer NOT NULL,
    old_xml character(70),
    serie character(70) NOT NULL,
    sit_nfelet character(70),
    versao integer,
    xdetalhe character(255),
    xml text,
    xmotivo character(255),
    xserv character(70),
    id_hisnfe integer DEFAULT nextval('public.id_hisnfe'::regclass) NOT NULL,
    nrec character(40),
    nprot character(50)
);


--
-- Name: hisped; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hisped (
    ped_codigo integer NOT NULL,
    ite_codigo integer,
    hip_seq integer,
    hip_descr text,
    pit_vldesc numeric(15,2),
    pit_qtatendi integer,
    pit_psatendi numeric(15,3),
    hip_dthis date DEFAULT (CURRENT_TIMESTAMP)::date,
    hip_hrhis time without time zone DEFAULT (CURRENT_TIMESTAMP)::time without time zone,
    usu_usuario character varying(8),
    usu_usulib character varying(8)
);


--
-- Name: id_nfsitem; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.id_nfsitem
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: id_pagmov; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.id_pagmov
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: id_pedido; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.id_pedido
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: id_pedidoitem; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.id_pedidoitem
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: imposto; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.imposto (
    chr_reserva3 character(70),
    chr_reserva4 character(70),
    chr_reserva5 character(70),
    cli_codigo integer,
    dec_reserva2 numeric(18,2),
    dec_reserva3 numeric(18,2),
    dec_reserva4 numeric(18,2),
    dec_reserva5 numeric(18,2),
    emp_empresa integer,
    est_destino character(5),
    est_origem character(5),
    fil_filial integer,
    for_tipo character(50),
    gru_codigo integer,
    imp_acresc numeric(18,2),
    imp_cbenef text,
    imp_cenq_ipi integer,
    imp_codigo integer NOT NULL,
    imp_contrib boolean,
    imp_ctricm integer,
    imp_dtfvig date,
    imp_dtincl date,
    imp_dtivig date,
    imp_hora integer,
    imp_ncm integer,
    imp_observacao character(70),
    imp_pcaliq numeric(18,5),
    imp_pcdifparcicms numeric(18,5),
    imp_pcfecoep numeric(18,2),
    imp_reducao numeric(18,5),
    imp_retencao boolean,
    imp_tpagente character(70),
    imp_tributa integer,
    imp_triicm integer,
    imp_vldeducao numeric(18,2),
    imp_vlfxfin numeric(18,2),
    imp_vlfxini numeric(18,2),
    int_reserva2 integer,
    int_reserva3 integer,
    int_reserva4 integer,
    int_reserva5 integer,
    ite_codigo integer,
    log_reserva1 boolean,
    log_reserva2 boolean,
    log_reserva3 boolean,
    log_reserva4 boolean,
    nae_codcompl integer,
    nat_codigo integer NOT NULL,
    obs_codigo integer,
    opn_operacao character(30),
    tbi_codigo integer NOT NULL,
    tip_codigo integer,
    usu_usuario character(10),
    imp_cbenef1 text,
    imp_cbenef2 text,
    imp_cbenef3 text,
    imp_cbenef4 text,
    imp_cbenef5 text,
    imp_cbenef6 text,
    imp_cbenef7 text,
    imp_cbenef8 text,
    imp_cbenef9 text,
    imp_cbenef10 text,
    imp_cclasstrib integer,
    imp_tipocalc character(8),
    imp_medida character(8),
    imp_valaliq numeric(13,2),
    imp_predaliq numeric(15,3),
    ind_gibscbs integer,
    ind_gdif integer,
    imp_pcredpres numeric(15,3),
    imp_ccredpres integer,
    imp_credpressus boolean,
    imp_codregular integer,
    imp_regpcaliq numeric(18,5),
    imp_regtriicm integer,
    imp_regcclasstrib integer,
    ite_cest integer,
    ccu_custo integer
);


--
-- Name: impostoOLD; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."impostoOLD" (
    chr_reserva3 character(70),
    chr_reserva4 character(70),
    chr_reserva5 character(70),
    cli_codigo integer,
    dec_reserva2 numeric(18,2),
    dec_reserva3 numeric(18,2),
    dec_reserva4 numeric(18,2),
    dec_reserva5 numeric(18,2),
    emp_empresa integer,
    est_destino character(5),
    est_origem character(5),
    fil_filial integer,
    for_tipo character(70),
    gru_codigo integer,
    imp_acresc numeric(18,2),
    imp_codigo integer NOT NULL,
    imp_ctricm integer,
    imp_dtfvig date,
    imp_dtincl date,
    imp_dtivig date,
    imp_hora integer,
    imp_ncm integer,
    imp_observacao character(70),
    imp_pcaliq numeric(18,5),
    imp_reducao numeric(18,5),
    imp_retencao character(3),
    imp_tpagente character(70),
    imp_tributa integer,
    imp_triicm integer,
    imp_vldeducao numeric(18,2),
    imp_vlfxfin numeric(18,2),
    imp_vlfxini numeric(18,2),
    int_reserva2 integer,
    int_reserva3 integer,
    int_reserva4 integer,
    int_reserva5 integer,
    ite_codigo integer,
    log_reserva1 character(3),
    log_reserva2 character(3),
    log_reserva3 character(3),
    log_reserva4 character(3),
    nae_codcompl integer,
    nat_codigo integer,
    obs_codigo integer,
    opn_operacao character(70),
    tbi_codigo integer NOT NULL,
    tip_codigo integer,
    usu_usuario character(10),
    obs_nf1 character(200),
    obs_nf2 character(200),
    obs_nf3 character(200),
    obs_nf4 character(200),
    obs_nf5 character(200),
    obs_nf6 character(200),
    imp_contrib boolean DEFAULT false,
    imp_pcdifparcicms numeric(18,5)
);


--
-- Name: lprecond; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lprecond (
    cli_tabpre integer,
    cpg_condpag character(70),
    emp_empresa integer,
    pre_tiporeg integer,
    uni_unidade integer
);


--
-- Name: natoperacao; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.natoperacao (
    nat_ativa boolean,
    nat_codigo integer,
    nat_codoperfisc integer,
    nat_descrnatope character(150),
    nat_descroperfisc character(200),
    nat_devcli boolean,
    nat_operacao character(200),
    nat_tipo boolean,
    nat_tpdev integer,
    not_contrato boolean,
    not_modestsup boolean,
    obs_codigo integer
);


--
-- Name: nfexml; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nfexml (
    nfc_numint numeric(18,2),
    xml_dtatual date,
    xml_procnfe xml
);


--
-- Name: nfs_correcao_; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nfs_correcao_ (
    total numeric,
    nfs_vltotnf numeric(18,5),
    nfs_numero integer,
    ped_codigo integer
);


--
-- Name: nfscapa; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nfscapa (
    arm_codigo integer,
    car_codigo integer,
    ced_seq integer,
    ced_tpender integer,
    cfp_codigo integer,
    cfr_numero numeric(18,5),
    chnfe character(70),
    cid_ciddes integer,
    cli_codigo integer,
    cli_codigo_inte integer,
    cpg_condpag character(70),
    ctr_numero numeric(18,5),
    dar_numero numeric(18,5),
    eas_codigo integer,
    emb_cod integer,
    emp_empresa integer,
    emp_pesagem integer,
    env_cod integer,
    fil_filial integer,
    gpp_codigo character(70),
    ind_codigo integer,
    isb_iesb character(70),
    mdf_numero integer,
    mes_docto integer,
    mve_codigo integer,
    nae_codcompl integer,
    nat_codigo integer,
    nfc_numint numeric(18,5),
    nfc_numint_ori integer,
    nfe_numero integer,
    nfe_numint numeric(18,5),
    nfe_serie character(10),
    nfe_tiponf integer,
    nfs_alifre numeric(18,5),
    nfs_aproxtrib numeric(18,5),
    nfs_canhoto character(3),
    nfs_cef integer,
    nfs_cfps character(70),
    nfs_clicpf character(70),
    nfs_cmdt integer,
    nfs_cte integer,
    nfs_cupom integer,
    nfs_digcanhoto date,
    nfs_dtacerto date,
    nfs_dtemissao date,
    nfs_dtentrega date,
    nfs_dtimpres date,
    nfs_dtsaida date,
    nfs_dtvencto date,
    nfs_encerrada character(3),
    nfs_envmail character(70),
    nfs_especie character(70),
    nfs_finalidade integer,
    nfs_frenaofisc numeric(18,5),
    nfs_hrdigcanhoto character(70),
    nfs_hremis character(70),
    nfs_hrentrega integer,
    nfs_hrimpres integer,
    nfs_hrsaida character(70),
    nfs_impressa character(3),
    nfs_indcont character(3),
    nfs_indden character(3) DEFAULT 'no'::bpchar,
    nfs_indinut character(3) DEFAULT 'no'::bpchar,
    nfs_indpres integer,
    nfs_loterm character(70),
    nfs_marca character(70),
    nfs_margordcar character(3),
    nfs_modelo character(5) DEFAULT '00'::bpchar,
    nfs_modesto character(3),
    nfs_modori integer,
    nfs_motcancel character(70),
    nfs_motora character(70),
    nfs_nforinumint numeric(18,5),
    nfs_nmalenfe integer,
    nfs_nrctr numeric(18,5),
    nfs_nrparcela integer,
    nfs_nsu numeric(18,5),
    nfs_numero integer NOT NULL,
    nfs_numlacre character(70),
    nfs_numpdv integer,
    nfs_obscod integer,
    nfs_obsfisc character(70),
    nfs_origem integer,
    nfs_pccrepre numeric(18,5),
    nfs_pcctrdesc numeric(18,5),
    nfs_pcdesc numeric(18,5),
    nfs_pcfunrural numeric(18,5),
    nfs_pcratfun numeric(18,5),
    nfs_pcsenar numeric(18,5),
    nfs_placam character(10),
    nfs_placar character(10),
    nfs_placaux character(70),
    nfs_plaufm character(5),
    nfs_plaufr character(5),
    nfs_progra character(15),
    nfs_protcont character(70),
    nfs_psbruto numeric(18,5),
    nfs_psliqui numeric(18,5),
    nfs_qtvolumes numeric(18,5),
    nfs_refat integer,
    nfs_refchave character(70),
    nfs_refdtemis date,
    nfs_refmodelo character(70),
    nfs_refnota integer,
    nfs_refserie character(70),
    nfs_selo integer,
    nfs_serie character(10) NOT NULL,
    nfs_serorigem character(70),
    nfs_sped integer,
    nfs_status integer,
    nfs_tiponf integer,
    nfs_tpemiscte integer,
    nfs_tpemisnfe integer,
    nfs_tpfrete integer,
    nfs_tprod integer,
    nfs_transito integer,
    nfs_ufaux character(70),
    nfs_usuario character(15),
    nfs_usuario_canhoto character(70),
    nfs_vlbasecofins numeric(18,5),
    nfs_vlbasecsll numeric(18,5),
    nfs_vlbasecsocial numeric(18,5),
    nfs_vlbaseicm numeric(18,5),
    nfs_vlbaseinss numeric(18,5),
    nfs_vlbaseipi numeric(18,5),
    nfs_vlbaseir numeric(18,5),
    nfs_vlbaseissqn numeric(18,5),
    nfs_vlbaseiva numeric(18,5),
    nfs_vlbasepis numeric(18,5),
    nfs_vlbasfre numeric(18,5),
    nfs_vlbasicmsu numeric(18,5),
    nfs_vlcapital numeric(18,5),
    nfs_vlcmv numeric(18,5),
    nfs_vlcofins numeric(18,5),
    nfs_vlcomissao numeric(18,5),
    nfs_vlcredpresum numeric(18,5),
    nfs_vlcsll numeric(18,5),
    nfs_vlcsocial numeric(18,5),
    nfs_vlctrdesc numeric(18,5),
    nfs_vldesc numeric(18,5),
    nfs_vldesclegal numeric(18,5),
    nfs_vldesonera numeric(18,5),
    nfs_vldespacess numeric(18,5),
    nfs_vldifericm numeric(18,5),
    nfs_vlfcgr numeric(18,5),
    nfs_vlfreobs numeric(18,5),
    nfs_vlfrete numeric(18,5),
    nfs_vlfunrural numeric(18,5),
    nfs_vlicm numeric(18,5),
    nfs_vlicmisento numeric(18,5),
    nfs_vlicmoutras numeric(18,5),
    nfs_vlicmsu numeric(18,5),
    nfs_vlinss numeric(18,5),
    nfs_vlipi numeric(18,5),
    nfs_vlirr numeric(18,5),
    nfs_vliss numeric(18,5),
    nfs_vlissqn numeric(18,5),
    nfs_vliva numeric(18,5),
    nfs_vlmerca numeric(18,5),
    nfs_vlpis numeric(18,5),
    nfs_vlratfun numeric(18,5),
    nfs_vlrca numeric(18,5),
    nfs_vlricmfre numeric(18,5),
    nfs_vlseguro numeric(18,5),
    nfs_vlsenar numeric(18,5),
    nfs_vlservicos numeric(18,5),
    nfs_vlstbasctb numeric(18,5),
    nfs_vlstctb numeric(18,5),
    nfs_vltotcusto numeric(18,5),
    nfs_vltotnf numeric(18,5),
    nrs_serie character(70),
    ord_nrordser integer,
    pag_numero integer,
    ped_codigo integer,
    prr_contrato character(70),
    reg_codigo character(70),
    rom_codigo integer,
    rom_tptrans character(70),
    sit_nfelet character(70),
    sitint character(70),
    tit_setor character(70),
    tpe_codigo integer,
    tpn_codigo integer,
    tpt_codigo integer,
    tra_codigo integer,
    uni_cpf character(70),
    uni_pesagem integer,
    uni_unidade integer,
    ven_codigo integer,
    xml text,
    nfs_exportado character(10) DEFAULT 'no'::bpchar,
    nfs_observa character varying(1000),
    ped_vendamb character(3) DEFAULT 'no'::bpchar,
    ped_origem integer,
    nfs_versaoapl character(10),
    ped_numero integer,
    cli_tpnfger integer,
    ven_venda integer,
    nfs_despe numeric(15,2),
    nfs_devolvida boolean,
    nfs_cmunfgibs integer,
    nfs_tpnfdebito integer,
    nfs_tpnfcredito integer,
    nfs_tpentegov integer,
    nfs_predutor numeric(11,3),
    nfs_vis numeric(13,2),
    nfs_vbcibscbs numeric(13,2),
    nfs_ibsevdif numeric(13,2),
    nfs_ibsevdevtrib numeric(13,2),
    nfs_ibsevalor numeric(13,2),
    nfs_ibsmvdif numeric(13,2),
    nfs_ibsmvdevtrib numeric(13,2),
    nfs_ibsmvalor numeric(13,2),
    nfs_ibsvalor numeric(13,2),
    nfs_ibsvcredpres numeric(13,2),
    nfs_ibsvcredprescondsus numeric(13,2),
    nfs_cbsvdif numeric(13,2),
    nfs_cbsvdevtrib numeric(13,2),
    nfs_cbsvalor numeric(13,2),
    nfs_cbsvcredpres numeric(13,2),
    nfs_cbsvcredprescondsus numeric(13,2),
    nfs_ibsvmono numeric(13,2),
    nfs_cbsvmono numeric(13,2),
    nfs_ibsvmonoreten numeric(13,2),
    nfs_cbsvmonoreten numeric(13,2),
    nfs_ibsvmonoretido numeric(13,2),
    nfs_cbsvmonoretido numeric(13,2),
    nfs_vnftot numeric(13,2),
    nfs_tpopergov integer,
    nfs_iddest integer,
    nfs_indfinal integer,
    nfs_indiedest integer,
    cli_retirada integer,
    cli_entrega integer,
    wor_agrupado character(15),
    wor_tipo character(15),
    wor_agrupador numeric(13,2),
    tip_operacao integer,
    nfs_vlretirrf numeric(13,2),
    nfs_vlretinss numeric(13,2)
);


--
-- Name: nfsitem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nfsitem (
    emb_cod integer,
    emb_sequen integer,
    emp_empresa integer,
    fil_filial integer,
    for_codigo integer,
    ite_codigo integer NOT NULL,
    ite_seqalt integer,
    nae_codcompl integer,
    nat_codigo integer,
    nfe_numero integer,
    nfe_serie character(70),
    nfi_alicofins numeric(18,5),
    nfi_alicsll numeric(18,5),
    nfi_alicsocial numeric(18,5),
    nfi_aliicm numeric(18,5),
    nfi_aliicmsu numeric(18,5),
    nfi_aliinss numeric(18,5),
    nfi_aliipi numeric(18,5),
    nfi_aliirr numeric(18,5),
    nfi_aliissqn numeric(18,5),
    nfi_aliiva numeric(18,5),
    nfi_alipis numeric(18,5),
    nfi_alistctb numeric(18,5),
    nfi_aproxaliq numeric(18,5),
    nfi_aproxtrib numeric(18,5),
    nfi_basered numeric(18,5),
    nfi_baseredcofins numeric(18,5),
    nfi_baseredcsll numeric(18,5),
    nfi_baseredcsocial numeric(18,5),
    nfi_baseredinss numeric(18,5),
    nfi_baseredir numeric(18,5),
    nfi_baseredissqn numeric(18,5),
    nfi_baserediva numeric(18,5),
    nfi_baseredpis numeric(18,5),
    nfi_cfps character(70),
    nfi_codretencofins integer,
    nfi_codretencsll integer,
    nfi_codreteninss integer,
    nfi_codretenir integer,
    nfi_codretenissqn integer,
    nfi_codretenpis integer,
    nfi_ctissqn character(70),
    nfi_descritem character(70),
    nfi_fci character(70),
    nfi_fprunit numeric(18,5),
    nfi_fpsitem numeric(18,5),
    nfi_fqtd numeric(18,5),
    nfi_frenaofisc numeric(18,5),
    nfi_fumed character(70),
    nfi_fvlitem numeric(18,5),
    nfi_lotefab character(70),
    nfi_lredbcst numeric(18,5),
    nfi_modbc integer,
    nfi_modbcsub integer,
    nfi_motdesonera integer,
    nfi_movest character(3),
    nfi_nritem integer NOT NULL,
    nfi_pccomissao numeric(18,5),
    nfi_pcdesc numeric(18,5),
    nfi_pcimport numeric(18,5),
    nfi_pmvast numeric(18,5),
    nfi_prebase numeric(18,5),
    nfi_preunit numeric(18,5),
    nfi_psitem numeric(18,5),
    nfi_qtitem numeric(18,5),
    nfi_qtporcaixa integer,
    nfi_racao character(70),
    nfi_tabpre integer,
    nfi_tributa integer,
    nfi_tricof integer,
    nfi_triicm integer,
    nfi_triipi integer,
    nfi_triiss integer,
    nfi_tripis integer,
    nfi_tsissqn character(70),
    nfi_unidade character(70),
    nfi_vlbasecofins numeric(18,5),
    nfi_vlbasecsll numeric(18,5),
    nfi_vlbaseicm numeric(18,5),
    nfi_vlbaseinss numeric(18,5),
    nfi_vlbaseipi numeric(18,5),
    nfi_vlbaseir numeric(18,5),
    nfi_vlbaseissqn numeric(18,5),
    nfi_vlbaseiva numeric(18,5),
    nfi_vlbasepis numeric(18,5),
    nfi_vlbasicmsu numeric(18,5),
    nfi_vlcapital numeric(18,5),
    nfi_vlcmv numeric(18,5),
    nfi_vlcofins numeric(18,5),
    nfi_vlcomissao numeric(18,5),
    nfi_vlcredpresum numeric(18,5),
    nfi_vlcsll numeric(18,5),
    nfi_vlcsocial numeric(18,5),
    nfi_vlcusto numeric(18,5),
    nfi_vldesc numeric(18,5),
    nfi_vldesclegal numeric(18,5),
    nfi_vldesonera numeric(18,5),
    nfi_vldespacess numeric(18,5),
    nfi_vldifericm numeric(18,5),
    nfi_vlfcgr numeric(18,5),
    nfi_vlfrete numeric(18,5),
    nfi_vlicm numeric(18,5),
    nfi_vlicmisento numeric(18,5),
    nfi_vlicmoutras numeric(18,5),
    nfi_vlicmsu numeric(18,5),
    nfi_vlinss numeric(18,5),
    nfi_vlipi numeric(18,5),
    nfi_vlirr numeric(18,5),
    nfi_vliss numeric(18,5),
    nfi_vlissqn numeric(18,5),
    nfi_vliva numeric(18,5),
    nfi_vlpis numeric(18,5),
    nfi_vlrca numeric(18,5),
    nfi_vlseguro numeric(18,5),
    nfi_vlservicos numeric(18,5),
    nfi_vlstbasctb numeric(18,5),
    nfi_vlstctb numeric(18,5),
    nfi_vltotite numeric(18,5),
    nfs_codretencsocial integer,
    nfs_numero integer NOT NULL,
    nfs_serie character(10) NOT NULL,
    pit_recagro character(70),
    pre_tiporeg integer,
    pro_clasfis character(70),
    pro_codclas integer,
    uni_unidade integer,
    nfi_status integer DEFAULT 9,
    id_nfsitem integer DEFAULT nextval('public.id_nfsitem'::regclass) NOT NULL,
    nfi_cest integer,
    mov_lote character(30),
    nfi_vbcstret numeric(15,2),
    nfi_pst numeric(15,2),
    nfi_vlicmsorisub numeric(15,2),
    nfi_vicmsstret numeric(15,2),
    nfi_despe numeric(15,2),
    nfi_cstis integer,
    nfi_cclasstribis integer,
    nfi_vbcis numeric(13,2),
    nfi_pis numeric(11,3),
    nfi_pisespec numeric(11,3),
    nfi_isutrib character(6),
    nfi_isqtrib numeric(10,3),
    nfi_vis numeric(13,2),
    nfi_rtcst integer,
    nfi_rtcclasstrib integer,
    nfi_rtvbc numeric(13,2),
    nfi_regcst integer,
    nfi_regcclasstrib integer,
    nfi_rtqbcmono numeric(11,3),
    nfi_rtqbcmonoreten numeric(11,3),
    nfi_rtqbcmonoretido numeric(11,3),
    nfi_ibsealiq numeric(7,4),
    nfi_ibsepdif numeric(11,3),
    nfi_ibsevdif numeric(13,2),
    nfi_ibsevdevtrib numeric(13,2),
    nfi_ibsepredaliq numeric(7,4),
    nfi_ibsepaliqefet numeric(7,4),
    nfi_ibsevalor numeric(13,2),
    nfi_ibseregpaliqefet numeric(11,3),
    nfi_ibseregvtrib numeric(13,2),
    nfi_ibsmaliq numeric(11,3),
    nfi_ibsmpdif numeric(11,3),
    nfi_ibsmvdif numeric(13,2),
    nfi_ibsmvdevtrib numeric(13,2),
    nfi_ibsmpredaliq numeric(7,4),
    nfi_ibsmpaliqefet numeric(7,4),
    nfi_ibsmvalor numeric(13,2),
    nfi_ibsmregpaliqefet numeric(11,3),
    nfi_ibsmregvtrib numeric(13,2),
    nfi_ibsccredpres integer,
    nfi_ibspcredpres numeric(11,3),
    nfi_ibsvcredpres numeric(13,2),
    nfi_ibsvcredprescondsus numeric(13,2),
    nfi_ibsadrem numeric(11,3),
    nfi_ibsvmono numeric(13,2),
    nfi_ibsadremreten numeric(11,3),
    nfi_ibsvmonoreten numeric(13,2),
    nfi_ibsadremretido numeric(11,3),
    nfi_ibsvmonoretido numeric(13,2),
    nfi_ibsdifmonoaliq numeric(11,3),
    nfi_ibsdifmonovalor numeric(13,2),
    nfi_ibsvtotmonoitem numeric(13,2),
    nfi_cbsaliq numeric(7,4),
    nfi_cbspdif numeric(11,3),
    nfi_cbsvdif numeric(13,2),
    nfi_cbsvdevtrib numeric(13,2),
    nfi_cbspredaliq numeric(7,4),
    nfi_cbspaliqefet numeric(7,4),
    nfi_cbsvalor numeric(13,2),
    nfi_cbsregpaliqefet numeric(11,3),
    nfi_cbsregvtrib numeric(13,2),
    nfi_cbsccredpres integer,
    nfi_cbspcredpres numeric(11,3),
    nfi_cbsvcredpres numeric(13,2),
    nfi_cbsvcredprescondsus numeric(13,2),
    nfi_cbsadrem numeric(11,3),
    nfi_cbsvmono numeric(13,2),
    nfi_cbsadremreten numeric(11,3),
    nfi_cbsvmonoreten numeric(13,2),
    nfi_cbsadremretido numeric(11,3),
    nfi_cbsvmonoretido numeric(13,2),
    nfi_cbsdifmonoaliq numeric(11,3),
    nfi_cbsdifmonovalor numeric(13,2),
    nfi_cbsvtotmonoitem numeric(13,2),
    nfi_vitem numeric(13,2),
    nfi_chaveacesso character(44),
    nfi_nitemrefer integer,
    nfi_indbemmovelusado integer,
    nfi_ibsepcmpgov numeric(15,3),
    nfi_ibsevcmpgov numeric(13,2),
    nfi_ibsmpcmpgov numeric(15,3),
    nfi_ibsmvcmpgov numeric(13,2),
    nfi_cbspcmpgov numeric(15,3),
    nfi_cbsvcmpgov numeric(13,2),
    nfi_ibstrfcred numeric(13,2),
    nfi_cbstrfcred numeric(15,3),
    nfi_ibstpcpzfm numeric(13,2),
    nfi_ibsvcpzfm numeric(13,2),
    nfi_cean character(14),
    nfi_ceantrib character(14),
    nfi_impcodicms integer,
    nfi_impcodipi integer,
    nfi_impcodpis integer,
    nfi_impcodcofins integer,
    nfi_impcodicmsst integer,
    nfi_impcodcbs integer,
    nfi_impcodibsuf integer,
    nfi_impcodibsmun integer,
    nfi_impcodis integer
);


--
-- Name: ocorrencia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ocorrencia (
    emp_empresa integer,
    uni_unidade integer,
    pre_tiporeg integer,
    pre_codocor integer,
    pre_descrocor character(20),
    pre_status boolean
);


--
-- Name: operacao; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operacao (
    emp_empresa integer,
    fil_filial integer,
    ope_codigo integer,
    ope_descricao text
);


--
-- Name: operacaotef; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.operacaotef (
    tef_codigo integer,
    nfs_numero integer,
    tef_nsu character varying(20),
    tef_rede character varying(30),
    tef_redecnpj character varying(14),
    tef_valorpagto numeric(15,2),
    tef_reajustevalor numeric(15,2),
    tef_saque numeric(15,2),
    tef_desconto numeric(15,2),
    tef_acrescimo numeric(15,2),
    tef_parcelas integer,
    tef_repparcela integer,
    tef_tipocartao character varying(30),
    tef_cartao character varying(30),
    tef_valortotal numeric(15,2),
    tef_cancelado boolean,
    tef_confirmado boolean,
    tef_dtcancelamento timestamp without time zone,
    tef_nsucancelamento integer,
    tef_codautcancelamento integer,
    tef_modpagamento integer,
    tef_codautorizacao character(20),
    tef_datahora timestamp without time zone,
    ped_codigo integer,
    tef_observacao character varying(1000),
    usu_usuario character(8),
    tef_finalizacao text
);


--
-- Name: opernat; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.opernat (
    emp_empresa integer,
    nae_codcompl integer,
    nat_codigo integer,
    opn_allcompl boolean,
    opn_altera boolean,
    opn_exceto boolean,
    opn_operacao character(50),
    opn_sinal boolean,
    seq integer
);


--
-- Name: pagmov; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pagmov (
    id_codigo integer DEFAULT nextval('public.id_pagmov'::regclass) NOT NULL,
    ven_codigo integer,
    cli_codigo integer,
    fin_codigo integer,
    pag_valor numeric(15,2),
    ope_codigo integer,
    pag_data date,
    pag_hora character(10),
    pag_oper character(1),
    usu_usuario character(8),
    afc_seq integer,
    pag_autorizacao character(40),
    pag_bandeira character(20),
    pag_numvezes integer,
    pag_troco numeric(14,2),
    ped_codigo integer DEFAULT 0,
    pag_ctared character(10),
    pag_cnpj character(15),
    pef_sigla character(18),
    pef_empresa integer,
    pef_filial integer,
    pef_numero integer,
    pef_seq integer,
    pag_temtef boolean
);


--
-- Name: pedido; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pedido (
    car_codigo integer,
    ced_seq integer,
    cli_codigo integer,
    cli_entrega integer,
    cli_tabpre integer,
    codformapg integer,
    cpg_condpag character(70),
    emp_empresa integer,
    emp_origem integer,
    mve_codigo integer,
    nae_codcompl integer,
    nat_codigo integer,
    ori_codigo integer,
    pac_sequencia integer,
    ped_ambulante integer,
    ped_analise character(3),
    ped_cargafecha character(3),
    ped_ciffob character(3),
    ped_clicpf character(70),
    ped_codcliamb integer,
    ped_codigo integer NOT NULL,
    ped_codpacx integer,
    ped_codpai integer DEFAULT 0,
    ped_codrefat numeric(18,2),
    ped_cpf character(70),
    ped_descon numeric(18,2),
    ped_descpro integer,
    ped_drpcod character(70),
    ped_dtembarque date,
    ped_dtlibcre date,
    ped_dtlibven date,
    ped_dtreprog date,
    ped_eancom character(70),
    ped_eanent character(70),
    ped_embarque date,
    ped_emissao date,
    ped_entrega date,
    ped_entrega2 date,
    ped_histori character(70),
    ped_hremi integer,
    ped_hrentrega character(70),
    ped_libcred integer,
    ped_libvend integer,
    ped_locentrega character(70),
    ped_mvecomis integer,
    ped_necpro character(3),
    ped_nomarq character(70),
    ped_nrpaco character(70),
    ped_nrpedori numeric(18,2),
    ped_numint numeric(18,2),
    ped_observ character(200),
    ped_obsger1 character(70),
    ped_operlog integer,
    ped_operpalet integer,
    ped_ordcarr integer,
    ped_ordcomp character(70),
    ped_origem integer,
    ped_oriped character(70),
    ped_pedterc integer,
    ped_percomis numeric(18,2),
    ped_pspallet numeric(18,2),
    ped_qtpacx integer,
    ped_qtpallet integer,
    ped_retcred character(70),
    ped_retvend character(70),
    ped_revisado character(70),
    ped_romterc integer,
    ped_saida date,
    ped_seqcarr integer,
    ped_sipreco integer,
    ped_sitcota integer,
    ped_sitcred integer,
    ped_situac character(70),
    ped_status integer DEFAULT 7,
    ped_tpanalise integer,
    ped_tpfrete integer,
    ped_tpnf integer,
    ped_ususelrom character(70),
    ped_vldesc numeric(18,2),
    ped_vldespaces numeric(18,2),
    ped_vlfrete numeric(18,2),
    ped_vloutros numeric(18,2),
    ped_vlprevfre numeric(18,2),
    pre_codigo integer,
    pre_tiporeg integer,
    reg_codigo character(70),
    rom_ambulante integer,
    rom_codigo integer,
    rom_origem integer,
    tip_operacao integer,
    tit_setor character(70),
    tpe_codigo integer,
    tpt_codigo integer,
    uni_origem integer,
    uni_unidade integer,
    usu_analise character(70),
    usu_usuario character(70),
    ven_codigo integer,
    ven_pcomiss numeric(18,2),
    ped_obsger2 character(70),
    ped_obsger3 character(70),
    id_pedido integer,
    mot_codigo integer,
    tra_codigo integer,
    nfs_numero integer,
    ped_vendamb character(3) DEFAULT 'no'::bpchar,
    nfs_serie character(10),
    cli_tpnfger integer,
    fil_filial integer DEFAULT 0,
    rvd_codigo integer,
    ped_extvend integer DEFAULT 0,
    ped_despe numeric(15,2),
    ped_vlsubtot numeric(15,2),
    ped_vltotal numeric(15,2),
    ped_caixafat integer,
    ped_identificacao character(50),
    ped_ocorrencia integer
);


--
-- Name: COLUMN pedido.cli_tpnfger; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.pedido.cli_tpnfger IS '1 - NFe (Danfe)
2 - NFc com CPF
3 - NFc sem CPF';


--
-- Name: pedidoitem; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pedidoitem (
    emp_empresa integer,
    ite_codigo integer NOT NULL,
    mov_lote character(70),
    nae_codcompl integer,
    nat_codigo integer,
    ped_codigo integer NOT NULL,
    ped_vlcomis numeric(18,2),
    pit_acrec numeric(18,2),
    pit_afixar character(3),
    pit_codext character(70),
    pit_desc numeric(18,2),
    pit_dtprodfim date,
    pit_dtprodini date,
    pit_icms numeric(18,2),
    pit_locentr character(70),
    pit_observa character(200),
    pit_pcbonifica numeric(18,2),
    pit_pccomis numeric(18,2),
    pit_pcdesc numeric(18,2),
    pit_precobase numeric(18,2),
    pit_psatendi numeric(18,3),
    pit_pscorte numeric(18,2),
    pit_psenvia numeric(18,2),
    pit_pspedi numeric(18,3),
    pit_qtatendi numeric(18,2),
    pit_qtcorte numeric(18,2),
    pit_qtenvia numeric(18,2),
    pit_qtpedi numeric(18,2),
    pit_recagro character(70),
    pit_seq integer NOT NULL,
    pit_status integer DEFAULT 1 NOT NULL,
    pit_tabpre integer,
    pit_umed character(70),
    pit_vlcomissao numeric(18,2),
    pit_vlcusto numeric(18,2),
    pit_vldescto numeric(18,2),
    pit_vlfrete numeric(18,2),
    pit_vlpreco numeric(18,5),
    pit_vlprecoaux numeric(18,5),
    pre_tiporeg integer,
    pro_codpai integer,
    pro_pcmaxval numeric(18,2),
    pro_pcminval numeric(18,2),
    uni_unidade integer,
    id_pedidoitem integer DEFAULT nextval('public.id_pedidoitem'::regclass) NOT NULL,
    pit_desclib numeric(15,5),
    pit_cultura character(20),
    pre_ocorrenc integer DEFAULT 0,
    pit_despe numeric(15,2),
    pit_pesagem boolean DEFAULT false,
    pit_recdata date,
    tcf_codigo integer
);


--
-- Name: pedidoitemlote; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pedidoitemlote (
    id_pedidoitemlote integer NOT NULL,
    id_pedidoitem integer NOT NULL,
    emp_empresa integer,
    uni_unidade integer,
    ped_codigo integer,
    ite_codigo integer,
    mov_lote character varying(60) NOT NULL,
    pil_qtd numeric(15,3) DEFAULT 0 NOT NULL
);


--
-- Name: pedidoitemlote_id_pedidoitemlote_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pedidoitemlote_id_pedidoitemlote_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pedidoitemlote_id_pedidoitemlote_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pedidoitemlote_id_pedidoitemlote_seq OWNED BY public.pedidoitemlote.id_pedidoitemlote;


--
-- Name: pendfin; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pendfin (
    emp_empresa integer NOT NULL,
    fil_filial integer NOT NULL,
    pef_numero integer NOT NULL,
    pef_seq integer NOT NULL,
    pef_sigla character(18),
    cli_codigo integer,
    pef_saldo numeric(15,2),
    pef_dtvalidade date,
    pef_situac character(1),
    pef_numnf integer,
    pef_sernf character(3),
    nfs_numero integer,
    nfs_serie character(3)
);


--
-- Name: precoprodu; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.precoprodu (
    emp_empresa integer,
    ite_codigo integer NOT NULL,
    pre_codigo integer,
    pre_dtultatu date,
    pre_dtvalid date,
    pre_emissao date,
    pre_hrultatu integer,
    pre_obs character(70),
    pre_seq integer,
    pre_tiporeg integer NOT NULL,
    pre_valor numeric(15,5),
    pre_vlfrekg numeric(18,2),
    pre_vlmin numeric(18,2),
    uni_unidade integer,
    usu_usuario character(70),
    pre_dias integer,
    cpg_condpag character(20),
    cli_codigo integer DEFAULT 0,
    pre_vlcusto numeric(15,5),
    pro_preconew numeric(15,9)[],
    pre_excessao integer,
    pre_indice numeric(15,4),
    pre_carencia integer,
    dfi_ocorrencia text[]
);


--
-- Name: prepromo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prepromo (
    emp_empresa integer NOT NULL,
    uni_unidade integer NOT NULL,
    prm_tpcod character varying(18) NOT NULL,
    ite_codigo integer NOT NULL,
    prm_nrpromo integer NOT NULL,
    prm_preco numeric(15,2),
    prm_indred boolean NOT NULL,
    cli_tabpre integer,
    prm_codredcli integer NOT NULL,
    prm_qtmin numeric(15,2),
    prm_qtmax numeric(15,2),
    prm_psmin numeric(15,2),
    prm_psmax numeric(15,2),
    prm_comissao numeric(15,2),
    prm_dtini date,
    prm_dtfim date,
    pre_tiporeg integer
);


--
-- Name: prevolume; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prevolume (
    emp_empresa integer NOT NULL,
    uni_unidade integer NOT NULL,
    ite_codigo integer NOT NULL,
    dtvig date,
    dtfvig date,
    pre_tiporeg integer,
    prminimo numeric(15,2),
    qtini integer,
    qtfim integer,
    prbase character(8)
);


--
-- Name: produto; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.produto (
    abe_codigo integer,
    bia_animal_sangrado character(3),
    bia_animal_vivo character(3),
    bia_carcaca_corte character(3),
    bia_condenados character(3),
    bia_eviscerado character(3),
    bia_gera_mp_composta character(3),
    bia_inteiro character(3),
    bia_item_carcaca character(3),
    bia_miudos character(3),
    bia_mortos character(3),
    bia_mp_composta character(3),
    cba_codigo integer,
    cba_grupo integer,
    clc_codigo integer,
    ebp_codigo integer,
    emp_empresa integer,
    emt_codigo integer,
    fam_codigo integer,
    gru_chefia character(70),
    gru_codigo integer,
    gru_diario integer,
    gru_gerencia character(70),
    ite_codigo integer,
    lin_codigo integer,
    mar_codigo integer,
    nbm_codigo integer,
    ori_codigo integer,
    par_prodsim character(3),
    prc_codigo integer,
    pro_abac integer,
    pro_alicofins numeric(18,2),
    pro_aliicm numeric(18,2),
    pro_aliipi numeric(18,2),
    pro_alipis numeric(18,2),
    pro_aplicfunrur character(3),
    pro_apontavol character(3),
    pro_ativo character(3),
    pro_avaliavel character(3),
    pro_basemargem integer,
    pro_basered numeric(18,2),
    pro_bxestoque character(3),
    pro_clasfis character(70),
    pro_codclas integer,
    pro_codigo integer NOT NULL,
    pro_codigo_pmp integer,
    pro_codsif character(70),
    pro_comestivel character(3),
    pro_comosso character(3),
    pro_compele character(3),
    pro_contabiliza character(3),
    pro_cxplastica numeric(18,2),
    pro_descacerto character(150),
    pro_descricao character(150),
    pro_descrifat character(150),
    pro_desctraduz character(150),
    pro_dimembal integer,
    pro_estoque integer,
    pro_etiqueta integer,
    pro_export character(3),
    pro_faixa integer,
    pro_faixab integer,
    pro_grmargem integer,
    pro_grupoctb integer,
    pro_grupof7 character(70),
    pro_icmdif numeric(18,2),
    pro_indmargem numeric(18,2),
    pro_margem character(3),
    pro_miudos character(3),
    pro_nomeusual character(150),
    pro_nomeusual1 character(150),
    pro_pai integer,
    pro_produzido integer,
    pro_psunitario numeric(18,2),
    pro_qtporcaixa numeric(18,2),
    pro_rendabate character(3),
    pro_rendcomer character(3),
    pro_rendproducao character(3),
    pro_salacortes character(3),
    pro_similar integer,
    pro_subproduto character(3),
    pro_subtrib integer,
    pro_triicm integer,
    pro_unifat character(70),
    pro_uniped character(70),
    pro_unisif character(70),
    pro_varlgdun14 character(70),
    pro_vendavel character(3),
    recsta character(70),
    sci_grupo integer,
    tpc_codigo integer,
    tps_codigo integer,
    tse_codigo integer,
    uni_abac integer,
    uni_abacdg integer,
    pro_ean character varying(50),
    nat_codigo integer,
    nae_codcompl integer,
    pro_cest character(15),
    pro_vlunitario numeric(18,5),
    pro_imagem bytea,
    sal_item numeric(15,2),
    ite_cultura character(5),
    sit_controlote boolean DEFAULT false,
    tip_codigo integer DEFAULT 0,
    ite_procedencia integer DEFAULT 0,
    ite_prodanp integer,
    pro_ibpt numeric(15,5) DEFAULT 0,
    ite_display character(15),
    pro_comis boolean DEFAULT true,
    pro_pspadrao boolean DEFAULT false,
    pro_tributa integer DEFAULT 0,
    pro_tipoval integer DEFAULT 0 NOT NULL,
    pro_validade integer DEFAULT 0 NOT NULL,
    pro_pempeso numeric(15,2),
    ite_cest integer
);


--
-- Name: reprvend; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reprvend (
    emp_empresa integer,
    rvd_codigo integer,
    rvd_comadic numeric(18,2),
    rvd_comavista numeric(18,2),
    rvd_compad numeric(18,2),
    rvd_comprz numeric(18,2),
    rvd_desctovda numeric(18,2),
    rvd_email character(70),
    rvd_fatporcli numeric(18,2),
    rvd_fone1 character(70),
    rvd_fone2 character(70),
    rvd_funcao integer,
    rvd_nome character(70),
    rvd_situac integer,
    rvd_supervisor integer,
    rvd_tabcomis integer,
    rvd_tipo character(3),
    rvd_tpvend integer,
    rvd_vlbasesal numeric(18,2),
    usu_usulogin character(70),
    rvd_calcomis boolean DEFAULT false,
    rvd_nrtab integer DEFAULT 0
);


--
-- Name: sal_lote; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sal_lote (
    emp_empresa integer,
    ite_codigo integer NOT NULL,
    mes_docto integer,
    mov_boletim character(70),
    mov_char character(70),
    mov_data date,
    mov_deci numeric(18,2),
    mov_default boolean,
    mov_dtvencto date,
    mov_fabric character(70),
    mov_fimcondata date,
    mov_fimconhora integer,
    mov_hora integer,
    mov_inicondata date,
    mov_iniconhora integer,
    mov_inte integer,
    mov_lote character(70) NOT NULL,
    mov_loteint integer,
    mov_observ character(70),
    mov_partida character(70),
    mov_pcgerm numeric(18,2),
    mov_pcpuro numeric(18,2),
    mov_programa character(70),
    mov_qtsaldo numeric(18,2),
    mov_qttrans numeric(18,2),
    mov_seq integer,
    mov_status integer,
    mov_tipo boolean,
    mov_validtst character(70),
    tra_codigo character(70),
    uni_unidade integer,
    usu_usuario character(70),
    mov_dtfabricacao date
);


--
-- Name: saldo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.saldo (
    pro_codigo integer NOT NULL,
    sal_item numeric(15,2),
    pro_vendavel boolean DEFAULT true
);


--
-- Name: seq_vencparc; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.seq_vencparc
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tabcfop; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tabcfop (
    emp_empresa integer,
    fil_filial integer,
    tcf_alcfo integer,
    tcf_alcpl integer,
    tcf_cfcfop integer,
    tcf_cfcpl integer,
    tcf_cfop integer,
    tcf_cpl integer,
    tcf_ncmpro numeric(18,2),
    tcf_stcfop integer,
    tcf_stcpl integer,
    tcf_tpoper integer,
    tcf_tpsel integer,
    tcf_ufdest character(2),
    uni_unidade integer,
    seq integer,
    nae_fatura boolean,
    nae_faagroaraca boolean,
    obs_codigo integer
);


--
-- Name: tecagronomico; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tecagronomico (
    emp_empresa integer NOT NULL,
    tcf_codigo integer NOT NULL,
    tcf_cpf character(11),
    tcf_crmv character(20),
    tcf_descreg character(50),
    tcf_nome character(50),
    tcf_registro character(50)
);


--
-- Name: tlistap; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tlistap (
    emp_empresa integer,
    pre_coeflis numeric(18,2),
    pre_delta numeric(18,2),
    pre_descrocor character(70),
    pre_limfxfim numeric(18,2),
    pre_limfxini numeric(18,2),
    pre_nome character(70),
    pre_status character(3),
    pre_tiporeg integer,
    rvd_codigo integer,
    uni_unidade integer
);


--
-- Name: transportador; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.transportador (
    cid_cidade integer,
    cli_codigo integer,
    cli_linha_lei integer,
    nfs_placam character(70),
    nfs_placar character(70),
    obs_codigo integer,
    recsta character(70),
    tpe_codigo integer,
    tpt_codigo integer,
    tra_antt character(70),
    tra_autonomo character(3),
    tra_bonus numeric(18,2),
    tra_cep character(70),
    tra_cgc character(70),
    tra_codigo integer NOT NULL,
    tra_cpf character(70),
    tra_email_tic character(70),
    tra_ender character(70),
    tra_fax character(70),
    tra_fone character(70),
    tra_inscest character(70),
    tra_nome character(70),
    tra_pccomis numeric(18,2),
    tra_responsavel character(70)
);


--
-- Name: usuario; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuario (
    apl_aplicacao character(70),
    ativo character(3),
    ctr_indicador character(3),
    dtcanc date,
    emp_empresa integer,
    est_estacao integer,
    excel character(3),
    fax_retorno character(70),
    fun_funcionario integer,
    habsom character(3),
    imp_codigo character(70),
    maxses integer,
    media character(3),
    neg_codigo character(70),
    numses integer,
    pes_cpf character(70),
    pes_datanasc date,
    prf_codigo integer,
    recsta character(70),
    senha character(70),
    somacao character(70),
    somcancel character(70),
    somerro character(70),
    somlogin character(70),
    somlogoff character(70),
    somok character(70),
    uni_unidade integer,
    usu_adfsemlim character(3),
    usu_apelido character(70),
    usu_aproesp character(3),
    usu_chavepte character(3),
    usu_correio integer,
    usu_dias character(3),
    usu_dtacesso date,
    usu_email character(70),
    usu_emailcomp character(70),
    usu_f7razfan character(3),
    usu_f7sit character(70),
    usu_hierarq integer,
    usu_horafim integer,
    usu_horaini integer,
    usu_layout integer,
    usu_local integer,
    usu_logext character(3),
    usu_logweb character(3),
    usu_menunovo character(3),
    usu_nome character(70),
    usu_perfil character(70),
    usu_ramal character(70),
    usu_remoto character(3),
    usu_respsegur character(3),
    usu_senha character(70),
    usu_setor character(70),
    usu_soperfil character(3),
    usu_timeout integer,
    usu_tipo character(70),
    usu_usuario character(70),
    usuadm character(3),
    usucod integer,
    usuger character(3),
    pes_pesador integer,
    fil_filial integer,
    rpv_codigo integer,
    usu_admagro boolean DEFAULT false,
    usu_aprov boolean DEFAULT false,
    usu_desconto numeric(15,2) DEFAULT 0,
    usu_acrescimo numeric(15,2) DEFAULT 0
);


--
-- Name: vencparc; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vencparc (
    age_agencia integer,
    agp_ctared integer,
    ban_banco integer,
    ctacor character(70),
    dtvenc date,
    emp_empresa integer,
    fil_filial integer,
    nrautoriz numeric(18,2),
    nrchq integer,
    nrdoc integer,
    nrparcela integer,
    parcent boolean DEFAULT false,
    seq integer DEFAULT nextval('public.seq_vencparc'::regclass) NOT NULL,
    serie character(70),
    st integer,
    tipo character(5) DEFAULT 'PED'::bpchar,
    tit_numint numeric(18,2),
    tppag character(70),
    uni_unidade integer,
    valor numeric(18,2)
);


--
-- Name: venda; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.venda (
    ven_codigo integer NOT NULL,
    usu_usuario character(8),
    emp_empresa integer,
    uni_unidade integer,
    cli_codigo integer,
    ven_dtabre date,
    ven_hrabre character(15),
    ven_dtfecha date,
    ven_hrfecha character(15),
    ven_vldesc numeric(15,2),
    ven_vlvenda numeric(15,2),
    cai_codigo integer,
    ven_vlpagto numeric(15,2),
    ven_obs text,
    ven_status integer,
    ven_vltroco numeric(15,2),
    ven_vltrocosol numeric(15,2),
    ven_desc numeric(15,2),
    cpg_condpag character(10),
    ven_vltotpag numeric(15,2),
    ven_clicpf character(15),
    ven_despe numeric(15,2),
    ven_identificacao character(50),
    rvd_codigo integer,
    ven_ocorrencia integer,
    ven_vlfrete numeric(15,2),
    ope_codigo integer
);


--
-- Name: pedidoitemlote id_pedidoitemlote; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidoitemlote ALTER COLUMN id_pedidoitemlote SET DEFAULT nextval('public.pedidoitemlote_id_pedidoitemlote_seq'::regclass);


--
-- Name: cimarca PKMarca; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cimarca
    ADD CONSTRAINT "PKMarca" PRIMARY KEY (mar_codigo);


--
-- Name: credencia PKcredencia; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.credencia
    ADD CONSTRAINT "PKcredencia" PRIMARY KEY (cre_codigo);


--
-- Name: afcaixa afcaixa_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.afcaixa
    ADD CONSTRAINT afcaixa_pkey PRIMARY KEY (afc_seq);


--
-- Name: agrosys_scripts agrosys_scripts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agrosys_scripts
    ADD CONSTRAINT agrosys_scripts_pkey PRIMARY KEY (scr_versao);


--
-- Name: bandeira bandeira_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bandeira
    ADD CONSTRAINT bandeira_pkey PRIMARY KEY (ban_codigo);


--
-- Name: cidade cid_cidadePK; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cidade
    ADD CONSTRAINT "cid_cidadePK" PRIMARY KEY (cid_cidade);


--
-- Name: clifor cli_codigo; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clifor
    ADD CONSTRAINT cli_codigo PRIMARY KEY (cli_codigo);


--
-- Name: condpagto condpagtoPK; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.condpagto
    ADD CONSTRAINT "condpagtoPK" PRIMARY KEY (cpg_condpag);


--
-- Name: estado est_estado; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.estado
    ADD CONSTRAINT est_estado PRIMARY KEY (est_estado);


--
-- Name: facliuni facliuni_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.facliuni
    ADD CONSTRAINT facliuni_pkey PRIMARY KEY (cli_codigo);


--
-- Name: finalizadora finalizadora_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.finalizadora
    ADD CONSTRAINT finalizadora_pkey PRIMARY KEY (fin_codigo);


--
-- Name: formapag formapagPK; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.formapag
    ADD CONSTRAINT "formapagPK" PRIMARY KEY (codformapg);


--
-- Name: ftmotora ftmotoraPK; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ftmotora
    ADD CONSTRAINT "ftmotoraPK" PRIMARY KEY (mot_codigo);


--
-- Name: hiscaixa hiscaixa_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hiscaixa
    ADD CONSTRAINT hiscaixa_pkey PRIMARY KEY (his_codigo);


--
-- Name: hisnfe hisnfePK; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hisnfe
    ADD CONSTRAINT "hisnfePK" PRIMARY KEY (numero, serie, his_codigo, id_hisnfe);


--
-- Name: imposto imposto1PK; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.imposto
    ADD CONSTRAINT "imposto1PK" PRIMARY KEY (imp_codigo, tbi_codigo, nat_codigo);


--
-- Name: impostoOLD impostoPK; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."impostoOLD"
    ADD CONSTRAINT "impostoPK" PRIMARY KEY (imp_codigo, tbi_codigo);


--
-- Name: nfscapa nfscapaPK; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nfscapa
    ADD CONSTRAINT "nfscapaPK" PRIMARY KEY (nfs_numero, nfs_serie);


--
-- Name: nfsitem nfsitemPK; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nfsitem
    ADD CONSTRAINT "nfsitemPK" PRIMARY KEY (nfs_numero, nfs_serie, ite_codigo, nfi_nritem, id_nfsitem);


--
-- Name: pagmov pagmov_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagmov
    ADD CONSTRAINT pagmov_pkey PRIMARY KEY (id_codigo);


--
-- Name: pedido pedidoPK; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedido
    ADD CONSTRAINT "pedidoPK" PRIMARY KEY (ped_codigo);


--
-- Name: pedidoitem pedidoitem_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidoitem
    ADD CONSTRAINT pedidoitem_pkey PRIMARY KEY (ped_codigo, ite_codigo, pit_status, id_pedidoitem, pit_seq);


--
-- Name: caixa pk; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.caixa
    ADD CONSTRAINT pk PRIMARY KEY (cai_codigo);


--
-- Name: agbanco pk_agbanco; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agbanco
    ADD CONSTRAINT pk_agbanco PRIMARY KEY (emp_empresa, agp_ctared, ban_banco);


--
-- Name: excecimp pk_excecimp01; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.excecimp
    ADD CONSTRAINT pk_excecimp01 PRIMARY KEY (exc_sigla, emp_empresa, uni_unidade, ite_codigo);


--
-- Name: pedidoitemlote pk_pedidoitemlote; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pedidoitemlote
    ADD CONSTRAINT pk_pedidoitemlote PRIMARY KEY (id_pedidoitemlote);


--
-- Name: pendfin pk_pendfin; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pendfin
    ADD CONSTRAINT pk_pendfin PRIMARY KEY (emp_empresa, fil_filial, pef_numero, pef_seq);


--
-- Name: prepromo pk_prepromo; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prepromo
    ADD CONSTRAINT pk_prepromo PRIMARY KEY (emp_empresa, uni_unidade, prm_tpcod, prm_codredcli, prm_indred, ite_codigo, prm_nrpromo);


--
-- Name: tecagronomico pk_tecagronomico; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tecagronomico
    ADD CONSTRAINT pk_tecagronomico PRIMARY KEY (emp_empresa, tcf_codigo);


--
-- Name: precoprodu preoproduPK; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.precoprodu
    ADD CONSTRAINT "preoproduPK" PRIMARY KEY (pre_tiporeg, ite_codigo);


--
-- Name: produto produtoPK; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.produto
    ADD CONSTRAINT "produtoPK" PRIMARY KEY (pro_codigo);


--
-- Name: sal_lote sal_itemPK; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sal_lote
    ADD CONSTRAINT "sal_itemPK" PRIMARY KEY (mov_lote, ite_codigo);


--
-- Name: saldo saldoPK; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.saldo
    ADD CONSTRAINT "saldoPK" PRIMARY KEY (pro_codigo);


--
-- Name: transportador transportPK; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.transportador
    ADD CONSTRAINT "transportPK" PRIMARY KEY (tra_codigo);


--
-- Name: vencparc vencparcPK; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vencparc
    ADD CONSTRAINT "vencparcPK" PRIMARY KEY (seq);


--
-- Name: venda venda_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.venda
    ADD CONSTRAINT venda_pkey PRIMARY KEY (ven_codigo);


--
-- Name: iclifor01; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX iclifor01 ON public.clifor USING btree (cli_razsoc);


--
-- Name: idx_afcaixa_aberto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_afcaixa_aberto ON public.afcaixa USING btree (afc_seq, cai_codigo) WHERE (afc_dtfecha IS NULL);


--
-- Name: idx_clifor1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_clifor1 ON public.clifor USING btree (cli_razsoc);


--
-- Name: idx_hisped; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hisped ON public.hisped USING btree (ped_codigo);


--
-- Name: idx_nfscapa_saldo_aberto; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nfscapa_saldo_aberto ON public.nfscapa USING btree (nfs_numero, nfs_serie) WHERE ((nfs_exportado <> 'yes'::bpchar) AND (sit_nfelet = '100'::bpchar));


--
-- Name: idx_nfscapa_saldo_pendente; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nfscapa_saldo_pendente ON public.nfscapa USING btree (ped_numero) WHERE ((nfs_status <> 9) AND (nfs_exportado <> 'yes'::bpchar));


--
-- Name: idx_pagmov_afc_seq; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pagmov_afc_seq ON public.pagmov USING btree (afc_seq);


--
-- Name: idx_pedido_codigo_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pedido_codigo_status ON public.pedido USING btree (ped_codigo, ped_status);


--
-- Name: idx_pedido_ped_codigo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pedido_ped_codigo ON public.pedido USING btree (ped_codigo);


--
-- Name: idx_pedido_ven_codigo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pedido_ven_codigo ON public.pedido USING btree (ven_codigo);


--
-- Name: idx_produto1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_produto1 ON public.produto USING btree (pro_descricao);


--
-- Name: idx_produto2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_produto2 ON public.produto USING btree (pro_ean);


--
-- Name: idx_produto_ean_rev; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_produto_ean_rev ON public.produto USING btree (reverse(btrim((pro_ean)::text)) text_pattern_ops);


--
-- Name: iimposto01; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX iimposto01 ON public.imposto USING btree (emp_empresa, fil_filial, tbi_codigo, est_origem, est_destino, ite_codigo, imp_dtivig);


--
-- Name: infscapa1; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX infscapa1 ON public.nfscapa USING btree (ped_codigo);


--
-- Name: infscapa2; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX infscapa2 ON public.nfscapa USING btree (nfs_serie);


--
-- Name: infscapa3; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX infscapa3 ON public.nfscapa USING btree (cli_codigo);


--
-- Name: infscapa4; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX infscapa4 ON public.nfscapa USING btree (sit_nfelet);


--
-- Name: infscapa5; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX infscapa5 ON public.nfscapa USING btree (nfs_modelo);


--
-- Name: infscapa6; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX infscapa6 ON public.nfscapa USING btree (nfs_exportado);


--
-- Name: infscapa7; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX infscapa7 ON public.nfscapa USING btree (nfs_dtemissao);


--
-- Name: iproduto01; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX iproduto01 ON public.produto USING btree (pro_ean);


--
-- Name: ivencparc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ivencparc ON public.vencparc USING btree (nrdoc);


--
-- Name: ix_pedidoitemlote_item; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_pedidoitemlote_item ON public.pedidoitemlote USING btree (id_pedidoitem);


--
-- Name: ix_pedidoitemlote_ped; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_pedidoitemlote_ped ON public.pedidoitemlote USING btree (ped_codigo);


--
-- Name: cidade est_estadoFK; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cidade
    ADD CONSTRAINT "est_estadoFK" FOREIGN KEY (est_estado) REFERENCES public.estado(est_estado);


--
-- PostgreSQL database dump complete
--

\unrestrict pB47czZzblWTcFuRoZp7iJgt8RhjTz6q725SvUayKIgUk958fdRiCOmdy0nIFH0

