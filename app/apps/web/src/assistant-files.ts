import type { AssistantAttachment } from '../../../packages/shared/assistant-knowledge';

export const acceptedAssistantFiles='.pdf,.docx,.xlsx,.txt,.md,.csv';
const maxText=32000;

export async function extractAssistantFile(file:File):Promise<AssistantAttachment> {
  const extension=file.name.split('.').at(-1)?.toLowerCase();
  if(!file.size||file.size>5*1024*1024)throw new Error(file.name+' harus berisi data dan berukuran maksimal 5 MB.');
  let text='';
  if(extension==='pdf'){
    const [pdfjs,worker]=await Promise.all([import('pdfjs-dist'),import('pdfjs-dist/build/pdf.worker.min.mjs?url')]);
    pdfjs.GlobalWorkerOptions.workerSrc=worker.default;
    const document=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer()),isEvalSupported:false}).promise;
    try{
      for(let index=1;index<=Math.min(document.numPages,60)&&text.length<maxText;index++){
        const page=await document.getPage(index);
        const content=await page.getTextContent();
        text+=content.items.map(item=>'str' in item?item.str+(item.hasEOL?'\n':' '):'').join('')+'\n';
      }
    }finally{await document.destroy()}
  }else if(extension==='docx'){
    const Zip=(await import('jszip')).default;
    const archive=await Zip.loadAsync(await file.arrayBuffer());
    const xml=await archive.file('word/document.xml')?.async('string');
    if(!xml)throw new Error('Dokumen Word tidak dapat dibaca.');
    const document=new DOMParser().parseFromString(xml,'application/xml');
    const ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    text=Array.from(document.getElementsByTagNameNS(ns,'p'),p=>Array.from(p.getElementsByTagNameNS(ns,'t'),node=>node.textContent||'').join('')).join('\n');
  }else if(extension==='xlsx'){
    const ExcelJS=(await import('exceljs')).default;
    const workbook=new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    for(const sheet of workbook.worksheets.slice(0,8)){
      text+=sheet.name+'\n';
      for(let index=1;index<=Math.min(sheet.rowCount,500)&&text.length<maxText;index++){
        const values:string[]=[];
        sheet.getRow(index).eachCell(cell=>values.push(cell.text));
        if(values.length)text+=values.join(' | ')+'\n';
      }
    }
  }else if(['txt','md','csv'].includes(extension||'')){
    text=await file.text();
  }else{
    throw new Error('Pilih file PDF, DOCX, XLSX, TXT, MD, atau CSV.');
  }
  text=text.replaceAll('\u0000','').trim().slice(0,maxText);
  if(!text)throw new Error('Tidak ada teks yang bisa dibaca dari '+file.name+'. PDF pindai memerlukan OCR terlebih dahulu.');
  return {name:file.name.slice(0,180),text};
}
