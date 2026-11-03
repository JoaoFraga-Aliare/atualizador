'use client';

import { useActionState, useState } from 'react';
import { Box, Button, Checkbox, FormControlLabel, MenuItem, TextField, Typography } from '@mui/material';
import type { Estado } from '@/app/tenants/actions';
import { Resultado } from './Formulario';

type Padroes = Record<string, string | number | boolean | null | undefined>;

const campo = { slotProps: { inputLabel: { shrink: true } }, sx: { minWidth: 160, flex: '1 1 160px' } } as const;

// Campos de conexão com o Agrosys: valem para todos os terminais da empresa.
export function CamposAgrosys({ padroes = {} }: { padroes?: Padroes }) {
  const v = (k: string) => (padroes[k] === undefined || padroes[k] === null ? '' : String(padroes[k]));
  return (
    <>
      <TextField name="con_sincurl" label="URL do web service do Agrosys" required defaultValue={v('con_sincurl')}
        placeholder="http://servidor:9080" slotProps={campo.slotProps} sx={{ flex: '1 1 100%' }} />
      <TextField name="emp_empresa" label="Empresa" type="number" required defaultValue={v('emp_empresa')} {...campo} />
      <TextField name="uni_unidade" label="Unidade" type="number" required defaultValue={v('uni_unidade')} {...campo} />
      <TextField name="fil_filial" label="Filial" type="number" required defaultValue={v('fil_filial')} {...campo} />
      <TextField name="cai_timeout" label="Timeout (ms)" type="number" defaultValue={v('cai_timeout')} placeholder="3000" {...campo} />
      <FormControlLabel
        control={<Checkbox name="cai_urlsoapvr12" defaultChecked={padroes.cai_urlsoapvr12 === true} />}
        label="URL SOAP (versão 12)" sx={{ flex: '1 1 160px' }} />
    </>
  );
}

// Cadastro de empresa: a origem da integração define o restante do formulário.
export function NovaEmpresa({ acao }: { acao: (e: Estado, d: FormData) => Promise<Estado> }) {
  const [estado, enviar, pendente] = useActionState<Estado, FormData>(acao, {});
  const [origem, setOrigem] = useState<'agrosys' | 'api'>('agrosys');
  return (
    <Box component="form" action={enviar} sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'flex-start' }}>
      <TextField name="nome" label="Nome" required {...campo} />
      <TextField name="documento" label="CNPJ (opcional)" {...campo} />
      <TextField select name="origem" label="Origem da integração" value={origem}
        onChange={(e) => setOrigem(e.target.value as 'agrosys' | 'api')} {...campo}>
        <MenuItem value="agrosys">Agrosys (o Hub busca no ERP)</MenuItem>
        <MenuItem value="api">API (o sistema do cliente envia ao Hub)</MenuItem>
      </TextField>
      {origem === 'agrosys' && <CamposAgrosys />}
      {origem === 'api' && (
        <Typography variant="body2" color="text.secondary" sx={{ flexBasis: '100%' }}>
          O cliente integra pela API do Hub (veja a Documentação). Depois crie o usuário de integração e os terminais.
        </Typography>
      )}
      <Button type="submit" variant="contained" disabled={pendente}>{pendente ? 'Criando…' : 'Criar empresa'}</Button>
      <Resultado estado={estado} />
    </Box>
  );
}

export function PadroesEmpresa({ acao, padroes }: { acao: (e: Estado, d: FormData) => Promise<Estado>; padroes: Padroes }) {
  const [estado, enviar, pendente] = useActionState<Estado, FormData>(acao, {});
  return (
    <Box component="form" action={enviar} sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, alignItems: 'flex-start' }}>
      <CamposAgrosys padroes={padroes} />
      <Button type="submit" variant="contained" disabled={pendente}>{pendente ? 'Salvando…' : 'Salvar padrões'}</Button>
      <Resultado estado={estado} />
    </Box>
  );
}
