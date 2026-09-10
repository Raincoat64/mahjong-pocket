import React from 'react';
const suits={m:'Man',p:'Pin',s:'Sou'};
const honors={E:'Ton',S:'Nan',W:'Shaa',N:'Pei',P:'Haku',F:'Hatsu',C:'Chun',back:'Back-Pocket'};
const labels={E:'東',S:'南',W:'西',N:'北',P:'白',F:'發',C:'中',back:'伏せ牌'};
export function tileLabel(code){return labels[code] || `${code[1]==='r'?'赤5':code[1]}${{m:'萬',p:'筒',s:'索'}[code[0]]}`;}
export function Tile({code,className='',...props}){
  const file=honors[code] || suits[code[0]]+(code[1]==='r'?'5-Dora':code[1]);
  return <img src={`./tiles/${file}.svg`} alt={tileLabel(code)} className={className} draggable="false" {...props}/>;
}
export function tileOrder(code){return honors[code]?30+Object.keys(honors).indexOf(code):({m:0,p:10,s:20}[code[0]]+Number(code[1]==='r'?5:code[1])+(code[1]==='r'?.01:0));}
