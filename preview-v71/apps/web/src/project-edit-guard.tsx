import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject } from 'react';
import type { ProjectDraft } from '../../../packages/shared/project-entry';
import { parseRupiahInput } from '../../../packages/shared/money';
import { parseFormNumber } from '../../../packages/shared/form-number';
import { ConfirmDialog } from './ui';

type ExitRequest = {proceed:()=>void;cancel?:()=>void};
export type ProjectExitRequestHandler = (request:ExitRequest)=>boolean;
export const ProjectExitGuard = createContext<MutableRefObject<ProjectExitRequestHandler|null>|null>(null);

export function projectDraftChanged(baseline:ProjectDraft,draft:ProjectDraft) {
  return (Object.keys(baseline) as Array<keyof ProjectDraft>).some(key=>{
    const saved=baseline[key];
    const value=draft[key];
    if(saved===value)return false;
    if(key==='value'){
      const amount=parseRupiahInput(value);
      return amount===null||amount!==parseRupiahInput(saved);
    }
    if(key==='resourceCount'){
      const count=parseFormNumber(value,{integer:true});
      return count===null||count!==parseFormNumber(saved,{integer:true});
    }
    return true;
  });
}

export function useProjectEditGuard(dirty:boolean,saving:()=>boolean,discard:()=>void) {
  const guard=useContext(ProjectExitGuard);
  const [confirmation,setConfirmation]=useState<ExitRequest|null>(null);
  const pending=useRef<ExitRequest|null>(null);

  function intercept(request:ExitRequest) {
    if(saving()||pending.current){
      request.cancel?.();
      return true;
    }
    if(!dirty)return false;
    pending.current=request;
    setConfirmation(request);
    return true;
  }

  useLayoutEffect(()=>{
    if(!guard||!dirty)return;
    const leavePage:ProjectExitRequestHandler=request=>intercept({
      proceed:()=>{discard();request.proceed()},
      cancel:request.cancel,
    });
    guard.current=leavePage;
    return ()=>{if(guard.current===leavePage)guard.current=null};
  });

  useEffect(()=>{
    if(!dirty)return;
    function beforeUnload(event:BeforeUnloadEvent){
      event.preventDefault();
      event.returnValue='';
    }
    window.addEventListener('beforeunload',beforeUnload);
    return ()=>window.removeEventListener('beforeunload',beforeUnload);
  },[dirty]);

  function resolveConfirmation(leave:boolean) {
    const request=pending.current;
    pending.current=null;
    setConfirmation(null);
    if(leave)request?.proceed();
    else request?.cancel?.();
  }

  return {
    confirming:Boolean(confirmation),
    exit(proceed:()=>void){if(!intercept({proceed}))proceed()},
    continueEditing:()=>resolveConfirmation(false),
    discardChanges:()=>resolveConfirmation(true),
  };
}

export function DiscardProjectChanges({name,guard}:{name:string;guard:ReturnType<typeof useProjectEditGuard>}) {
  if(!guard.confirming)return null;
  return <ConfirmDialog title="Buang perubahan" object={name}
    consequence="Isian proyek yang belum disimpan akan dibuang."
    cancelLabel="Lanjutkan edit" confirmLabel="Buang perubahan" danger
    onCancel={guard.continueEditing} onConfirm={guard.discardChanges}/>;
}
