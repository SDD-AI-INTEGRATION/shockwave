import { useId, type ReactNode, type Ref } from 'react';

type Choice<T extends string> = {id:T;label:string;count?:number};

export function FilterChips<T extends string>({label,choices,value,onChange,defaultButton}:{
  label:string;choices:Choice<T>[];value:T;onChange:(value:T)=>void;defaultButton?:Ref<HTMLButtonElement>;
}){
  return <div className="chips" role="group" aria-label={label}>{choices.map((choice,index)=>
    <button type="button" key={choice.id} className={'chip '+(choice.id===value?'selected':'')} aria-pressed={choice.id===value}
      ref={index===0?defaultButton:undefined} onClick={()=>onChange(choice.id)}>{choice.label}{choice.count!==undefined&&<span>{choice.count}</span>}</button>)}</div>;
}

export function TabWorkspace<T extends string>({label,tabs,value,onChange,children}:{
  label:string;tabs:Choice<T>[];value:T;onChange:(value:T)=>void;children:ReactNode;
}){
  const id=useId();
  return <>
    <div className="shared-tab-list" role="tablist" aria-label={label} onKeyDown={event=>{
      const buttons=Array.from(event.currentTarget.querySelectorAll('button'));
      const current=buttons.indexOf(document.activeElement as HTMLButtonElement);
      if(current<0)return;
      const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:event.key==='ArrowRight'?(current+1)%buttons.length:
        event.key==='ArrowLeft'?(current+buttons.length-1)%buttons.length:-1;
      if(next<0)return;
      event.preventDefault();
      buttons[next]?.focus();
    }}>
      {tabs.map(tab=><button key={tab.id} id={id+'-'+tab.id} type="button" role="tab" aria-selected={tab.id===value} aria-controls={id+'-panel'}
        tabIndex={tab.id===value?0:-1} onClick={()=>onChange(tab.id)}>{tab.label}</button>)}
    </div>
    <div id={id+'-panel'} role="tabpanel" aria-labelledby={id+'-'+value}>{children}</div>
  </>;
}
