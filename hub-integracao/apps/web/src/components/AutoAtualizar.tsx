'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FormControlLabel, Switch } from '@mui/material';

// Recarrega a página a cada 10 s (acompanhar o log e a conexão ao vivo).
export function AutoAtualizar({ segundos = 10 }: { segundos?: number }) {
  const router = useRouter();
  const [ligado, setLigado] = useState(false);
  useEffect(() => {
    if (!ligado) return;
    const t = setInterval(() => router.refresh(), segundos * 1000);
    return () => clearInterval(t);
  }, [ligado, segundos, router]);
  return <FormControlLabel control={<Switch checked={ligado} onChange={(e) => setLigado(e.target.checked)} />} label={`Atualizar a cada ${segundos} s`} />;
}
