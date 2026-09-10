import {LegalAction, PlayerId, RoundState} from '../core/types';
import {tileType, isHonor, tileRank} from '../core/tile';
import {calculateShanten} from '../hint/shanten';
import {getLegalActions} from '../engine/round';
import {WinValidator} from '../rules/action-rules';
import {chooseNormalTurnAction, chooseNormalResponseActionForState} from './action-policy';

export type CpuDifficulty = 'weak' | 'normal' | 'strong';

export function chooseProfileResponseAction(state: RoundState, playerId: PlayerId, actions: readonly LegalAction[], difficulty: CpuDifficulty): LegalAction {
  if(difficulty!=='strong')return chooseNormalResponseActionForState(state,playerId,actions);
  const player=state.players[playerId];
  const filtered=actions.filter(action=>{
    if(action.type!=='CHI'&&action.type!=='PON')return true;
    const remaining=player.hand.filter((_,index)=>!action.consumeIndexes.includes(index));
    const all=[...remaining,...player.melds.flatMap(m=>m.tiles),...action.tiles];
    if(all.every(t=>!isHonor(t)&&tileRank(t)>1&&tileRank(t)<9))return true;
    const yakuhai=['P','F','C',state.roundWind,player.wind];
    return yakuhai.some(type=>all.filter(t=>tileType(t)===type).length>=3);
  });
  return chooseNormalResponseActionForState(state,playerId,filtered);
}

/** Only own hand, legal actions, and public discards/riichi flags affect choice. */
export function chooseProfileTurnAction(state: RoundState, playerId: PlayerId, validator: WinValidator, difficulty: CpuDifficulty): LegalAction {
  const normal = chooseNormalTurnAction(state, playerId, validator);
  if (difficulty === 'normal' || normal.type === 'TSUMO' || normal.type === 'KYUUSHU_KYUUHAI') return normal;
  const legal = getLegalActions(state, playerId, validator);
  const discards = legal.filter((a): a is Extract<LegalAction,{type:'DISCARD'}> => a.type === 'DISCARD');
  if (!discards.length) return normal;
  const self = state.players[playerId];
  if (difficulty === 'weak') {
    // Deterministic occasional mistakes; no wall/seed/hidden-hand access.
    const publicTurn = self.river.length;
    if (publicTurn % 3 !== 1) return normal;
    return discards[(publicTurn + self.hand.length) % discards.length];
  }
  const threats = state.players.filter(p => p.id !== playerId && p.riichi);
  if (threats.length && calculateShanten(self.hand,self.melds.length) >= 2) {
    const safe = discards.filter(a => threats.every(p => p.river.some(d => tileType(d.tile) === tileType(a.tile))));
    if (safe.length) {
      safe.sort((a,b) => {
        const after = (index:number) => calculateShanten(self.hand.filter((_,i)=>i!==index),self.melds.length);
        return after(a.tileIndex)-after(b.tileIndex) || a.tileIndex-b.tileIndex;
      });
      return safe[0];
    }
  }
  return normal;
}
