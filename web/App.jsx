import React,{useEffect,useRef,useState} from 'react';
import {useGame} from './useGame';
import {useOffline} from './useOffline';
import {Tile,tileOrder,tileLabel} from './tiles';
import layout from './layout.json';

const names={self:'あなた',right:'下家',top:'対面',left:'上家'};
const windName=wind=>({E:'東',S:'南',W:'西',N:'北'}[wind]||wind);
const seatName=id=>['あなた','下家','対面','上家'][id];
const label=a=>({CHI:'チー',PON:'ポン',DAIMINKAN:'カン',ANKAN:'暗槓',KAKAN:'加槓',RON:'ロン',TSUMO:'ツモ',PASS:'鳴かない',KYUUSHU_KYUUHAI:'九種九牌'}[a.type]||a.type);
function hud(key){const offset=layout.hudOffsets[key]||{x:0,y:0};return {'--hud-x':`${offset.x}px`,'--hud-y':`${offset.y}px`};}
const rootLayout=Object.fromEntries(Object.entries(layout.layout).map(([key,value])=>[key,`${value}px`]));
function Modal({children,className='',title}){
  const element=useRef(null);
  useEffect(()=>{
    const previous=document.activeElement;
    element.current?.focus();
    return()=>{if(previous?.isConnected)previous.focus();};
  },[]);
  const trapFocus=event=>{
    if(event.key!=='Tab')return;
    const focusable=[...element.current.querySelectorAll('button:not(:disabled),a[href],[tabindex="0"]')];
    const first=focusable[0],last=focusable.at(-1);
    if(!first){event.preventDefault();return;}
    if(event.shiftKey&&(document.activeElement===first||document.activeElement===element.current)){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===element.current)){event.preventDefault();first.focus();}
  };
  return <div className={`overlay show ${className}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={element} onKeyDown={trapFocus}><div className="modal">{children}</div></div>;
}
function River({river,self=false,hudKey,onInspect,disabled=false,title}){return <button className={`${self?'my-river':'river'} draggable-hud`} style={hud(hudKey)} onClick={onInspect} disabled={disabled} aria-label={`${title}の捨て牌を拡大`}>{river.map((d,i)=><span key={i} className={`river-tile ${d.riichi?'riichi':''}`}><Tile code={d.tile} className={`mini-tile ${d.latest?'latest-discard':''}`} title={`${d.turnNumber}巡目の打牌${d.riichi?'・リーチ宣言牌':''}`}/></span>)}</button>;}
function MeldArea({melds,self=false,hudKey}){return <div className={`melds draggable-hud ${self?'self-melds':''}`} style={hud(hudKey)}>{melds.map((m,i)=><div className="meld" key={i}>{m.tiles.map((code,j)=><Tile key={j} code={m.type==='ankan'&&(j===0||j===m.tiles.length-1)?'back':code} className={m.calledTile===code&&m.tiles.indexOf(code)===j?'called':''}/>)}</div>)}</div>;}
function OpponentSeat({seat,player,active,onInspect,disabled}){return <div className={`player p-${seat} ${player.melds.length?'has-melds':''}`}>
  <div className={`meta draggable-hud ${active?'active-turn-indicator':''}`} style={hud(`${seat}Score`)}><span className="wind">{windName(player.wind)}</span><span className="seat-name">{names[seat]}</span><span className="score">{player.score.toLocaleString()}</span></div>
  <div className="cpu-hand draggable-hud" style={hud(`${seat}Hand`)}>{player.hand.map((code,i)=><Tile key={i} code={code}/>)}</div>
  <River river={player.river} hudKey={`${seat}River`} title={names[seat]} onInspect={onInspect} disabled={disabled}/><MeldArea melds={player.melds} hudKey={`${seat}Meld`}/>
</div>;}
function ProgressStrip({vm}){return <div className="progress-strip"><div className="progress-main"><span className="progress-turn">{vm.currentTurn.turnNumber}巡目</span><span className="progress-state">{vm.callPrompt?`${names[vm.callPrompt.sourceSeat]}の打牌に応答`:vm.result?'対局結果':`${names[vm.currentTurn.seat]}の手番`}</span></div><div className="recent-discards"><span className="recent-label">直近の打牌</span>{vm.recentDiscards.map((d,i)=><span className={`recent-entry ${i===vm.recentDiscards.length-1?'latest':''}`} key={i}>{names[d.seat]} {d.turnNumber}<Tile code={d.tile}/>{d.calledBySeat&&`→${names[d.calledBySeat]}鳴き`}</span>)}</div></div>;}
function HintPanel({vm,settings}){
  const waits=codes=>codes.map((code,i)=><React.Fragment key={i}><Tile code={code}/>{settings.remaining&&<span className="count">×{vm.hint.visibleRemaining.get(code)||0}</span>}</React.Fragment>);
  return <div className="hint-panel draggable-hud" style={hud('hintPanel')}><div className="hint-head"><span className="hint-title">{vm.hint.shanten===0?'聴牌':`${Math.max(0,vm.hint.shanten)}向聴アシスト`}</span><span className="hint-sub">{vm.hint.shanten===0?'待ち牌':'打牌 → 聴牌後の待ち'}</span></div><div className="hint-options">{vm.hint.shanten===0&&settings.waits?<div className="hint-card selected">{waits(vm.hint.waits)}</div>:settings.discardHint&&vm.hint.discardToTenpai.slice(0,8).map((h,i)=><div className="hint-card" key={i}><Tile code={h.discard}/><span className="arrow">→</span>{waits(h.waits)}</div>)}</div></div>;
}
function Hand({game,riichiMode,selected,onSelect,onDiscard,settings,hint}){
  const round=game.session.match.round;
  const entries=round.players[0].hand.map((tile,index)=>({tile,index}));
  const drawn=round.phase==='WAIT_DISCARD'&&round.currentPlayer===0&&round.lastDrawnTile&&entries.length%3===2?entries.pop():null;
  entries.sort((a,b)=>tileOrder(a.tile)-tileOrder(b.tile));if(drawn)entries.push({...drawn,draw:true});
  const legal=riichiMode?game.vm.humanActions.riichi:game.vm.humanActions.discards;
  const recommended=new Set(game.vm.hint.discardToTenpai.map(h=>h.discardIndex));
  const selection=legal.find(a=>a.tileIndex===selected);
  return <div className="hand-area draggable-hud" style={hud('myHand')}>
    {selection&&settings.twoTap&&!game.paused&&<div className="selection-preview" role="status"><Tile code={selection.tile}/><span><strong>{tileLabel(selection.tile)}</strong><small>もう一度タップで{riichiMode?'リーチ':'打牌'}</small></span></div>}
    <div className="hand-row" id="hand">{entries.map(e=>{
    const action=legal.find(a=>a.tileIndex===e.index);
    return <button key={e.index} className={`tile-btn ${e.draw?'draw-gap':''} ${selected===e.index?'selected':''} ${(riichiMode&&action)||(!riichiMode&&hint&&settings.discardHint&&recommended.has(e.index))?'recommended':''}`} aria-label={`${tileLabel(e.tile)}${selected===e.index?'、選択中':''}`} aria-pressed={selected===e.index} disabled={!action||game.busy||game.paused} onClick={()=>settings.twoTap&&selected!==e.index?onSelect(e.index):onDiscard(action)}><Tile code={e.tile}/></button>;
  })}</div></div>;
}
function CallChooser({actions,onAct,onCancel,onPause,busy}){return <Modal title="鳴き・カンの選択" className="call-dialog"><h2>鳴き</h2><div className="modal-actions">{actions.map((a,i)=>{
  const tiles=a.tiles||(a.type==='ANKAN'?[a.tileType,a.tileType,a.tileType,a.tileType]:a.tile?[a.tile]:[]);
  return <button className="secondary call-choice" key={i} disabled={busy} onClick={()=>onAct(a)}><span className="call-choice-name">{label(a)}</span><span className="call-choice-tiles">{tiles.map((tile,j)=><Tile key={j} code={tile} className={a.calledTile===tile&&tiles.indexOf(tile)===j?'called-source':''}/>)}</span></button>;
  })}</div>{onCancel&&<button className="ghost" onClick={onCancel}>戻る</button>}<button className="ghost" disabled={busy} onClick={onPause}>中断</button></Modal>;}
function RoundResultModal({game}){
  const r=game.vm.result;
  const relation=r.type==='MATCH'?'対局終了':r.winType==='RON'?`${r.winners.map(seatName).join('・')}が${seatName(r.loser)}からロン`:r.winType==='TSUMO'?`${r.winners.map(seatName).join('・')}がツモ`:r.drawReason==='NAGASHI_MANGAN'?`${r.winners.map(seatName).join('・')}の流し満貫`:'流局';
  const matchFinished=r.type==='MATCH';
  const ids=matchFinished?[...game.session.match.result.ranking]:[0,1,2,3];
  return <Modal title="対局結果">
    <h2>{relation}</h2>
    {matchFinished?<p>おつかれさまでした。また、ひと息つくときに。</p>:r.winningTile&&<div className="result-winning-tile"><Tile code={r.winningTile}/></div>}
    <div className="result-score-list">{ids.map(id=><div className={`result-score-row ${r.winners?.includes(id)?'winner':''} ${r.loser===id?'loser':''}`} key={id}>
      <span className="result-score-name">{matchFinished&&<span className="result-rank">{r.ranks[id]}位</span>}{seatName(id)}</span>
      {matchFinished?<span className="result-score-delta">{r.scores[id].toLocaleString()}点</span>:<>
        <span className={`result-score-delta ${(r.pointChanges?.[id]||0)>0?'positive':(r.pointChanges?.[id]||0)<0?'negative':''}`}>{(r.pointChanges?.[id]||0)>0?'+':''}{(r.pointChanges?.[id]||0).toLocaleString()}点</span>
        <span className="result-score-final">→ {(r.scores?.[id]??game.session.match.scores[id]).toLocaleString()}点</span>
      </>}
    </div>)}</div>
    <div className="modal-actions">
      {game.session.match.phase==='ROUND_RESULT'&&<button className="primary" disabled={game.busy} onClick={game.next}>{game.session.match.pendingNext==='MATCH_END'?'最終結果へ':'次の局へ'}</button>}
      <button className="secondary" disabled={game.busy} onClick={game.home}>ホームへ</button>
    </div>
  </Modal>;
}
function TableScreen({game,settings}){
  const [selected,setSelected]=useState(null),[riichiMode,setRiichiMode]=useState(false),[hint,setHint]=useState(true),[kans,setKans]=useState(null);
  const [inspectedSeat,setInspectedSeat]=useState(null);
  const vm=game.vm;
  const inspect=seat=>{setInspectedSeat(seat);game.pause();};
  const act=a=>{setSelected(null);setRiichiMode(false);setKans(null);game.act(a);};
  const selfKans=vm.humanActions.all.filter(a=>['ANKAN','KAKAN'].includes(a.type));
  const extra=vm.humanActions.all.filter(a=>['TSUMO','KYUUSHU_KYUUHAI'].includes(a.type));
  return <section id="table" className="screen active">
    <div className="table-topbar"><div className="round-info draggable-hud" style={hud('roundInfo')}><strong>{vm.roundLabel}</strong><span>{vm.honba}本場 · 供託{vm.riichiSticks}</span></div><button id="pauseBtn" className="icon-btn" disabled={game.busy} onClick={game.pause}>中断</button></div>
    <ProgressStrip vm={vm}/>
    <div className="table-zone">{['top','left','right'].map(seat=><OpponentSeat key={seat} seat={seat} player={vm.players[seat]} active={vm.currentTurn.seat===seat} onInspect={()=>inspect(seat)} disabled={game.busy||game.paused}/>)}
      {game.announcement&&!game.paused&&<div className="call-announcement" role="status" aria-live="polite" key={game.announcement.id}><span>{seatName(game.announcement.playerId)}</span><strong>{game.announcement.label}</strong>{game.announcement.detail&&<small>{game.announcement.detail}</small>}</div>}
      <div className="center-board draggable-hud" style={hud('centerBoard')}><div><div className="big">{vm.roundLabel}</div><div className="wall-count"><span>残り</span><strong>{vm.remainingTiles}</strong><span>枚</span></div><div className="dora-row" aria-label="ドラ表示牌">{vm.doraIndicators.map((code,i)=><Tile code={code} className="mini-tile" key={i}/>)}</div></div></div>
      <div className={`my-river-wrap ${vm.players.self.melds.length?'has-melds':''}`}><div className={`me-meta draggable-hud ${vm.currentTurn.seat==='self'?'active-turn-indicator':''}`} style={hud('myScore')}><span>あなた（{windName(vm.players.self.wind)}家）</span><span className="score">{vm.players.self.score.toLocaleString()}</span></div><div className="label">あなたの河</div><River self river={vm.players.self.river} hudKey="myRiver" title="あなた" onInspect={()=>inspect('self')} disabled={game.busy||game.paused}/></div><MeldArea self melds={vm.players.self.melds} hudKey="selfMeld"/>
    </div>
    {hint&&<HintPanel vm={vm} settings={settings}/>}
    <Hand game={game} settings={settings} hint={hint} selected={selected} onSelect={setSelected} onDiscard={act} riichiMode={riichiMode}/>
    <div className="action-bar draggable-hud" style={hud('actionBar')}>
      {extra.map(a=><button key={a.type} disabled={game.busy||game.paused} onClick={()=>act(a)}>{label(a)}</button>)}
      {!!selfKans.length&&<button disabled={game.busy||game.paused} onClick={()=>setKans(selfKans)}>カン</button>}
      {!!vm.humanActions.riichi.length&&<button className={riichiMode?'highlight':''} disabled={game.busy||game.paused} onClick={()=>{setRiichiMode(!riichiMode);setSelected(null);}}>{riichiMode?'リーチ取消':'リーチ'}</button>}
      <button onClick={()=>setHint(!hint)}>支援 {hint?'ON':'OFF'}</button>{Array.from({length:Math.max(0,3-extra.length-Number(!!selfKans.length)-Number(!!vm.humanActions.riichi.length))},(_,i)=><button key={`empty-${i}`} disabled aria-hidden="true">—</button>)}
    </div>
    {vm.result&&!game.paused&&<RoundResultModal game={game}/>}
    {(vm.callPrompt||kans)&&!game.paused&&!vm.result&&<CallChooser actions={vm.callPrompt?.choices||kans} onAct={act} onPause={game.pause} onCancel={vm.callPrompt?null:()=>setKans(null)} busy={game.busy}/>}
    {game.paused&&inspectedSeat&&!game.error&&<Modal title="捨て牌の確認">
      <h2>{names[inspectedSeat]}の捨て牌</h2><p>確認中は対局を止めています。</p>
      <div className="river-detail">{vm.players[inspectedSeat].river.map((d,i)=><div key={i}><Tile code={d.tile}/><small>{d.turnNumber}巡{d.riichi?' · 立直':''}</small></div>)}</div>
      {!!vm.players[inspectedSeat].melds.length&&<><h3 className="detail-heading">副露・カン</h3><div className="detail-melds">{vm.players[inspectedSeat].melds.map((m,i)=><div key={i}>{m.tiles.map((code,j)=><Tile key={j} code={m.type==='ankan'&&(j===0||j===m.tiles.length-1)?'back':code}/>)}</div>)}</div></>}
      <div className="modal-actions"><button className="primary" disabled={game.busy} onClick={()=>{setInspectedSeat(null);game.resume();}}>対局を続ける</button><button className="ghost" onClick={()=>setInspectedSeat(null)}>中断したまま閉じる</button></div>
    </Modal>}
    {game.paused&&!inspectedSeat&&!game.error&&<Modal title="中断中"><h2>中断中</h2><p><span className="saved">● 現在の局面は保存済み</span><br/>次回もこの場面から再開します。</p><div className="modal-actions"><button id="continueBtn" className="primary" disabled={game.busy} onClick={game.resume}>対局を続ける</button><button className="secondary" disabled={game.busy} onClick={game.home}>保存してホームへ</button></div></Modal>}
  </section>;
}
const offlineLabel=status=>({ready:'オフライン準備完了',preparing:'オフライン準備中',unavailable:'オフラインの準備を確認',development:'開発用プレビュー'}[status]);
function OfflineInfo({offline}){return <div className="card"><h3>オフライン</h3><p role="status" data-offline-status={offline.status}>{offlineLabel(offline.status)}</p>
  {offline.status==='unavailable'&&<><p>通信できる状態で、もう一度準備してください。</p><button className="secondary" onClick={offline.retry}>準備を再試行</button></>}
  {offline.updateReady&&<p>最新版の準備ができました。開いているこのアプリの画面をすべて閉じると、次回から切り替わります。</p>}
</div>;}
function HomeScreen({game,difficulty,setDifficulty,offline}){return <section id="home" className="screen active">
  <header className="home-header"><span className="wordmark">MAHJONG<span>POCKET</span></span><button className="settings-button" aria-label="設定" onClick={()=>game.setScreen('settings')}>設定 <span aria-hidden="true">↗</span></button></header>
  <div className="home-hero"><p className="eyebrow">A LITTLE TIME, A GOOD HAND.</p><h1>ひと息、<br/>一局。</h1><p className="hero-description">忙しい毎日に、麻雀の余白を。<br/>いつでも中断。続きは、ここから。</p><div className="hero-tiles" aria-hidden="true"><Tile code="s1"/><Tile code="C"/><Tile code="p1"/></div></div>
  <div className="home-actions">{game.session&&<button className="resume-card" disabled={game.busy} onClick={game.resume}><span className="resume-dot"/><span>保存した局面から再開<small>{game.vm.roundLabel} · {game.vm.currentTurn.turnNumber}巡目</small></span><span className="mode-arrow">↗</span></button>}
    <button className="mode-card primary" data-start="single" disabled={game.busy} onClick={()=>game.start('ONE_HAND',difficulty)}><span><small>QUICK PLAY</small><strong>1局だけ</strong><span className="mode-description">ちょっとした空き時間に</span></span><span className="mode-arrow">→</span></button>
    <button className="mode-card secondary" data-start="east" disabled={game.busy} onClick={()=>game.start('EAST_ONLY',difficulty)}><span><small>EAST ROUND</small><strong>東風戦</strong><span className="mode-description">もう少し、じっくりと</span></span><span className="mode-arrow">→</span></button>
  </div><div className="difficulty"><div className="difficulty-title">CPUの強さ<span>あなたのペースで</span></div><div className="segmented">{[['weak','弱い'],['normal','普通'],['strong','強い']].map(([value,text])=><button key={value} aria-pressed={difficulty===value} className={difficulty===value?'active':''} onClick={()=>setDifficulty(value)}>{text}</button>)}</div></div>
  <footer className="home-footer"><button onClick={()=>game.setScreen('settings')} data-offline-status={offline.status}>{offlineLabel(offline.status)}</button><span>局面を自動保存</span></footer>
</section>;}
const defaultSettings={waits:true,discardHint:true,remaining:true,twoTap:true};
export function App(){
  const game=useGame();
  const offline=useOffline();
  const [difficulty,setDifficulty]=useState('normal');
  const [settings,setSettings]=useState(()=>{try{return {...defaultSettings,...JSON.parse(localStorage.getItem('mahjong-settings')||'{}')}}catch{return defaultSettings}});
  const change=(key)=>{const next={...settings,[key]:!settings[key]};setSettings(next);try{localStorage.setItem('mahjong-settings',JSON.stringify(next));}catch{}};
  return <div className="app" style={rootLayout}>
    {!game.ready?<p className="loading">局面を読み込んでいます…</p>:game.screen==='table'&&game.vm?<TableScreen game={game} settings={settings}/>:game.screen==='settings'?<section id="settings" className="screen active"><div className="page-header"><button className="icon-btn" onClick={()=>game.setScreen('home')}>←</button><h2>設定</h2></div><div className="card"><h3>プレイ支援・操作</h3>{[['waits','待ち牌表示'],['discardHint','聴牌になる打牌候補'],['remaining','見えている残り枚数'],['twoTap','2タップ打牌']].map(([key,text])=><div className="row" key={key}><label>{text}</label><button role="switch" aria-label={text} aria-checked={settings[key]} className={`switch ${settings[key]?'on':''}`} onClick={()=>change(key)}/></div>)}</div><OfflineInfo offline={offline}/><div className="card"><h3>このアプリについて</h3><p>CPUと遊ぶ四人麻雀です。局面はこの端末に保存します。</p><a className="settings-link" href="./licenses.txt" target="_blank" rel="noreferrer">ライセンス</a></div></section>:<HomeScreen game={game} difficulty={difficulty} setDifficulty={setDifficulty} offline={offline}/>}
    {game.error&&<Modal title="保存の確認" className="error-dialog"><h2>保存を確認してください</h2><p>{game.error}</p><div className="modal-actions"><button className="primary" disabled={game.busy} onClick={game.conflict?game.restoreLatest:game.retry}>{game.conflict?'最新の保存を開く':'再試行'}</button><button className="secondary" disabled={game.busy} onClick={game.exportSave}>データを書き出す</button>{!game.session&&!game.conflict&&<button className="ghost" disabled={game.busy} onClick={()=>{if(window.confirm('読み込めないデータを端末内に退避し、ホームへ戻ります。続けますか？'))game.resetUnreadable();}}>データを退避してホームへ</button>}</div></Modal>}
  </div>;
}



