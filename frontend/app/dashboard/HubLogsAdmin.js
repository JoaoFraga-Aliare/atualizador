'use client';
import { useState } from 'react';
import { Tab, Tabs, Stack } from '@mui/material';
import HubErrors from './HubErrors';
import HubAlerts from './HubAlerts';
import HubLogSettings from './HubLogSettings';

// Hub > Logs (administrador): erros de todos os clientes, alertas de monitoramento e configuracoes do log.
export default function HubLogsAdmin({ go }) {
  const [tab, setTab] = useState('errors');
  return (
    <Stack spacing={2}>
      <Tabs value={tab} onChange={(_, v) => setTab(v)}>
        <Tab value="errors" label="Erros" />
        <Tab value="alerts" label="Alertas" />
        <Tab value="settings" label="Configurações" />
      </Tabs>
      {tab === 'errors' && <HubErrors />}
      {tab === 'alerts' && <HubAlerts go={go} />}
      {tab === 'settings' && <HubLogSettings />}
    </Stack>
  );
}
