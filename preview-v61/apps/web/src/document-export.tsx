import { DownloadMenu, type DownloadFormat } from './download-menu';
import { useRef, useState, type RefObject } from 'react';
import { downloadFile } from './download';

type Format = DownloadFormat;
type Cell = { text:string; tone?:string };
type Block =
  | { kind:'text'; text:string; heading?:number; tone?:string }
  | { kind:'table'; rows:Cell[][]; header:boolean; rowHeights?:number[] }
  | { kind:'image'; element:HTMLImageElement|SVGSVGElement };

const palette:Record<string,{fill:string;ink:string}> = {
  green:{fill:'DCF1E8',ink:'146045'}, amber:{fill:'FFF0CF',ink:'75500B'},
  red:{fill:'FBE2E4',ink:'902F40'}, violet:{fill:'EEE8FC',ink:'51339B'},
  neutral:{fill:'EEF1F6',ink:'44516A'},
};

function tone(element:Element) {
  for(const name of Object.keys(palette)){
    if(element.matches('.pill-'+name)||element.querySelector('.pill-'+name))return name;
  }
}

function documentText(element:Element):string {
  return Array.from(element.childNodes).map(node=>{
    if(node.nodeType===Node.TEXT_NODE)return node.textContent??'';
    if(!(node instanceof Element)||node.matches('[data-no-export], img, svg'))return '';
    if(node.matches('br'))return '\n';
    const value=documentText(node);
    return node.matches('p, div, li')?'\n'+value+'\n':node.matches('.pill')?value+' · ':value;
  }).join('').replace(/ ·\s*\n/g,'\n').replace(/ ·\s*$/,'').replace(/\n\n+/g,'\n').trim();
}

function blocks(root:Element):Block[] {
  return Array.from(root.children).flatMap((el):Block[]=>{
    if(el.matches('[data-no-export]'))return [];
    if(el instanceof HTMLImageElement||el instanceof SVGSVGElement)return [{kind:'image',element:el}];
    if(el instanceof HTMLTableElement){
      const rows=Array.from(el.rows);
      return [{
        kind:'table',header:!!el.tHead,
        rows:rows.map(row=>Array.from(row.cells,cell=>({text:documentText(cell),tone:tone(cell)}))),
        rowHeights:rows.map(row=>Number(row.dataset.exportRowHeight)||0),
      }];
    }
    if(el.matches('dl'))return [{kind:'table',header:false,rows:Array.from(el.querySelectorAll('dt')).map(label=>[{text:documentText(label)},{text:documentText(label.nextElementSibling??label)}])}];
    if(el.matches('ol,ul'))return Array.from(el.children).map((li,i)=>({kind:'text',text:(el.matches('ol')?(i+1)+'. ':'• ')+documentText(li)}));
    const text=documentText(el);
    if(el.matches('.preview-status-badges'))return [{kind:'text',text,tone:tone(el)}];
    if(el.matches('h1,h2,h3,h4,h5,h6,p,footer,figcaption,.watermark')){
      return text?[{kind:'text',text,heading:/^H\d$/.test(el.tagName)?Number(el.tagName[1]):undefined,tone:tone(el)}]:[];
    }
    return blocks(el);
  });
}

async function picture(element:HTMLImageElement|SVGSVGElement) {
  const isPhoto=element instanceof HTMLImageElement;
  const img=new Image();
  let source:string;
  if(isPhoto)source=element.src;
  else {
    const svg=element.cloneNode(true) as SVGSVGElement;
    svg.setAttribute('width',String(element.viewBox.baseVal.width));
    svg.setAttribute('height',String(element.viewBox.baseVal.height));
    source=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}));
  }
  try{
    img.src=source;
    await img.decode();
    const canvas=document.createElement('canvas');
    const scale=Math.min(1,1200/img.naturalWidth,640/img.naturalHeight);
    canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
    canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
    canvas.getContext('2d')!.drawImage(img,0,0,canvas.width,canvas.height);
    const fit=Math.min(element.matches('.paper-logo')?104/canvas.width:560/canvas.width,element.matches('.paper-logo')?42/canvas.height:155/canvas.height);
    return {image:canvas.toDataURL('image/png'),width:Math.max(1,Math.round(canvas.width*fit)),height:Math.max(1,Math.round(canvas.height*fit))};
  }finally{if(!isPhoto)URL.revokeObjectURL(source)}
}

