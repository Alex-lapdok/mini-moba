/* Mini MOBA v0.16: self-contained Web Audio effects, no external sound files. */
(() => {
  'use strict';
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  let ctx = null;
  let muted = false;
  let lastHit = 0;
  try { muted = localStorage.getItem('miniMobaMuted') === '1'; } catch (_) {}

  function context() {
    if (!AudioCtor || muted || document.hidden) return null;
    try {
      if (!ctx) ctx = new AudioCtor();
      if (ctx.state === 'suspended') ctx.resume().catch(()=>{});
      return ctx;
    } catch (_) { return null; }
  }
  function beep(start, end, duration, type='sine', volume=.11, delay=0) {
    const c = context();
    if (!c || c.state !== 'running') return;
    const t=c.currentTime+delay, osc=c.createOscillator(), gain=c.createGain();
    osc.type=type;
    osc.frequency.setValueAtTime(Math.max(35,start),t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(35,end),t+duration);
    gain.gain.setValueAtTime(.0001,t);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0002,volume),t+.012);
    gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
    osc.connect(gain);gain.connect(c.destination);
    osc.start(t);osc.stop(t+duration+.025);
  }
  const events = {
    sword(){beep(370,110,.13,'sawtooth',.065);beep(850,320,.07,'triangle',.045,.025);},
    magic(){beep(480,960,.19,'sine',.08);beep(720,360,.2,'triangle',.055,.06);},
    enemy(){beep(280,105,.16,'sawtooth',.065);},
    tower(){beep(210,85,.2,'triangle',.06);},
    hit(){
      const now=performance.now();
      if(now-lastHit<85)return;
      lastHit=now;beep(170,65,.085,'triangle',.055);
    },
    destroy(){beep(270,60,.42,'sawtooth',.11);beep(110,45,.36,'triangle',.09,.08);},
    creepDeath(){beep(220,75,.11,'triangle',.035);},
    purchase(){beep(680,930,.10,'sine',.07);beep(930,1260,.12,'sine',.06,.11);},
    victory(){
      [[523,0],[659,.16],[784,.32],[1047,.48]].forEach(([f,d])=>beep(f,f*1.01,.20,'triangle',.09,d));
    },
    defeat(){[[400,0],[330,.2],[220,.4]].forEach(([f,d])=>beep(f,f*.7,.24,'triangle',.08,d));}
  };
  window.MiniMobaSound = {
    play(name){if(events[name])events[name]();},
    unlock(){context();},
    muted(){return muted;},
    toggle(){
      muted=!muted;
      try{localStorage.setItem('miniMobaMuted',muted?'1':'0');}catch(_){}
      if(muted && ctx && ctx.state==='running')ctx.suspend().catch(()=>{});
      if(!muted)context();
      return muted;
    },
    suspend(){if(ctx&&ctx.state==='running')ctx.suspend().catch(()=>{});}
  };
})();
