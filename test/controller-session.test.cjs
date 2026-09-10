const test = require('node:test');
const assert = require('node:assert/strict');
const { createMatch } = require('../dist-test/engine/match.js');
const { GameController } = require('../dist-test/engine/controller.js');
const { MahjongSession } = require('../dist-test/engine/session.js');
const { MemoryMatchSaveRepository, SerialSaveQueue } = require('../dist-test/persistence/repository.js');

const fakeSettlement = {
  settleWin(round) {
    const c = [0,0,0,0];
    const w = round.winResult.winners[0];
    const l = round.winResult.loser;
    if (l == null) {
      for (let i=0;i<4;i++) if (i!==w) { c[i]-=2000; c[w]+=2000; }
    } else { c[w]+=8000; c[l]-=8000; }
    return { pointChanges:c };
  }
};

test('controller stops immediately for human dealer discard decision', () => {
  const c = new GameController(createMatch({seed:11,now:100}), { humanId:0, settlementProvider:fakeSettlement });
  const stop = c.advanceUntilHumanDecision(200);
  assert.equal(stop.reason, 'HUMAN_ACTION');
  assert.ok(stop.legalActions.some(a=>a.type==='DISCARD'));
});

test('controller auto-advances CPU dealer until human has a real decision', () => {
  const c = new GameController(createMatch({seed:12,now:100,initialDealer:1}), { humanId:0, settlementProvider:fakeSettlement });
  const stop = c.advanceUntilHumanDecision(200);
  assert.equal(stop.reason, 'HUMAN_ACTION');
  assert.ok(stop.legalActions.length > 0);
  assert.ok(c.match.round.players.some(p=>p.river.length>0) || c.match.round.currentPlayer===0);
});

test('pause prevents auto progression and resume restores it', () => {
  const c = new GameController(createMatch({seed:13,now:100}), { humanId:0, settlementProvider:fakeSettlement });
  c.pause();
  assert.equal(c.advanceUntilHumanDecision(200).reason, 'PAUSED');
  c.resume();
  assert.equal(c.advanceUntilHumanDecision(201).reason, 'HUMAN_ACTION');
});

test('session autosaves and restores exact match state', async () => {
  const repo = new MemoryMatchSaveRepository();
  const deps = { repository: repo, settlementProvider: fakeSettlement };
  const s = MahjongSession.createNew(14, deps, {now:100});
  const stop = await s.advance(200);
  assert.equal(stop.reason, 'HUMAN_ACTION');
  const action = stop.legalActions.find(a=>a.type==='DISCARD');
  assert.ok(action);
  await s.act(action, 201);
  await s.flush();
  const snapshot = s.serialize();
  const restored = await MahjongSession.restore(deps);
  assert.ok(restored);
  assert.equal(restored.serialize(), snapshot);
});

test('serial save queue cannot let an older slow write overwrite a newer state', async () => {
  const writes=[];
  const repo={
    async load(){return null}, async clear(){},
    async save(v){
      if(v==='old') await new Promise(r=>setTimeout(r,20));
      writes.push(v);
    }
  };
  const q = new SerialSaveQueue(repo);
  q.enqueue('old');
  q.enqueue('new');
  await q.flush();
  assert.deepEqual(writes,['old','new']);
});


test('controller advanceOneStep advances at most one automatic transition', () => {
  const match=createMatch({seed:333,now:100});
  const controller=new GameController(match,{humanId:1});
  const before=match.round.players[0].river.length;
  // Dealer 0 starts at WAIT_DISCARD, so one automatic step must be exactly one CPU discard.
  const stop=controller.advanceOneStep(101);
  assert.equal(stop,null);
  assert.equal(match.round.players[0].river.length,before+1);
  assert.equal(match.round.phase,'WAIT_CALL');
});

test('session saves visible CPU discard and resumes without skipping any turn', async () => {
  const repo = new MemoryMatchSaveRepository();
  const deps = {repository: repo, settlementProvider: fakeSettlement};
  const session = MahjongSession.createNew(333, deps, {humanId: 1, now: 100});
  await session.advanceOneStep(101);
  assert.equal(session.match.round.phase, 'WAIT_CALL');
  const checkpoint = JSON.stringify(session.match);
  await session.pause();
  const restored = await MahjongSession.restore(deps);
  assert.equal(restored.controller.paused, true);
  assert.equal(JSON.stringify(restored.match), checkpoint);
  assert.equal((await restored.advanceOneStep(102)).reason, 'PAUSED');
  await restored.resumeWithoutAdvancing();
  assert.equal(JSON.stringify(restored.match), checkpoint);
  assert.equal((await MahjongSession.restore(deps)).controller.paused, false);
});

test('checkpoint save failure reaches caller and a later save can recover', async () => {
  const repo = new MemoryMatchSaveRepository();
  const saved = repo.save.bind(repo);
  let fail = true;
  repo.save = async value => { if (fail) throw new Error('quota'); await saved(value); };
  const session = MahjongSession.createNew(333, {repository: repo}, {humanId: 1, now: 100});
  await assert.rejects(session.advanceOneStep(101), /quota/);
  fail = false;
  await session.pause();
  const restored = await MahjongSession.restore({repository: repo});
  assert.equal(restored.serialize(), session.serialize());
});

test('waiting for a human decision does not issue another write of unchanged state', async () => {
  const repository=new MemoryMatchSaveRepository();
  const session=MahjongSession.createNew(333,{repository},{now:100});
  await session.saveNow();
  const before=repository.value;
  repository.save=async()=>{throw new Error('unexpected unchanged-state write');};
  assert.equal((await session.advanceOneStep(101)).reason,'HUMAN_ACTION');
  assert.equal(repository.value,before);
});