async function wordDocument(source:Block[], name:string){
  const { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, ImageRun, HeadingLevel, HeightRule, WidthType }=await import('docx');
  const para=(text:string, options:{heading?:number;tone?:string;header?:boolean}={})=>{
    const {heading,tone,header}=options;
    const color=tone?palette[tone].ink:header?'FFFFFF':'14224B';
    return new Paragraph({
      heading:heading===2?HeadingLevel.TITLE:heading===3?HeadingLevel.HEADING_1:heading===4?HeadingLevel.HEADING_2:heading?HeadingLevel.HEADING_3:undefined,
      spacing:{after:heading?100:75}, keepNext:!!heading,
      children:text.split('\n').map((line,index)=>new TextRun({text:line,break:index?1:undefined,bold:!!heading||header||!!tone,color,size:heading===2?34:heading?23:20})),
    });
  };
  const children:Array<InstanceType<typeof Paragraph>|InstanceType<typeof Table>>=[];
  for(const block of source){
    if(block.kind==='text')children.push(para(block.text,block));
    if(block.kind==='table'&&block.rows.length)children.push(new Table({
      width:{size:100,type:WidthType.PERCENTAGE},
      margins:{top:65,bottom:35,left:90,right:90},
      rows:block.rows.map((row,i)=>new TableRow({
        tableHeader:block.header&&i===0,
        cantSplit:true,
        height:block.rowHeights?.[i]?{value:block.rowHeights[i]*15,rule:HeightRule.ATLEAST}:undefined,
        children:row.map(cell=>new TableCell({
          shading:block.header&&i===0?{fill:'213969'}:cell.tone?{fill:palette[cell.tone].fill}:i%2?{fill:'F5F7FB'}:undefined,
          children:[para(cell.text,{tone:cell.tone,header:block.header&&i===0})],
        })),
      })),
    }));
    if(block.kind==='image'){
      const {image,width,height}=await picture(block.element);
      children.push(new Paragraph({children:[new ImageRun({type:'png',data:image,transformation:{width,height}})]}));
    }
  }
  downloadFile(await Packer.toBlob(new Document({sections:[{children}]})),name+'.docx');
}

