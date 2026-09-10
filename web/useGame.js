import {useEffect, useRef, useState} from 'react';
import core from '@pocket/majiang-core';
import {MajiangCoreCalculator} from '../src/adapter/majiang-core';
import {MahjongSession} from '../src/engine/session';
import {IndexedDbMatchSaveRepository} from '../src/persistence/repository';
import {buildTableViewModel} from '../src/ui/table-view-model';
import {captureMelds,detectMeldAnnouncement} from '../src/ui/meld-announcement';

const makeRepository=()=>new IndexedDbMatchSaveRepository('mahjong-pocket-preview', 'save', 'current-match');
function dependencies(repository) {
  const calculator = new MajiangCoreCalculator(core);
  return {repository, winValidator: calculator, settlementProvider: calculator};
}
export function useGame() {
  const repository=useRef(null);
  if(!repository.current)repository.current=makeRepository();
  const session = useRef(null), timer = useRef(null), locked = useRef(false), alive = useRef(true);
  const [version, redraw] = useState(0), [ready,setReady]=useState(false), [error,setError]=useState('');
  const [conflict,setConflict]=useState(false);
  const [screen,setScreen]=useState('home'), [busy,setBusy]=useState(false);
  const [announcement,setAnnouncement]=useState(null);
  const announcementTimer=useRef(null);
  function announce(before,current) {
    const event=detectMeldAnnouncement(before,current.match.round);
    if(!event)return false;
    clearTimeout(announcementTimer.current);
    setAnnouncement({...event,id:Date.now()});
    announcementTimer.current=setTimeout(()=>{if(alive.current)setAnnouncement(null);},1100);
    return true;
  }
  const refresh=()=>{if(alive.current)redraw(x=>x+1);};
  function fail(e) {
    console.error(e); clearTimeout(timer.current); session.current?.controller.pause();
    if(alive.current){
      const changed=e?.message==='SAVE_CONFLICT';
      setConflict(changed);
      setError(changed?'別の画面で保存が更新されました。最新の保存を開くと、この画面の未保存操作は置き換わります。残しておきたい場合は、先にデータを書き出してください。':'局面を保存・復元できませんでした。空き容量などを確認して再試行してください。');refresh();
    }
  }
  async function run(operation) {
    if(locked.current)return;
    locked.current=true;setBusy(true);
    try {await operation();refresh();} catch(e){fail(e);} finally {locked.current=false;if(alive.current)setBusy(false);}
  }
  function schedule(delay=90) {
    clearTimeout(timer.current);
    const current=session.current;
    if(!current || current.controller.paused || !alive.current)return;
    timer.current=setTimeout(async()=>{
      if(current!==session.current || current.controller.paused)return;
      if(locked.current){schedule(50);return;}
      let again=false, wait=90;
      await run(async()=>{
        const before=current.match.round.discardSerial||0;
        const beforeMelds=captureMelds(current.match.round);
        const stop=await current.advanceOneStep();
        again=!stop;
        wait=announce(beforeMelds,current)?1150:(current.match.round.discardSerial||0)>before?360:90;
      });
      if(again)schedule(wait);
    },delay);
  }
  useEffect(()=>{
    alive.current=true;
    (async()=>{
      try{
        const restored=await MahjongSession.restore(dependencies(repository.current));
        if(!alive.current)return;
        session.current=restored;
        if(restored){setScreen('table');refresh();schedule(360);}
      }catch(e){fail(e);}finally{if(alive.current)setReady(true);}
    })();
    const hide=()=>{
      if(document.visibilityState==='hidden'&&session.current){
        clearTimeout(timer.current);
        session.current.pause().then(refresh).catch(fail);
      }
    };
    document.addEventListener('visibilitychange',hide);
    return()=>{alive.current=false;clearTimeout(timer.current);clearTimeout(announcementTimer.current);document.removeEventListener('visibilitychange',hide);};
  },[]);
  const current=session.current;
  const vm=current?buildTableViewModel(current.match,current.humanId,current.controller.winValidator):null;
  return {
    ready,error,conflict,screen,busy,version,vm,announcement,session:current,paused:current?.controller.paused,
    setScreen,
    start:(mode,difficulty)=>run(async()=>{
      clearTimeout(timer.current);
      await current?.flush();
      const next=MahjongSession.createNew(Date.now()>>>0,dependencies(repository.current),{mode,difficulty});
      await next.saveNow();session.current=next;setScreen('table');schedule(360);
    }),
    act:action=>run(async()=>{const before=captureMelds(session.current.match.round);await session.current.applyHumanAction(action);schedule(announce(before,session.current)?1150:120);}),
    pause:()=>run(async()=>{clearTimeout(timer.current);await session.current.pause();}),
    resume:()=>run(async()=>{await session.current.resumeWithoutAdvancing();setScreen('table');schedule(360);}),
    home:()=>run(async()=>{clearTimeout(timer.current);await session.current?.pause();setScreen('home');}),
    next:()=>run(async()=>{
      session.current.controller.continueAfterRound();await session.current.saveNow();schedule(360);
    }),
    retry:()=>run(async()=>{
      if(session.current)await session.current.saveNow();
      else {session.current=await MahjongSession.restore(dependencies(repository.current));if(session.current)setScreen('table');}
      setError('');setConflict(false);
    }),
    restoreLatest:()=>run(async()=>{
      clearTimeout(timer.current);
      const nextRepository=makeRepository();
      const next=await MahjongSession.restore(dependencies(nextRepository));
      if(next)await next.pause();
      // Rebase only after successful restore; a failed read must not authorize
      // the old in-memory session to overwrite the newly read save.
      repository.current=nextRepository;session.current=next;
      setScreen(next?'table':'home');setError('');setConflict(false);
    }),
    exportSave:()=>run(async()=>{
      const data=session.current?.serialize() ?? await repository.current.load();
      if(!data)throw new Error('NO_SAVE');
      const url=URL.createObjectURL(new Blob([data],{type:'application/json'}));
      const link=document.createElement('a');link.href=url;link.download=`mahjong-save-${Date.now()}.json`;
      document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    }),
    resetUnreadable:()=>run(async()=>{
      await repository.current.archiveAndClear();session.current=null;setError('');setConflict(false);setScreen('home');
    })
  };
}
