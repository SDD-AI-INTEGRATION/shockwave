import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';

export function FloatingPopover({anchor,onDismiss,children,className='',id,label,alignment='start',minimumWidth}:{
  anchor:RefObject<HTMLElement>;onDismiss:()=>void;children:ReactNode;className?:string;id?:string;label?:string;alignment?:'start'|'end';minimumWidth?:number;
}){
  const ref=useRef<HTMLDivElement>(null);
  const dismiss=useRef(onDismiss);
  dismiss.current=onDismiss;

  useLayoutEffect(()=>{
    const trigger=anchor.current, layer=ref.current;
    if(!trigger||!layer)return;
    const native=typeof layer.showPopover==='function';
    if(native){
      layer.setAttribute('popover','manual');
      layer.showPopover();
    }
    const margin=10,gap=6;
    function position(){
      if(!trigger||!layer)return;
      const visual=window.visualViewport;
      const viewportWidth=visual?.width??document.documentElement.clientWidth;
      const viewportHeight=visual?.height??window.innerHeight;
      const viewTop=visual?.offsetTop??0,viewLeft=visual?.offsetLeft??0;
      const box=trigger.getBoundingClientRect();
      if(box.bottom < viewTop||box.top > viewTop+viewportHeight){dismiss.current();return}
      const availableWidth=viewportWidth-margin*2;
      const requestedWidth=Math.max(box.width,minimumWidth??(alignment==='end'?212:220));
      const width=Math.min(requestedWidth,availableWidth);
      const start=alignment==='end'?box.right-width:box.left;
      const left=Math.max(viewLeft+margin,Math.min(start,viewLeft+viewportWidth-margin-width));
      const below=viewTop+viewportHeight-box.bottom-gap-margin,above=box.top-viewTop-gap-margin;
      const flip=below<Math.min(layer.scrollHeight,340)&&above>below;
      const height=Math.max(40,Math.min(flip?above:below,viewportHeight-margin*2));
      layer.style.width=width+'px';
      layer.style.left=left+'px';
      layer.style.maxHeight=height+'px';
      const top=flip?box.top-gap-layer.offsetHeight:box.bottom+gap;
      layer.style.top=Math.max(viewTop+margin,top)+'px';
    }
    position();
    (layer.querySelector<HTMLElement>('[data-popover-focus]')??layer.querySelector<HTMLElement>('button:not([disabled])'))?.focus({preventScroll:true});
    function pointer(event:PointerEvent){
      if(event.target instanceof Node&&!trigger?.contains(event.target)&&!layer?.contains(event.target))dismiss.current();
    }
    function focus(event:FocusEvent){
      if(event.target instanceof Node&&!trigger?.contains(event.target)&&!layer?.contains(event.target))dismiss.current();
    }
    function escape(event:KeyboardEvent){
      if(event.key!=='Escape')return;
      event.preventDefault();
      event.stopPropagation();
      dismiss.current();
      trigger?.focus({preventScroll:true});
    }
    const observer=new ResizeObserver(position);
    observer.observe(trigger);
    observer.observe(layer);
    document.addEventListener('pointerdown',pointer,true);
    document.addEventListener('focusin',focus);
    layer.addEventListener('keydown',escape);
    window.addEventListener('scroll',position,true);
    window.addEventListener('resize',position);
    window.visualViewport?.addEventListener('resize',position);
    return ()=>{
      observer.disconnect();
      document.removeEventListener('pointerdown',pointer,true);
      document.removeEventListener('focusin',focus);
      layer.removeEventListener('keydown',escape);
      window.removeEventListener('scroll',position,true);
      window.removeEventListener('resize',position);
      window.visualViewport?.removeEventListener('resize',position);
      if(native&&layer.matches(':popover-open'))layer.hidePopover();
    };
  },[anchor,alignment,minimumWidth]);
  return <div className={'floating-popover '+className} ref={ref} id={id} aria-label={label}>{children}</div>;
}
