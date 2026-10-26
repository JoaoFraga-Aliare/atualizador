import test from 'node:test';
import assert from 'node:assert/strict';
import { getReleasePolicy, normalizeFutureDeadline } from '../src/release.js';

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
