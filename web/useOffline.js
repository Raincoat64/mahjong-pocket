import {useEffect,useRef,useState} from 'react';

export function useOffline(){
  const [status,setStatus]=useState('preparing');
  const [updateReady,setUpdateReady]=useState(false);
  const alive=useRef(true);
  const change=value=>{if(alive.current)setStatus(value);};
  async function checkCache(worker){
    if(!worker)return false;
    return new Promise(resolve=>{
      const channel=new MessageChannel();
      const finish=ready=>{clearTimeout(timeout);channel.port1.close();resolve(ready);};
      const timeout=setTimeout(()=>finish(false),4000);
      channel.port1.onmessage=event=>finish(event.data?.ready===true);
      worker.postMessage({type:'CHECK_OFFLINE'},[channel.port2]);
    });
  }
  async function prepare(){
    if(!import.meta.env.PROD){change('development');return;}
    if(!('serviceWorker' in navigator)||!window.isSecureContext){change('unavailable');return;}
    change('preparing');
    try{
      const scope=new URL('./',window.location.href).href;
      const existing=await navigator.serviceWorker.getRegistration(scope);
      // GitHub Pages projects share an origin: a broader site's worker is not ours.
      const registration=existing?.scope===scope?existing:await navigator.serviceWorker.register('./sw.js',{scope:'./'});
      const inspect=async()=>{
        const ready=await checkCache(registration.active);
        change(ready?'ready':registration.installing?'preparing':'unavailable');
        if(alive.current)setUpdateReady(!!registration.waiting);
      };
      const watch=()=>{
        const worker=registration.installing;
        worker?.addEventListener('statechange',()=>{
          if(['installed','activated','redundant'].includes(worker.state))inspect();
        });
      };
      registration.onupdatefound=watch;
      watch();await inspect();
      // A network update failure does not invalidate an already complete offline cache.
      await registration.update().catch(()=>{});
    }catch{change('unavailable');}
  }
  useEffect(()=>{
    alive.current=true;prepare();
    return()=>{alive.current=false;};
  },[]);
  return {status,updateReady,retry:prepare};
}
