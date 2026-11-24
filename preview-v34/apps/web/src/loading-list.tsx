import { useEffect, useState } from 'react';
import { api, ErrorBox, PendingStatus } from './ui';

export function useLoadingList<T>(path:string,onLoad?:(items:T[])=>void){
  const [items,setItems]=useState<T[]>([]);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(true);
  const [attempt,setAttempt]=useState(0);

  function retry(){
    setError('');setLoading(true);setAttempt(value=>value+1);
  }

  useEffect(()=>{
    let current=true;
    api<T[]>(path).then(data=>{
      if(!current)return;
      setItems(data);onLoad?.(data);
    }).catch(failure=>{
      if(current)setError((failure as Error).message);
    }).finally(()=>{
      if(current)setLoading(false);
    });
    return ()=>{current=false};
  },[path,onLoad,attempt]);

  return {items,setItems,error,loading,retry};
}

export function LoadingArea({message,error,retry}:{message:string;error?:string;retry:()=>void}){
  return <div className="fields">
    {error?<><ErrorBox message={error}/><div><button type="button" className="button" onClick={retry}>Coba lagi</button></div></>:<>
      <PendingStatus message={message}/>
      <div className="skeleton" aria-hidden="true"/>
    </>}
  </div>;
}
