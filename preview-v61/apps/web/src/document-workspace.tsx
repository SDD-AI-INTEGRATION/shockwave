import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { ChevronLeft, ChevronRight, Maximize, Minimize } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { buildDocumentPdf } from './document-export';
import { Button } from './ui';

type View = 'editor'|'preview';
const defaultSplit=46;
const dividerWidth=16;
const splitThreshold=760;

export function DocumentWorkspace({children,preview,className='',userId,singlePane=false,view,onViewChange}:{
  children:ReactNode;preview:ReactNode;className?:string;userId:string;singlePane?:boolean;
  view?:View;onViewChange?:(view:View)=>void;
}){
  const key='shockwave:document-split:'+userId;
  const [preferred,setPreferred]=useState(()=>{
    try{
      const stored=localStorage.getItem(key);
      const value=Number(stored);
      return stored&&Number.isFinite(value)?Math.max(34,Math.min(66,value)):defaultSplit;
    }catch{return defaultSplit}
  });
  const [active,setActive]=useState<View>('editor');
  const [width,setWidth]=useState(0);
  const container=useRef<HTMLDivElement>(null);
  const editorId=useId();
  const previewId=useId();
  const dragOffset=useRef(0);
  const compact=singlePane||width<splitThreshold;
  const shown=view??active;
  const splitWidth=Math.max(1,width-dividerWidth);
  const min=Math.ceil(Math.max(34,32000/splitWidth));
  const max=Math.floor(Math.min(66,100-34000/splitWidth));
  const split=compact?defaultSplit:Math.max(min,Math.min(max,preferred));

  useLayoutEffect(()=>{
    const element=container.current;
    if(!element)return;
    const measure=()=>setWidth(element.clientWidth);
    measure();
    const observer=new ResizeObserver(measure);
    observer.observe(element);
    return ()=>observer.disconnect();
  },[]);

  useEffect(()=>{
    try{localStorage.setItem(key,String(preferred))}catch{ /* Storage is optional. */ }
  },[key,preferred]);

  function switchView(next:View){
    setActive(next);
    onViewChange?.(next);
  }

  function resize(value:number){
    setPreferred(Math.max(min,Math.min(max,value)));
  }

  return <div ref={container} className={'document-workspace '+className} data-compact={compact} data-view={shown}
    style={{'--document-editor-width':splitWidth*split/100+'px','--document-divider-width':dividerWidth+'px'} as CSSProperties}>
    {compact&&<div className="document-switch document-workspace-switch no-print" role="group" aria-label="Tampilan dokumen">
      <button type="button" aria-pressed={shown==='editor'} aria-controls={editorId} onClick={()=>switchView('editor')}>Editor</button>
      <button type="button" aria-pressed={shown==='preview'} aria-controls={previewId} onClick={()=>switchView('preview')}>Pratinjau</button>
    </div>}
    <div id={editorId} className="document-editor-pane no-print" onFocusCapture={()=>{if(!compact)setActive('editor')}}>{children}</div>
    {!compact&&<div className="document-divider no-print" role="separator" aria-orientation="vertical" aria-label="Pembagi editor dan pratinjau"
      aria-controls={editorId+' '+previewId} aria-valuemin={min} aria-valuemax={max} aria-valuenow={Math.round(split)}
      aria-valuetext={'Editor '+Math.round(split)+'%'} tabIndex={0} title="Seret atau gunakan tombol panah untuk mengatur panel"
      onKeyDown={event=>{
        const actions:Record<string,number>={ArrowLeft:split-2,ArrowRight:split+2,Home:min,End:max,Enter:defaultSplit};
        if(actions[event.key]===undefined)return;
        event.preventDefault();resize(actions[event.key]);
      }}
      onDoubleClick={()=>resize(defaultSplit)}
      onPointerDown={event=>{
        if(event.button!==0)return;
        event.preventDefault();
        dragOffset.current=event.clientX-event.currentTarget.getBoundingClientRect().left;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={event=>{
        if(!event.currentTarget.hasPointerCapture(event.pointerId))return;
        const bounds=container.current?.getBoundingClientRect();
        if(bounds)resize((event.clientX-bounds.left-dragOffset.current)*100/splitWidth);
      }}/>}
    <div id={previewId} className="document-preview-pane" onFocusCapture={()=>{if(!compact)setActive('preview')}}>{preview}</div>
  </div>;
}

export function DocumentPreview({children,toolbar,actions,className='',paper,showRefreshStatus=false}:{
  children:ReactNode;toolbar?:ReactNode;actions?:ReactNode;className?:string;paper:RefObject<HTMLElement>;showRefreshStatus?:boolean;
}){
  const [pdf,setPdf]=useState<PDFDocumentProxy>();
  const [page,setPage]=useState(1);
  const [error,setError]=useState('');
  const [rendering,setRendering]=useState(true);
  const stage=useRef<HTMLElement>(null);
  const sheet=useRef<HTMLDivElement>(null);
  const retryRender=useRef<()=>void>();
  const [fullscreen,setFullscreen]=useState(false);
  const fullscreenLabel=fullscreen?'Keluar dari layar penuh':'Layar penuh';

  useEffect(()=>{
    const syncFullscreen=()=>setFullscreen(document.fullscreenElement===stage.current);
    document.addEventListener('fullscreenchange',syncFullscreen);
    return ()=>document.removeEventListener('fullscreenchange',syncFullscreen);
  },[]);

  useEffect(()=>{
    const source=paper.current;
    const panel=stage.current;
    if(!source||!panel)return;
    let active=true, running=false, dirty=true;
    let timer:ReturnType<typeof setTimeout>;
    function schedule(){
      clearTimeout(timer);
      if(dirty&&panel?.clientWidth)timer=setTimeout(()=>void generate(),220);
    }
    async function generate(){
      if(!source||!panel?.clientWidth||!active||running||!dirty)return;
      dirty=false;
      running=true;
      setRendering(true);
      setError('');
      try{
        const [blob,pdfjs,worker]=await Promise.all([
          buildDocumentPdf(source,'Pratinjau',{watermark:false}),
          import('pdfjs-dist'),
          import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
        ]);
        if(!active)return;
        pdfjs.GlobalWorkerOptions.workerSrc=worker.default;
        const next=await pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false}).promise;
        if(!active||dirty){void next.destroy();return}
        setPdf(next);
        setPage(previous=>Math.min(previous,next.numPages));
      }catch(error){
        if(active)setError('Pratinjau belum diperbarui. '+(error as Error).message);
      }finally{
        running=false;
        if(active){setRendering(false);schedule()}
      }
    }
    const mutations=new MutationObserver(()=>{
      dirty=true;
      schedule();
    });
    retryRender.current=()=>{dirty=true;void generate()};
    mutations.observe(source,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['src','data-document-draft']});
    const sizes=new ResizeObserver(schedule);
    sizes.observe(panel);
    void generate();
    return ()=>{active=false;retryRender.current=undefined;clearTimeout(timer);sizes.disconnect();mutations.disconnect()};
  },[paper]);

  useEffect(()=>()=>{if(pdf)void pdf.destroy()},[pdf]);

  function goTo(next:number){
    setPage(next);
    sheet.current?.scrollIntoView({block:'nearest'});
  }

  return <section ref={stage} className={'paper-stage document-preview '+className} aria-label="Pratinjau dokumen">
    <div className="document-tabs document-toolbar no-print">
      {toolbar&&<div className="heading-actions document-toolbar-context">{toolbar}</div>}
      <div className="heading-actions document-viewport-actions">
        {actions}
        {typeof document!=='undefined'&&document.fullscreenEnabled&&<Button className="button document-fullscreen" type="button"
          aria-label={fullscreenLabel} title={fullscreenLabel} onClick={()=>{
            const action=fullscreen?document.exitFullscreen():stage.current?.requestFullscreen();
            void action?.catch(()=>{});
          }}>{fullscreen?<Minimize size={17} aria-hidden="true"/>:<Maximize size={17} aria-hidden="true"/>}</Button>}
      </div>
    </div>
    <div className="document-page-source">{children}</div>
    <div className="document-pagination no-print" aria-busy={rendering}>
      {error&&<div className="preview-retry"><p role="alert">{error}</p><Button type="button" className="button" onClick={()=>retryRender.current?.()}>Coba lagi</Button></div>}
      {rendering&&(pdf?<p className="muted" role="status">Memperbarui pratinjau…</p>:
        <div className="preview-loading" role="status"><span className="pending-spinner" aria-hidden="true"/> Memuat pratinjau dokumen…</div>)}
      {pdf&&<>
        {pdf.numPages>1&&<div className="heading-actions document-page-navigation">
          <button type="button" className="icon-button" title="Halaman sebelumnya" aria-label="Halaman sebelumnya" disabled={page===1} onClick={()=>goTo(page-1)}><ChevronLeft size={17}/></button>
          <span aria-live="polite">Halaman {page} / {pdf.numPages}</span>
          <button type="button" className="icon-button" title="Halaman berikutnya" aria-label="Halaman berikutnya" disabled={page===pdf.numPages} onClick={()=>goTo(page+1)}><ChevronRight size={17}/></button>
        </div>}
        <div className="document-sheet" ref={sheet}><PdfPage pdf={pdf} page={page} showStatus={showRefreshStatus&&!rendering}/></div>
      </>}
    </div>
  </section>;
}

