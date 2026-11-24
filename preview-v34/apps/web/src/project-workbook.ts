import { contractAmount, pillarOptions, projectStatuses, resolvePillar, type Project } from '../../../packages/shared/domain';
import { formatMoneyNumber, parseRupiahInput } from '../../../packages/shared/money';
import { masterFields, masterLabels, projectDraft, validateProjectDraft, type ProjectCatalog, type ProjectImportRow, type ProjectOption } from '../../../packages/shared/project-entry';
import { normalizedProjectName } from '../../../packages/shared/workspace-admin';
import { downloadFile, excel } from './download';
import { addGuide, readColumns, spreadsheetType, workbookTable, workbookText } from './workspace-workbooks';

const columns=['Nama proyek','Pilar','Pelanggan','Project Manager','Sales','Status','Tanggal mulai','Tanggal akhir',
  'Nilai kontrak (Rp)','Ketentuan penagihan','Jumlah sumber daya','Catatan SPK/PKS','Prognosa 2026 (Rp)','Realisasi 2026 (Rp)'];
const maxRows=200;
export type ImportReview={row:number;name:string;status:'valid'|'invalid'|'duplicate'|'empty';message:string;project?:ProjectImportRow};

export async function projectImportTemplate(catalog:ProjectCatalog){
  const {default:ExcelJS}=await import('exceljs');
  const book=new ExcelJS.Workbook();
  addGuide(book,[
    'Templat impor proyek Shockwave PMO',
    'Nama proyek dan Pilar wajib. Status kosong menggunakan Aktif. ID proyek dibuat saat penyimpanan.',
    'Pilih Pilar, Pelanggan, Project Manager, dan Sales dari daftar. Lembar Referensi memuat nilai yang tersedia. Kolom selain Nama dan Pilar bersifat opsional.',
    'Isi kedua tanggal dengan YYYY-MM-DD (contoh 2026-11-24) atau tanggal Excel. Tanggal akhir tidak boleh mendahului tanggal mulai.',
    'Isi nilai kontrak, prognosa, dan realisasi dengan angka Rupiah. Jumlah sumber daya harus bilangan bulat nonnegatif.',
    'Batas 200 baris data per file .xlsx dengan ukuran maksimal 5 MB. Gunakan nilai tetap. Nama yang berulang harus diperiksa sebelum impor.',
  ]);
  const sheet=workbookTable(book,'Proyek',columns,[48,32,30,28,27,18,18,18,22,30,20,38,24,24]);
  const lists=[pillarOptions,...masterFields.map(field=>catalog[field]),projectStatuses.map(label=>({label}))];
  const reference=workbookTable(book,'Referensi',['Pilar',...masterFields.map(field=>masterLabels[field]),'Status'],[34,36,30,30,18]);
  lists.forEach((options,index)=>{
    for(const [row,option] of options.entries())reference.getCell(row+2,index+1).value=option.label;
    if(!options.length)return;
    const letter=String.fromCharCode(65+index);
    const namedRange='PilihanProyek'+(index+1);
    book.definedNames.add(`Referensi!$${letter}$2:$${letter}$${options.length+1}`,namedRange);
    for(let row=2;row<=maxRows+1;row++){
      sheet.getCell(row,index+2).dataValidation={type:'list',allowBlank:index!==0,showErrorMessage:true,
        errorTitle:'Pilihan tidak valid',error:'Pilih nilai dari daftar Referensi.',formulae:[namedRange]};
    }
  });
  for(const col of [7,8])sheet.getColumn(col).numFmt='yyyy-mm-dd';
  for(const col of [9,13,14])sheet.getColumn(col).numFmt='#,##0.00';
  const buffer=await book.xlsx.writeBuffer();
  downloadFile(new Blob([new Uint8Array(buffer)],{type:spreadsheetType}),'Templat-Impor-Proyek.xlsx');
}

function matchOption(label:string,options:readonly ProjectOption[]){
  const key=normalizedProjectName(label);
  const exact=options.find(option=>option.id===label);
  if(exact)return exact.id;
  const matches=options.filter(option=>normalizedProjectName(option.label)===key);
  return matches.length===1?matches[0].id:label;
}

