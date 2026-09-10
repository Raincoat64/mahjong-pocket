const test = require('node:test');
const assert = require('node:assert/strict');
const { reproduce } = require('../scripts/reproduce.cjs');

test('reproduction repeats explicit human actions and CPU checkpoints exactly', async () => {
  const input = {
    schemaVersion: 1,
    initial: { seed: 123, mode: 'ONE_HAND', difficulty: 'strong', now: 100 },
    commands: [
      { type: 'step', now: 101 },
      { type: 'act', now: 102, action: { type: 'DISCARD', tileIndex: 0 } },
      { type: 'step', now: 103 },
      { type: 'pause' },
      { type: 'step', now: 104 },
      { type: 'resume' },
      { type: 'step', now: 105 }
    ]
  };
  const first = await reproduce(input);
  assert.equal(first.success, true);
  assert.equal(first.trace[4].stop.reason, 'PAUSED');
  assert.equal(first.trace[4].beforeHash, first.trace[4].afterHash);
  assert.notEqual(first.initialHash, first.finalHash);
  assert.deepEqual(await reproduce(input), first);
});

test('reproduction can split at an exported save without changing the final checkpoint', async () => {
  const initial = { seed: 80, mode: 'ONE_HAND', now: 100 };
  const first = [{ type: 'act', now: 101, action: { type: 'DISCARD', tileIndex: 0 } }, { type: 'pause' }];
  const rest = [{ type: 'resume' }, { type: 'step', now: 102 }, { type: 'step', now: 103 }];
  const saved = await reproduce({ schemaVersion: 1, initial, commands: first });
  assert.equal(saved.success, true);
  const restored = await reproduce({ schemaVersion: 1, initial: { save: saved.finalSave }, commands: rest });
  const uninterrupted = await reproduce({ schemaVersion: 1, initial, commands: [...first, ...rest] });
  assert.equal(restored.success, true);
  assert.deepEqual(restored.finalSave, uninterrupted.finalSave);
  assert.equal(restored.finalHash, uninterrupted.finalHash);
});

test('reproduction reports the exact failing operation and does not execute later commands', async () => {
  const result = await reproduce({
    schemaVersion: 1, initial: { seed: 80, now: 100 },
    commands: [{ type: 'pause' }, { type: 'act', now: 101, action: { type: 'DISCARD', tileIndex: 0 } }, { type: 'resume' }]
  });
  assert.equal(result.success, false);
  assert.equal(result.trace.length, 2);
  assert.equal(result.trace[1].error, 'CONTROLLER_PAUSED');
  assert.equal(result.finalSave.paused, true);
});