function PdfPage({pdf,page,showStatus}:{pdf:PDFDocumentProxy;page:number;showStatus:boolean}){
  const canvas=useRef<HTMLCanvasElement>(null);
  const [painted,setPainted]=useState<{pdf:PDFDocumentProxy;page:number}>();
  const [error,setError]=useState('');
  useEffect(()=>{
    let active=true;
    let cancel:(()=>void)|undefined;
    setError('');
    void pdf.getPage(page).then(async result=>{
      const context=canvas.current?.getContext('2d');
      if(!active||!context)return;
      const viewport=result.getViewport({scale:1.6});
      const buffer=document.createElement('canvas');
      buffer.width=Math.ceil(viewport.width);
      buffer.height=Math.ceil(viewport.height);
      const bufferContext=buffer.getContext('2d');
      if(!bufferContext)throw new Error('Kanvas tidak tersedia.');
      const render=result.render({canvasContext:bufferContext,viewport});
      cancel=()=>render.cancel();
      await render.promise;
      if(!active)return;
      context.canvas.width=buffer.width;
      context.canvas.height=buffer.height;
      context.drawImage(buffer,0,0);
      setPainted({pdf,page});
    }).catch(()=>{if(active)setError('Halaman pratinjau gagal ditampilkan.')});
    return ()=>{active=false;cancel?.()};
  },[pdf,page]);
  const busy=showStatus&&!error&&(painted?.pdf!==pdf||painted.page!==page);
  return <>{error&&<p role="alert">{error}</p>}{busy&&<span className="risk-page-rendering" role="status">Menampilkan halaman…</span>}<canvas ref={canvas} className="document-pdf-page" role="img" aria-label={'Pratinjau halaman '+page}/></>;
}
