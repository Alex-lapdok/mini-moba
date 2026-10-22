/* Yandex Games SDK lifecycle, with safe offline fallback. */
(() => {
  'use strict';
  let api=null, initPromise=null, readyWanted=false, readySent=false;
  let playingWanted=false, playingSent=false;
  const callbacks=new Set();
  const isLocal=location.protocol==='file:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname) || location.hostname.endsWith('.github.io');
  function requestSDK() {
    if (typeof window.YaGames!=='undefined') return Promise.resolve();
    return new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='/sdk.js'; script.async=true;
      script.onload=()=>resolve();
      script.onerror=()=>reject(new Error('Yandex SDK loader unavailable'));
      document.head.appendChild(script);
    });
  }
  function flush(){
    if(!api)return;
    if(readyWanted&&!readySent){
      try{api.features?.LoadingAPI?.ready();readySent=true;}catch(e){console.warn('Yandex ready:',e);}
    }
    if(!readySent)return;
    if(playingWanted!==playingSent){
      try{
        if(playingWanted)api.features?.GameplayAPI?.start();
        else api.features?.GameplayAPI?.stop();
        playingSent=playingWanted;
      }catch(e){console.warn('Yandex gameplay:',e);}
    }
  }
  async function init(){
    if(initPromise)return initPromise;
    initPromise=(async()=>{
      if(isLocal)return null;
      await requestSDK();
      api=await window.YaGames.init();
      window.ysdk=api;
      if(typeof api.on==='function'){
        api.on('game_api_pause',()=>callbacks.forEach(fn=>fn(true,'sdk')));
        api.on('game_api_resume',()=>callbacks.forEach(fn=>fn(false,'sdk')));
      }
      flush();
      return api;
    })().catch(err=>{console.info('SDK unavailable; local gameplay continues:',err.message);return null;});
    return initPromise;
  }
  function ready(){readyWanted=true;flush();}
  function playing(active){playingWanted=!!active;flush();}
  // Request an interstitial ad only at a natural match boundary.
  // The platform may decide not to show it; errors must not block gameplay.
  function showInterstitial(){
    return new Promise(resolve=>{
      const sdk=api;
      if(!sdk?.adv || typeof sdk.adv.showFullscreenAdv!=='function'){
        resolve(false);return;
      }
      let finished=false;
      const finish=shown=>{if(finished)return;finished=true;resolve(!!shown);};
      try{
        sdk.adv.showFullscreenAdv({callbacks:{
          onOpen:()=>callbacks.forEach(fn=>fn(true,'advertisement')),
          onClose:wasShown=>{
            callbacks.forEach(fn=>fn(false,'advertisement'));
            finish(wasShown);
          },
          onError:error=>{
            console.warn('Interstitial ad unavailable:',error);
            callbacks.forEach(fn=>fn(false,'advertisement'));
            finish(false);
          },
          onOffline:()=>{
            callbacks.forEach(fn=>fn(false,'advertisement'));
            finish(false);
          }
        }});
      }catch(error){console.warn('Interstitial call failed:',error);finish(false);}
    });
  }
  function onPlatformPause(fn){callbacks.add(fn);return()=>callbacks.delete(fn);}
  window.MiniMobaSDK={init,ready,playing,onPlatformPause,showInterstitial,get api(){return api;}};
  init();
})();
