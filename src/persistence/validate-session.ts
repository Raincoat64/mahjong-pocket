import {restoreRoundState} from '../engine/round';
import {MatchState} from '../engine/match';
import {PlayerId} from '../core/types';
import {CpuDifficulty} from '../ai/profiles';
import {TILE_TYPES} from '../core/tile';

function requireValue(condition: unknown): asserts condition {
  if(!condition)throw new Error('CORRUPT_SESSION_DATA');
}
const object=(x:any)=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const integer=(x:any)=>Number.isSafeInteger(x);
const id=(x:any)=>integer(x)&&x>=0&&x<=3;
const tile=(x:any)=>typeof x==='string'&&([...TILE_TYPES,'mr','pr','sr'] as string[]).includes(x);
const tiles=(x:any,max=136)=>Array.isArray(x)&&x.length<=max&&x.every(tile);
const scores=(x:any)=>Array.isArray(x)&&x.length===4&&x.every(integer);
const ids=(x:any)=>Array.isArray(x)&&x.length<=4&&x.every(id)&&new Set(x).size===x.length;
const optional=(x:any,validate:(value:any)=>boolean)=>x===undefined||validate(x);
const rng=(x:any)=>object(x)&&x.algorithm==='xorshift32'&&integer(x.state)&&x.state>=0&&x.state<=0xffffffff;
function responses(value:any,players:any[],actor:number,kan=false){
  requireValue(object(value));
  for(const [key,action] of Object.entries(value) as Array<[string,any]>){
    const player=Number(key);
    requireValue(id(player)&&String(player)===key&&player!==actor&&object(action));
    requireValue((kan?['PASS','RON']:['PASS','RON','CHI','PON','DAIMINKAN']).includes(action.type));
    if(action.type==='RON')requireValue(tile(action.tile));
    if(['CHI','PON','DAIMINKAN'].includes(action.type)){
      const indexes=action.consumeIndexes,consume=action.type==='DAIMINKAN'?3:2;
      requireValue(Array.isArray(indexes)&&indexes.length===consume&&new Set(indexes).size===consume&&indexes.every((i:any)=>integer(i)&&i>=0&&i<players[player].hand.length));
      requireValue(tile(action.calledTile)&&tiles(action.tiles,4)&&action.tiles.length===consume+1);
    }
  }
}