export async function readProjectImport(file:File,catalog:ProjectCatalog,existing:Pick<Project,'detail'>[],beforeValidation?:()=>Promise<void>):Promise<ImportReview[]>{
  if(!/\.xlsx$/i.test(file.name)||file.size>5*1024*1024)throw new Error('Pilih file .xlsx dengan ukuran maksimal 5 MB.');
  const {default:ExcelJS}=await import('exceljs');
  const book=new ExcelJS.Workbook();
  try{await book.xlsx.load(await file.arrayBuffer());}
  catch{throw new Error('File Excel tidak dapat dibaca. Pastikan file .xlsx utuh dan gunakan templat terbaru.');}
  const sheet=book.getWorksheet('Proyek');
  if(!sheet)throw new Error('Lembar Proyek tidak ditemukan. Gunakan templat terbaru.');
  await beforeValidation?.();
  const index=readColumns(sheet,columns);
  if(new Set(index).size!==columns.length||columns.some(label=>(sheet.getRow(1).values as unknown[])
    .filter(value=>String(value??'').trim().toLowerCase()===label.toLowerCase()).length!==1))
    throw new Error('Judul kolom berulang. Gunakan templat terbaru.');
  const reviews:ImportReview[]=[];
  const existingNames=new Set(existing.map(project=>normalizedProjectName(project.detail.name)));
  const fileNames=new Map<string,ImportReview[]>();
  let populated=0;
  sheet.eachRow({includeEmpty:false},(row,number)=>{
    if(number===1)return;
    const cells=index.map(i=>row.getCell(i));
    const item:ImportReview={row:number,name:cells[0].text.trim(),status:'invalid',message:''};
    reviews.push(item);
    if(++populated>maxRows)throw new Error('Maksimal 200 baris data per impor.');
    try{
      const [name,pillar,customer,pm,sales,status,start,end,amount,billing,resourceCount,notes]=cells.map(workbookText);
      if(cells.every(cell=>!cell.text.trim())){
        item.status='empty';item.message='Baris kosong.';return;
      }
      const key=normalizedProjectName(name);
      if(key)fileNames.set(key,[...(fileNames.get(key)??[]),item]);
      const date=(i:number,text:string)=>{
        const raw=cells[i].value;
        return raw instanceof Date?raw.toISOString().slice(0,10):text;
      };
      function money(i:number,legacy=false){
        const cell=cells[i];
        if(!cell.text.trim())return undefined;
        const value=typeof cell.value==='number'?cell.value:parseRupiahInput(cell.text)??(legacy?contractAmount(cell.text):null);
        if(value===null||!Number.isFinite(value)||value<0||value>(legacy?Number.MAX_SAFE_INTEGER:1e15))
          throw new Error('Nilai Rupiah tidak valid pada '+columns[i]+'.');
        if(legacy&&Math.abs(value*100-Math.round(value*100))>Math.max(1e-7,Math.abs(value)*Number.EPSILON*100))
          throw new Error('Nilai kontrak mendukung maksimal dua desimal.');
        return value;
      }
      const contract=amount?money(8,true):undefined;
      const draft={...projectDraft(),name,pillarId:resolvePillar(pillar)?.id??pillar,
        customerId:matchOption(customer,catalog.customerId),pmId:matchOption(pm,catalog.pmId),salesId:matchOption(sales,catalog.salesId),
        status:projectStatuses.find(option=>option.toLowerCase()===status.toLowerCase())??(status||'Aktif'),
        start:date(6,start),end:date(7,end),value:contract===undefined?'':formatMoneyNumber(contract),billing,resourceCount,notes};
      const plan=money(12),actual=money(13);
      const validation=validateProjectDraft(draft,catalog);
      if(!validation.fields){item.message=Object.values(validation.errors).join(' ');return;}
      item.status='valid';item.message='Siap ditambahkan.';item.project={row:number,draft,plan,actual};
    }catch(error){item.message=(error as Error).message;}
  });
  if(!reviews.length)throw new Error('Isi minimal satu proyek di lembar Proyek.');
  for(const [name,items] of fileNames){
    const exists=existingNames.has(name);
    if(!exists&&items.length===1)continue;
    for(const item of items){
      if(item.status!=='valid')continue;
      item.status='duplicate';
      item.message=exists?'Nama yang sama sudah ada di daftar proyek.':'Nama yang sama muncul beberapa kali dalam file.';
    }
  }
  const results:ImportReview[]=[];
  let previousRow=1;
  // Report gaps between populated rows without instantiating large blank ranges from the workbook.
  for(const item of reviews){
    if(item.row>previousRow+1)results.push({row:previousRow+1,name:'',status:'empty',message:
      item.row===previousRow+2?'Baris kosong.':'Baris '+(previousRow+1)+'–'+(item.row-1)+' kosong.'});
    results.push(item);previousRow=item.row;
  }
  return results;
}

export function downloadImportReport(rows:ImportReview[],saved:boolean,commitError:string){
  return excel('Laporan-Impor-Proyek','Hasil Impor',[
    ['Baris','Proyek','Hasil','Keterangan'],
    ...rows.map(row=>[row.row,row.name,
      row.status==='valid'?(saved?'Berhasil':commitError?'Gagal':'Belum disimpan'):row.status==='invalid'?'Gagal':'Dilewati',
      row.status==='valid'?(commitError||(saved?'Proyek ditambahkan.':row.message)):row.message]),
  ]);
}
