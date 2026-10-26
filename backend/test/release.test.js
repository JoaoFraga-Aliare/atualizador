import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getReleasePolicy,
  inRollout,
  normalizeFutureDeadline,
  normalizeRolloutPercent,
  rolloutBucket
} from '../src/release.js';

const now = Date.parse('2026-08-24T12:00:00.000Z');

test('keeps an optional release optional before its deadline', () => {
  assert.deepEqual(getReleasePolicy({ mandatory: 0, deadline_at: '2026-08-25T12:00:00.000Z' }, now), {
    mandatory: false,
    mandatoryReason: null,
    deadlineExpired: false
  });
});

test('makes an optional release mandatory after its deadline', () => {
  assert.deepEqual(getReleasePolicy({ mandatory: 0, deadline_at: '2026-08-23T12:00:00.000Z' }, now), {
    mandatory: true,
    mandatoryReason: 'deadline',
    deadlineExpired: true
  });
});

test('keeps a configured mandatory release mandatory before its deadline', () => {
  assert.equal(
    getReleasePolicy({ mandatory: 1, deadline_at: '2026-08-25T12:00:00.000Z' }, now).mandatoryReason,
    'configured'
  );
});

test('requires a valid future deadline', () => {
  assert.equal(normalizeFutureDeadline('2026-08-25T12:00:00.000Z', now), '2026-08-25T12:00:00.000Z');
  assert.throws(() => normalizeFutureDeadline('', now), /deadline_required/);
  assert.throws(() => normalizeFutureDeadline('2026-08-23T12:00:00.000Z', now), /deadline_must_be_future/);
});

test('rollout buckets are stable and only grow with the percentage', () => {
  assert.equal(normalizeRolloutPercent(undefined), 100);
  assert.equal(normalizeRolloutPercent('25'), 25);
  assert.throws(() => normalizeRolloutPercent('0'), /invalid_rollout_percent/);
  assert.throws(() => normalizeRolloutPercent(12.5), /invalid_rollout_percent/);
  assert.equal(rolloutBucket(7, 'Terminal-A'), rolloutBucket(7, ' terminal-a '));
  const ids = Array.from({ length: 200 }, (_, i) => `t-${i}`);
  const at = percent => ids.filter(id => inRollout({ id: 7, rollout_percent: percent }, id));
  assert.ok(at(10).every(id => at(50).includes(id)));
  assert.equal(at(100).length, ids.length);
  assert.ok(at(50).length > 60 && at(50).length < 140);
});