async function excelDocument(source:Block[], name:string){
  const {default:ExcelJS}=await import('exceljs');
  const book=new ExcelJS.Workbook();
  const sheet=book.addWorksheet('Dokumen',{pageSetup:{paperSize:9,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0}});
  const columns=Math.max(3,...source.map(block=>block.kind==='table'?block.rows[0]?.length??0:0));
  sheet.columns=Array.from({length:columns},()=>({width:columns>4?21:27}));
  for(const block of source){
    if(block.kind==='text'){
      const row=sheet.addRow([block.text]);
      sheet.mergeCells(row.number,1,row.number,columns);
      const cell=row.getCell(1);
      cell.alignment={wrapText:true,vertical:'middle',indent:1};
      cell.font={bold:!!block.heading||!!block.tone,size:block.heading===2?17:block.heading?12:10,color:{argb:'FF'+(block.tone?palette[block.tone].ink:'14224B')}};
      if(block.heading||block.tone)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF'+(block.tone?palette[block.tone].fill:'EAF0FC')}};
      row.height=Math.min(405,Math.max(block.heading===2?32:19,block.text.split('\n').reduce((count,line)=>count+Math.max(1,Math.ceil(line.length/(columns*20))),0)*15+5));
    }
    if(block.kind==='table'){
      block.rows.forEach((cells,index)=>{
        const row=sheet.addRow(cells.map(cell=>cell.text));
        row.height=Math.min(405,Math.max(20,block.rowHeights?.[index]?block.rowHeights[index]*.75:0,...cells.map(cell=>cell.text.split('\n').reduce((count,line)=>count+Math.max(1,Math.ceil(line.length/(columns>4?20:26))),0)*14+6)));
        row.eachCell({includeEmpty:true},(cell,i)=>{
          const header=block.header&&index===0;
          const tone=cells[i-1]?.tone;
          cell.font={size:10,bold:header||!!tone,color:{argb:'FF'+(header?'FFFFFF':tone?palette[tone].ink:'14224B')}};
          cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF'+(header?'213969':tone?palette[tone].fill:index%2?'F5F7FB':'FFFFFF')}};
          cell.alignment={wrapText:true,vertical:'top',indent:1};
          cell.border={bottom:{style:'thin',color:{argb:'FFDCE0EA'}}};
        });
      });
      sheet.addRow([]);
    }
    if(block.kind==='image'){
      const {image,width,height}=await picture(block.element);
      const row=sheet.addRow([]);
      row.height=height*.75+9;
      sheet.addImage(book.addImage({base64:image,extension:'png'}),{tl:{col:0.08,row:row.number-0.94},ext:{width,height}});
    }
  }
  const buffer=await book.xlsx.writeBuffer();
  downloadFile(new Blob([new Uint8Array(buffer)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),name+'.xlsx');
}

export async function buildDocumentPdf(element:HTMLElement,name:string,{watermark=true}:{watermark?:boolean}={}){
  const [{default:html2canvas},{jsPDF}]=await Promise.all([import('html2canvas'),import('jspdf')]);
  const host=document.createElement('div');
  host.className='document-export-surface';
  host.setAttribute('aria-hidden','true');
  const copy=element.cloneNode(true) as HTMLElement;
  copy.style.removeProperty('zoom');
  const draft=copy.dataset.documentDraft==='true';
  copy.removeAttribute('data-document-draft');
  copy.querySelectorAll('[data-no-export]').forEach(node=>node.remove());
  host.append(copy);
  document.body.append(host);
  try{
    await Promise.all([document.fonts.ready,...Array.from(copy.querySelectorAll('img'),image=>image.decode().catch(()=>{}))]);
    const bounds=copy.getBoundingClientRect();
    const width=Math.ceil(bounds.width);
    const height=Math.ceil(bounds.height);
    const pdf=new jsPDF({unit:'mm',format:'a4',compress:true});
    pdf.setProperties({title:copy.querySelector('h2')?.textContent??name,creator:'Shockwave PMO'});
    const margin=10;
    const pageWidth=190;
    const pageHeight=277;
    const nominalLimit=Math.floor(pageHeight*width/pageWidth);
    const compact=copy.classList.contains('risk-paper')&&height<=nominalLimit*1.09;
    const limit=compact?Math.max(height,nominalLimit):nominalLimit;
    const offset=(node:Element)=>Math.floor(node.getBoundingClientRect().top-bounds.top);
    const keepTogether=Array.from(copy.querySelectorAll('.assignment-signature,.signature-preview,.paper-photos'),block=>({
      start:offset(block),end:offset(block)+block.getBoundingClientRect().height,
    }));
    const breaks=[...new Set(Array.from(copy.querySelectorAll('h3,h4,p,tbody tr,figure,figure svg,dl,li,.paper-photos,.signature-preview,.assignment-signature,footer'),offset))]
      .filter(position=>!keepTogether.some(block=>position>block.start&&position<block.end)).sort((a,b)=>b-a);
    const tableHeaders=Array.from(copy.querySelectorAll('table')).flatMap(table=>{
      if(!table.tHead||!table.tBodies[0]?.rows.length)return [];
      return [{
        headTop:offset(table.tHead),headHeight:Math.ceil(table.tHead.getBoundingClientRect().height),
        firstRow:offset(table.tBodies[0].rows[0]),bottom:offset(table)+table.getBoundingClientRect().height,
      }];
    });
    const renderWidth=compact?Math.min(pageWidth,pageHeight*width/height):pageWidth;
    const mmPerPixel=renderWidth/width;
    const rasterScale=1.75;
    const batchHeight=Math.floor(12_000_000/(Math.ceil(width*rasterScale)*rasterScale));
    let batch:{canvas:HTMLCanvasElement;start:number;end:number}|undefined;
    const headers=new Map<number,HTMLCanvasElement>();
    const capture=(start:number,length:number)=>html2canvas(copy,{
      backgroundColor:'#ffffff',scale:rasterScale,y:start,width,height:length,logging:false,
    });
    async function renderSlice(start:number,length:number,y:number,isHeader=false){
      let canvas=isHeader?headers.get(start):undefined;
      if(!canvas){
        if(!batch||start<batch.start||start+length>batch.end){
          if(isHeader)canvas=await capture(start,length);
          else {
            if(batch)batch.canvas.width=0;
            const size=Math.min(height-start,Math.max(length,batchHeight));
            batch={canvas:await capture(start,size),start,end:start+size};
          }
        }
        if(!canvas&&batch){
          const offset=Math.floor((start-batch.start)*rasterScale);
          canvas=document.createElement('canvas');
          canvas.width=batch.canvas.width;
          canvas.height=Math.floor(length*rasterScale);
          const context=canvas.getContext('2d');
          if(!context)throw new Error('Kanvas dokumen tidak tersedia.');
          context.drawImage(batch.canvas,0,offset,canvas.width,canvas.height,0,0,canvas.width,canvas.height);
        }
        if(isHeader&&canvas)headers.set(start,canvas);
      }
      if(!canvas)throw new Error('Bagian dokumen tidak dapat dirender.');
      pdf.addImage(canvas.toDataURL('image/png'),'PNG',margin+(pageWidth-renderWidth)/2,y,renderWidth,length*mmPerPixel,undefined,'FAST');
    }
    for(let top=0;top<height;){
      const header=tableHeaders.find(table=>top>=table.firstRow&&top<table.bottom);
      const capacity=Math.max(1,limit-(header?.headHeight??0));
      const max=Math.min(height,top+capacity);
      const end=max===height?height:breaks.find(position=>position<=max&&position>top+24)??max;
      if(top)pdf.addPage();
      if(header)await renderSlice(header.headTop,header.headHeight,margin,true);
      await renderSlice(top,end-top,margin+(header?.headHeight??0)*mmPerPixel);
      top=end;
    }
    const pages=pdf.getNumberOfPages();
    if(draft&&watermark){
      pdf.setFont('helvetica','bold');
      pdf.setFontSize(60);
      pdf.setTextColor('#b8c4db');
      pdf.setGState(pdf.GState({opacity:.47}));
      for(let page=1;page<=pages;page++){
        pdf.setPage(page);
        pdf.text('DRAF',105,149,{align:'center'});
      }
      pdf.setGState(pdf.GState({opacity:1}));
      pdf.setFont('helvetica','normal');
    }
    if(pages>1){
      pdf.setFontSize(8);
      pdf.setTextColor('#596987');
      for(let page=1;page<=pages;page++){
        pdf.setPage(page);
        pdf.text('Halaman '+page+' / '+pages,200,292,{align:'right'});
      }
    }
    return pdf.output('blob');
  }finally{host.remove()}
}

export function DocumentExport({paper,name,formats=['Word','Excel','PDF'],onError}:{
  paper:RefObject<HTMLElement>;name:string;formats?:readonly Format[];onError:(message:string)=>void;
}){
  const [busy,setBusy]=useState(false);
  const working=useRef(false);
  async function download(format:Format){
    const document=paper.current;
    if(!document||working.current)return;
    working.current=true;setBusy(true);onError('');
    try{
      if(format==='PDF')downloadFile(await buildDocumentPdf(document,name),name+'.pdf');
      else if(format==='Word')await wordDocument(blocks(document),name);
      else await excelDocument(blocks(document),name);
    }catch(error){onError('Unduhan gagal. '+(error as Error).message)}finally{working.current=false;setBusy(false)}
  }
  return <DownloadMenu available={formats} busy={busy} download={format=>void download(format)}/>;
}