/** Validate before a deserialized value reaches renderers or the game controller. */
export function parseSession(serialized:string):{humanId:PlayerId;paused:boolean;difficulty:CpuDifficulty;match:MatchState} {
  let envelope:any;
  try{envelope=JSON.parse(serialized);}catch{throw new Error('CORRUPT_SESSION_DATA');}
  requireValue(object(envelope));
  if(envelope.schemaVersion!==1)throw new Error('UNSUPPORTED_SESSION_SCHEMA_VERSION');
  requireValue(id(envelope.humanId)&&typeof envelope.paused==='boolean');
  requireValue(envelope.difficulty===undefined||['weak','normal','strong'].includes(envelope.difficulty));
  const m=envelope.match;
  requireValue(object(m));
  if(m.schemaVersion!==1)throw new Error('UNSUPPORTED_MATCH_SCHEMA_VERSION');
  requireValue(['ONE_HAND','EAST_ONLY'].includes(m.mode)&&['PLAYING','ROUND_RESULT','MATCH_RESULT'].includes(m.phase));
  requireValue(typeof m.matchId==='string'&&integer(m.baseSeed)&&integer(m.roundSerial)&&m.roundSerial>=0&&id(m.initialDealer));
  requireValue(scores(m.scores)&&Array.isArray(m.history)&&Number.isFinite(m.createdAt)&&Number.isFinite(m.updatedAt));
  for(const entry of m.history)requireValue(object(entry)&&scores(entry.pointChanges)&&scores(entry.scoresAfter)&&optional(entry.winners,ids)&&optional(entry.loser,id));
  requireValue(object(m.round)&&Array.isArray(m.round.players)&&m.round.players.length===4&&object(m.round.wall));
  const r=restoreRoundState(JSON.stringify(m.round));
  requireValue(typeof r.gameId==='string'&&integer(r.seed)&&r.roundWind==='E'&&[1,2,3,4].includes(r.handNumber));
  requireValue(id(r.dealer)&&id(r.currentPlayer)&&integer(r.honba)&&r.honba>=0&&integer(r.riichiSticks)&&r.riichiSticks>=0);
  requireValue(['WAIT_DISCARD','DRAW','WAIT_CALL','WAIT_KAN_RON','WIN_RESOLUTION','DRAW_RESOLUTION','ROUND_RESULT'].includes(r.phase));
  requireValue(rng(r.rng)&&rng(r.wall.rng)&&tiles(r.wall.tiles)&&r.wall.tiles.length===136);
  requireValue(r.wall.deadWallStart===122&&integer(r.wall.drawIndex)&&r.wall.drawIndex>=0&&r.wall.drawIndex<=122);
  requireValue(integer(r.wall.rinshanDrawCount)&&r.wall.rinshanDrawCount>=0&&r.wall.rinshanDrawCount<=4);
  requireValue(integer(r.wall.revealedDoraCount)&&r.wall.revealedDoraCount>=1&&r.wall.revealedDoraCount<=5);
  requireValue(integer(r.callsMade)&&r.callsMade>=0&&typeof r.pendingKanDoraReveal==='boolean');
  for(const [index,p] of r.players.entries()){
    requireValue(object(p)&&p.id===index&&p.wind===['E','S','W','N'][(index-r.dealer+4)%4]);
    requireValue(integer(p.score)&&tiles(p.hand,14)&&Array.isArray(p.river)&&Array.isArray(p.melds)&&p.melds.length<=4);
    requireValue(['riichi','doubleRiichi','ippatsuEligible','temporaryFuriten','riichiFuriten'].every(k=>typeof (p as any)[k]==='boolean'));
    requireValue(tiles(p.postCallForbiddenTypes));
    for(const d of p.river)requireValue(object(d)&&tile(d.tile)&&typeof d.riichi==='boolean'&&typeof d.tsumogiri==='boolean'&&(d.calledBy===undefined||id(d.calledBy)));
    for(const meld of p.melds)requireValue(object(meld)&&['chi','pon','daiminkan','ankan','kakan'].includes(meld.type)&&tiles(meld.tiles,4)&&meld.tiles.length===(['chi','pon'].includes(meld.type)?3:4)&&(meld.type==='ankan'||(id(meld.calledFrom)&&tile(meld.calledTile))));
  }
  if(r.phase==='WAIT_CALL')requireValue(r.pendingDiscard);
  if(r.phase==='WAIT_KAN_RON')requireValue(r.pendingKan);
  if(r.pendingDiscard){
    const p=r.pendingDiscard;
    requireValue(object(p)&&id(p.discarder)&&tile(p.tile)&&integer(p.riverIndex)&&p.riverIndex>=0&&p.riverIndex<r.players[p.discarder].river.length&&typeof p.riichiDeclaration==='boolean');
    responses(p.responses,r.players,p.discarder);
  }
  if(r.pendingKan){
    const p=r.pendingKan;
    requireValue(object(p)&&id(p.playerId)&&tile(p.tile)&&integer(p.meldIndex)&&p.meldIndex>=0&&p.meldIndex<r.players[p.playerId].melds.length&&integer(p.tileIndex)&&p.tileIndex>=0&&p.tileIndex<r.players[p.playerId].hand.length);
    responses(p.responses,r.players,p.playerId,true);
  }
  if(r.winResult){requireValue(object(r.winResult)&&['RON','TSUMO'].includes(r.winResult.type)&&ids(r.winResult.winners)&&r.winResult.winners.length>0&&tile(r.winResult.winningTile)&&optional(r.winResult.pointChanges,scores));if(r.winResult.type==='RON')requireValue(id(r.winResult.loser));}
  if(r.drawResult)requireValue(object(r.drawResult)&&['EXHAUSTIVE','NAGASHI_MANGAN','KYUUSHU_KYUUHAI','FOUR_WINDS','FOUR_RIICHI','FOUR_KANS','TRIPLE_RON'].includes(r.drawResult.reason)&&optional(r.drawResult.tenpaiPlayers,ids)&&optional(r.drawResult.nagashiPlayers,ids)&&optional(r.drawResult.pointChanges,scores));
  if(r.phase==='WIN_RESOLUTION')requireValue(r.winResult);
  if(r.phase==='DRAW_RESOLUTION')requireValue(r.drawResult);
  if(m.phase==='ROUND_RESULT')requireValue(r.phase==='ROUND_RESULT'&&(r.winResult||r.drawResult)&&['REPEAT','ADVANCE','MATCH_END'].includes(m.pendingNext));
  if(m.phase==='MATCH_RESULT')requireValue(object(m.result)&&scores(m.result.scores)&&scores(m.result.ranks)&&m.result.ranks.every((n:number)=>n>=1&&n<=4)&&new Set(m.result.ranks).size===4&&ids(m.result.ranking)&&m.result.ranking.length===4);
  m.round=r;
  return {humanId:envelope.humanId,paused:envelope.paused,difficulty:envelope.difficulty??'normal',match:m};
}
