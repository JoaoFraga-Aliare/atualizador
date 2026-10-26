export function compareVersions(a, b) {
  const normalize = value =>
    String(value || '')
      .trim()
      .replace(/^v/i, '')
      .split(/[.+-]/)
      .map(part => (/^\d+$/.test(part) ? Number(part) : part.toLowerCase()));
  const left = normalize(a);
  const right = normalize(b);
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    const x = left[i] ?? 0;
    const y = right[i] ?? 0;
    if (x === y) continue;
    if (typeof x === 'number' && typeof y === 'number') return x > y ? 1 : -1;
    return String(x).localeCompare(String(y), 'en', { numeric: true });
  }
  return 0;
}

export function isRegressionAfterFix(hashStatus, currentVersion, fixedVersion) {
  if (hashStatus === 'unauthorized') return false;
  return Boolean(currentVersion && fixedVersion) && compareVersions(currentVersion, fixedVersion) >= 0;
}
