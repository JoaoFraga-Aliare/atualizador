import { config } from './config.js';
import { criarPool } from './db.js';
import { migrar } from './migrate.js';
import { criarApp } from './app.js';
import { processarFila } from './envios.js';
import { processarEntregas } from './webhooks.js';
import { sincronizarEmpresa } from './sync-agrosys.js';
import { expurgarLogs } from './log.js';
import { expurgarDadosPeriodico } from './retencao.js';
import { iniciarMonitorSaldo } from './monitor-saldo.js';
import { avaliarAlertas, avisarExterno } from './monitoramento.js';
import { configAlertas } from './logs-admin.js';

const cfg = config();
const db = criarPool(cfg.databaseUrl);
await migrar(db);
criarApp({ db, segredo: cfg.jwtSecret, chaveServico: cfg.chaveServico }).listen(cfg.port, () => console.log(`Hub API em :${cfg.port}`));

// Webhooks (origem API): entrega e novas tentativas, a cada 5 s. Reentrega dos envios com falha tecnica (empresas Agrosys), a cada 30 s.
setInterval(() => { processarEntregas(db, cfg.jwtSecret).catch((e) => console.error('webhooks:', (e as Error).message)); }, 5_000).unref();
setInterval(() => { processarFila(db).catch((e) => console.error('outbox:', (e as Error).message)); }, 30_000).unref();

// Retencao do log de requisicoes: corpos (texto grande) somem apos HUB_LOG_CORPO_HORAS (padrao 6) e as
// linhas apos HUB_LOG_DIAS (padrao 60); a cada 10 min.
setInterval(() => {
  expurgarLogs(db).catch((e) => console.error('expurgo:', (e as Error).message));
  // envios ja entregues, entregas de webhook, execucoes de sync, alertas resolvidos e exclusoes antigas (1x por hora)
  expurgarDadosPeriodico(db).catch((e) => console.error('retencao:', (e as Error).message));
}, 600_000).unref();

// Sincronizacao periodica com o Agrosys: HUB_SYNC_MINUTOS=0 (padrao) desliga; o botao
// "Sincronizar agora" do gerencial continua valendo.
const minutos = Number(process.env.HUB_SYNC_MINUTOS ?? 0);
if (minutos > 0) {
  setInterval(async () => {
    try {
      const r = await db.query("select id from tenants where ativo and provider = 'agrosys'");
      for (const t of r.rows) await sincronizarEmpresa(db, t.id).catch((e) => console.error('sync:', (e as Error).message));
    } catch (e) { console.error('sync:', (e as Error).message); }
  }, minutos * 60_000).unref();
}

// Monitor de saldo (Agrosys): terminais com cai_saldomin > 0 e cai_saldointervalo >= 5 s fazem o Hub
// consultar o saldo dos produtos ativos abaixo do minimo. HUB_SALDO_MONITOR=nao desliga.
if (process.env.HUB_SALDO_MONITOR !== 'nao') iniciarMonitorSaldo(db);

// Alertas de monitoramento: avalia a cada HUB_ALERTAS_SEGUNDOS (padrao 60; 0 desliga) e, se HUB_ALERTA_URL estiver definida,
// avisa la quando um alerta novo abre. Veja docs/hub/11-operacao-seguranca.md.
const alertasSeg = Number(process.env.HUB_ALERTAS_SEGUNDOS ?? 60);
if (alertasSeg > 0) {
  setInterval(async () => {
    try { await avisarExterno((await avaliarAlertas(db, await configAlertas(db))).novos); }
    catch (e) { console.error('alertas:', (e as Error).message); }
  }, alertasSeg * 1000).unref();
}
