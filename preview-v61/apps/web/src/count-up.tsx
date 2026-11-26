import { useLayoutEffect, useRef, useState } from 'react';

const numberText=(value:number)=>String(value);
const reducedMotion='(prefers-reduced-motion: reduce)';

export function CountUp({value,format=numberText}:{value:number|null;format?:(value:number)=>string}){
  const element=useRef<HTMLSpanElement>(null);
  const lastValue=useRef<number|null>(null);
  const [display,setDisplay]=useState<number|null>(value);
  useLayoutEffect(()=>{
    if(value===null){setDisplay(null);return}
    const target=value;
    const from=lastValue.current??(value>1?Math.max(1,Math.floor(value*.85)):value);
    lastValue.current=value;
    const media=matchMedia(reducedMotion);
    const token=getComputedStyle(element.current??document.documentElement).getPropertyValue('--motion-count-up').trim();
    const duration=parseFloat(token)*(token.endsWith('ms')?1:1000);
    if(media.matches||from===value||!(duration>0)){setDisplay(value);return}
    let frame=0;
    let start:number|undefined;
    setDisplay(from);
    const finish=()=>{
      cancelAnimationFrame(frame);
      setDisplay(value);
    };
    function tick(time:number){
      start??=time;
      const progress=Math.min((time-start)/duration,1);
      setDisplay(progress===1?target:Math.round(from+(target-from)*(1-Math.pow(1-progress,3))));
      if(progress<1)frame=requestAnimationFrame(tick);
    }
    frame=requestAnimationFrame(tick);
    if(typeof media.addEventListener==='function')media.addEventListener('change',finish);
    else media.addListener(finish);
    return ()=>{
      cancelAnimationFrame(frame);
      if(typeof media.removeEventListener==='function')media.removeEventListener('change',finish);
      else media.removeListener(finish);
    };
  },[value]);

  if(value===null)return <>—</>;
  return <><span className="visually-hidden">{format(value)}</span>
    <span ref={element} aria-hidden="true">{format(display??value)}</span></>;
}
