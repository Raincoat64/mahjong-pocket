import {RoundState} from '../core/types';

export function captureMelds(round: RoundState) {
  return {gameId: round.gameId, players: round.players.map(p => p.melds.map(m => m.type))};
}
export function detectMeldAnnouncement(before: ReturnType<typeof captureMelds>, round: RoundState) {
  if (before.gameId !== round.gameId) return null;
  for (const player of round.players) {
    for (let index = 0; index < player.melds.length; index++) {
      const type = player.melds[index].type;
      if (before.players[player.id]?.[index] === type) continue;
      return {playerId: player.id, label: type === 'chi' ? 'チー' : type === 'pon' ? 'ポン' : 'カン',
        detail: type === 'ankan' ? '暗槓' : type === 'kakan' ? '加槓' : type === 'daiminkan' ? '大明槓' : ''};
    }
  }
  return null;
}
