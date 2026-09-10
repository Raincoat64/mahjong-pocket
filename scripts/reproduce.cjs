const fs = require('node:fs');
const crypto = require('node:crypto');
const { MahjongSession } = require('../dist-test/engine/session.js');
const { MemoryMatchSaveRepository } = require('../dist-test/persistence/repository.js');
const { MajiangCoreCalculator } = require('../dist-test/adapter/majiang-core.js');

const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const timestamp = value => {
  if (!Number.isSafeInteger(value) || value < 0) throw Error('A non-negative integer now is required');
  return value;
};

/** Runs only explicit commands, using the same session and formal calculator as the app. */
async function reproduce(input) {
  if (input?.schemaVersion !== 1 || !input.initial || !Array.isArray(input.commands)) {
    throw Error('Expected schemaVersion:1, initial, and commands');
  }
  const repository = new MemoryMatchSaveRepository();
  const calculator = MajiangCoreCalculator.fromVendoredRuntime();
  const dependencies = { repository, winValidator: calculator, settlementProvider: calculator };
  let session;
  if (Object.hasOwn(input.initial, 'save')) {
    repository.value = JSON.stringify(input.initial.save);
    session = await MahjongSession.restore(dependencies);
  } else {
    const { seed, now, mode = 'ONE_HAND', difficulty = 'normal' } = input.initial;
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw Error('Invalid seed');
    if (!['ONE_HAND', 'EAST_ONLY'].includes(mode)) throw Error('Invalid mode');
    if (!['weak', 'normal', 'strong'].includes(difficulty)) throw Error('Invalid difficulty');
    session = MahjongSession.createNew(seed, dependencies, { now: timestamp(now), mode, difficulty });
  }
  const initialSave = session.serialize();
  const trace = [];
  for (const [index, command] of input.commands.entries()) {
    const entry = { index, command, beforeHash: hash(session.serialize()) };
    try {
      switch (command?.type) {
        case 'step': entry.stop = await session.advanceOneStep(timestamp(command.now)); break;
        case 'act': await session.applyHumanAction(command.action, timestamp(command.now)); break;
        case 'pause': await session.pause(); break;
        case 'resume': await session.resumeWithoutAdvancing(); break;
        case 'continue':
          session.controller.continueAfterRound(timestamp(command.now));
          await session.saveNow();
          break;
        default: throw Error('Unknown command type');
      }
    } catch (error) {
      entry.error = error instanceof Error ? error.message : String(error);
    }
    entry.afterHash = hash(session.serialize());
    trace.push(entry);
    if (entry.error) break;
  }
  return {
    schemaVersion: 1,
    appVersion: require('../package.json').version,
    inputHash: hash(JSON.stringify(input)),
    initialHash: hash(initialSave),
    success: !trace.some(entry => entry.error),
    trace,
    finalHash: hash(session.serialize()),
    finalSave: JSON.parse(session.serialize()),
    legalActions: session.controller.humanLegalActions()
  };
}

async function main(args) {
  if (args.length !== 4 || args[0] !== '--input' || args[2] !== '--output') {
    throw Error('Usage: node scripts/reproduce.cjs --input case.json --output report.json');
  }
  const report = await reproduce(JSON.parse(fs.readFileSync(args[1], 'utf8')));
  // Never replace the source case or an existing report accidentally.
  fs.writeFileSync(args[3], JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(`${report.success ? 'PASS' : 'REPRODUCED ERROR'}: ${report.trace.length} commands; final SHA256 ${report.finalHash}`);
  if (!report.success) process.exitCode = 1;
}

module.exports = { reproduce };
if (require.main === module) main(process.argv.slice(2)).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
