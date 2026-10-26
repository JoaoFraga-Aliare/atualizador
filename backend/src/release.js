import crypto from 'node:crypto';

export function getReleasePolicy(release, now = Date.now()) {
  const deadlineTime = release?.deadline_at ? Date.parse(release.deadline_at) : NaN;
  const deadlineExpired = Number.isFinite(deadlineTime) && now >= deadlineTime;
  const configuredMandatory = Boolean(release?.mandatory);
  return {
    mandatory: configuredMandatory || deadlineExpired,
    mandatoryReason: configuredMandatory ? 'configured' : deadlineExpired ? 'deadline' : null,
    deadlineExpired
  };
}

// Liberacao gradual: cada terminal cai numa faixa fixa de 0 a 99 por publicacao, entao aumentar o
// percentual so acrescenta terminais (quem ja recebia continua recebendo).
export function normalizeRolloutPercent(value, fallback = 100) {
  if (value === undefined || value === null || value === '') return fallback;
  const percent = Number(value);
  if (!Number.isInteger(percent) || percent < 1 || percent > 100) throw new Error('invalid_rollout_percent');
  return percent;
}

export function rolloutBucket(releaseId, terminalExternalId) {
  const digest = crypto
    .createHash('sha256')
    .update(`${releaseId}:${String(terminalExternalId).trim().toLowerCase()}`)
    .digest();
  return digest.readUInt32BE(0) % 100;
}

export function inRollout(release, terminalExternalId) {
  const percent = release?.rollout_percent ?? 100;
  return percent >= 100 || rolloutBucket(release.id, terminalExternalId) < percent;
}

export function normalizeFutureDeadline(value, now = Date.now()) {
  if (!value) throw new Error('deadline_required');
  const deadline = new Date(value);
  if (Number.isNaN(deadline.getTime())) throw new Error('deadline_required');
  if (deadline.getTime() <= now) throw new Error('deadline_must_be_future');
  return deadline.toISOString();
}
