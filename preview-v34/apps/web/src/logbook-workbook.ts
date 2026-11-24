import { logFileBytes, logFileLimit, logFileSchema, logbookEntrySchema, logbookLimit, logbookSchema, logWeekFileBytes, type Logbook, type LogFile } from '../../../packages/shared/logbook';
import { downloadFile } from './download';
import { addGuide, workbookTable, readColumns, workbookText, spreadsheetType } from './workspace-workbooks';

const recordHeaders=['ID catatan','Tanggal','Aktivitas','PIC','Hasil / catatan','Nama file'];
const fileHeaders=['ID catatan','ID file','Nama file','Bagian','Data'];
const chunkSize=24000;
const maxChunks=Math.ceil(Math.ceil(logFileBytes/3)*4/chunkSize);
const maxWorkbookBytes=25*1024*1024;

export async function readLogFiles(files:File[],existing:LogFile[]){
  if(files.length+existing.length>logFileLimit)throw new Error('Maksimal '+logFileLimit+' lampiran per catatan.');
  return [...existing,...await Promise.all(files.map(async file=>{
    if(!file.size||file.size>logFileBytes)throw new Error(file.name+' harus berisi data dan berukuran maksimal 2 MB.');
    const data=await new Promise<string>((resolve,reject)=>{
      const reader=new FileReader();
      reader.onerror=()=>reject(new Error('Gagal membaca '+file.name+'.'));
      reader.onload=()=>resolve(String(reader.result).split(',')[1]??'');
      reader.readAsDataURL(file);
    });
    const parsed=logFileSchema.safeParse({id:crypto.randomUUID(),name:file.name,data});
    if(!parsed.success)throw new Error('Nama atau isi lampiran tidak valid.');
    return parsed.data;
  }))];
}
export function downloadLogFile(file:LogFile){
  const data=Uint8Array.from(atob(file.data),char=>char.charCodeAt(0));
  downloadFile(new Blob([data],{type:'application/octet-stream'}),file.name);
}

export async function exportLogbook(bookData:Logbook){
  const {default:ExcelJS}=await import('exceljs');
  const book=new ExcelJS.Workbook();
  addGuide(book,[
    'Panduan Log Book · '+bookData.projectId+' · W'+bookData.week,
    'Isi atau ubah data pada lembar Log Book. Tanggal aktivitas memakai YYYY-MM-DD. Aktivitas wajib diisi.',
    'Pertahankan ID catatan untuk memperbarui entri yang sudah ada. Kosongkan ID pada baris baru. Impor mempertahankan entri lain di minggu ini.',
    'Lembar Lampiran menyimpan data file. Pertahankan lembar tersebut saat mengimpor ulang untuk membawa lampiran.',
    'Pilih proyek dan minggu yang sama dengan lembar Konteks sebelum mengimpor.',
  ]);
  const context=book.addWorksheet('Konteks');
  context.addRows([['Proyek',bookData.projectId],['Minggu',bookData.week]]);
  const log=workbookTable(book,'Log Book',recordHeaders,[39,16,42,24,56,35]);
  const attachments=workbookTable(book,'Lampiran',fileHeaders,[39,39,34,10,60]);
  attachments.state='hidden';
  for(const row of bookData.entries){
    log.addRow([row.id,row.date,row.activity,row.owner,row.result,(row.files??[]).map(file=>file.name).join(', ')]);
    for(const file of row.files??[]){
      for(let i=0;i<file.data.length;i+=chunkSize){
        attachments.addRow([row.id,file.id,file.name,i/chunkSize+1,file.data.slice(i,i+chunkSize)]);
      }
    }
  }
  downloadFile(new Blob([new Uint8Array(await book.xlsx.writeBuffer())],{type:spreadsheetType}),'LogBook-'+bookData.projectId+'-W'+bookData.week+'.xlsx');
}

