const romans=['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII'];

export function prepareAssignment(fields:Record<string,string>,publish:boolean,previous:Record<string,string>|undefined,nextNumber:(year:string)=>number) {
  if(previous?.issued==='true')throw new Error('Surat yang telah diterbitkan terkunci.');
  delete fields.issued;
  if(!publish)return fields;
  const date=new Date(fields.date+'T00:00:00Z');
  if(![fields.pm,fields.projectName,fields.customer].every(value=>value?.trim())||
    !['Small','Sedang','Big'].includes(fields.classification)||
    !Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==fields.date){
    throw new Error('Lengkapi PM, proyek, pelanggan, klasifikasi, dan tanggal surat.');
  }
  if(fields.numberMode==='Manual'){
    if(!fields.number?.trim())throw new Error('Masukkan nomor surat.');
  }else{
    const year=fields.date.slice(0,4);
    fields.number=String(nextNumber(year)).padStart(3,'0')+'/PM/PMO-SDD/'+romans[date.getUTCMonth()]+'/'+year;
  }
  fields.classificationLabel=fields.classification==='Small'?'Kecil':fields.classification==='Big'?'Besar':'Sedang';
  fields.issued='true';
  return fields;
}