export async function importLogbook(file:File,current:Logbook){
  if(!/\.xlsx$/i.test(file.name)||file.size>maxWorkbookBytes)throw new Error('Pilih workbook .xlsx dengan ukuran sampai 25 MB.');
  const {default:ExcelJS}=await import('exceljs');
  const book=new ExcelJS.Workbook();
  await book.xlsx.load(await file.arrayBuffer());
  const context=book.getWorksheet('Konteks');
  if(context&&(context.getCell('B1').text!==current.projectId||Number(context.getCell('B2').text)!==current.week)){
    throw new Error('Workbook berasal dari proyek atau minggu lain.');
  }
  const log=book.getWorksheet('Log Book');
  if(!log)throw new Error('Lembar Log Book tidak ditemukan. Gunakan Ekspor Excel sebagai templat.');
  const cols=readColumns(log,recordHeaders);
  const attachments=book.getWorksheet('Lampiran');
  const filesByEntry=new Map<string,Map<string,{name:string;chunks:Map<number,string>}>>();
  let encodedLength=0;
  if(attachments){
    const fileCols=readColumns(attachments,fileHeaders);
    attachments.eachRow((row,number)=>{
      if(number===1)return;
      const [entryId,fileId,name,part,data]=fileCols.map(i=>workbookText(row.getCell(i)));
      if(!entryId&&!fileId&&!name&&!part&&!data)return;
      const index=Number(part);
      if(!entryId||!fileId||!name||!data||data.length>chunkSize||!Number.isInteger(index)||index<1||index>maxChunks){
        throw new Error('Data lampiran tidak valid pada baris '+number+'.');
      }
      encodedLength+=data.length;
      if(encodedLength>Math.ceil(logWeekFileBytes/3)*4+logbookLimit*logFileLimit*4)throw new Error('Total lampiran melebihi 16 MB.');
      const files=filesByEntry.get(entryId)??new Map();
      const record=files.get(fileId)??{name,chunks:new Map<number,string>()};
      if(record.name!==name||record.chunks.has(index))throw new Error('Bagian lampiran duplikat pada baris '+number+'.');
      record.chunks.set(index,data);files.set(fileId,record);filesByEntry.set(entryId,files);
      if(files.size>logFileLimit)throw new Error('Maksimal '+logFileLimit+' lampiran per catatan.');
    });
  }
  const byId=new Map(current.entries.map(entry=>[entry.id,entry]));
  const seen=new Set<string>();
  log.eachRow((row,number)=>{
    if(number===1)return;
    const [rawId,dateText,activity,owner,result]=cols.map(i=>workbookText(row.getCell(i)));
    if(!rawId&&!dateText&&!activity&&!owner&&!result)return;
    const id=rawId||crypto.randomUUID();
    const rawDate=row.getCell(cols[1]).value;
    const date=rawDate instanceof Date?rawDate.toISOString().slice(0,10):dateText;
    if(seen.has(id))throw new Error('ID catatan berulang pada baris '+number+'.');
    seen.add(id);
    const located=filesByEntry.get(id);
    const files=located?[...located].map(([fileId,record])=>{
      const data=Array.from({length:record.chunks.size},(_,i)=>{
        const chunk=record.chunks.get(i+1);
        if(!chunk)throw new Error('Data lampiran '+record.name+' tidak lengkap.');
        return chunk;
      }).join('');
      return {id:fileId,name:record.name,data};
    }):byId.get(id)?.files;
    filesByEntry.delete(id);
    const parsed=logbookEntrySchema.safeParse({id,date,activity,owner,result,files});
    if(!parsed.success)throw new Error('Periksa ID, tanggal, aktivitas, atau lampiran pada baris '+number+'.');
    byId.set(id,parsed.data);
    if(byId.size>logbookLimit)throw new Error('Maksimal '+logbookLimit+' catatan per minggu.');
  });
  if(!seen.size)throw new Error('Belum ada catatan yang dapat diimpor.');
  if(filesByEntry.size)throw new Error('Ada lampiran tanpa ID catatan yang sesuai.');
  const parsed=logbookSchema.safeParse({...current,entries:[...byId.values()]});
  if(!parsed.success)throw new Error('Periksa data Log Book. Total lampiran maksimal 16 MB per minggu.');
  return {entries:parsed.data.entries,count:seen.size};
}
