import {randomUUID} from 'node:crypto';

export const DATASET='pmo-demo-v1';
export const ACTORS={
 pm1:{email:'pmo-demo.pm1@example.test',name:'[DEMO] Andi Pratama',role:'pm',capacity:2},
 pm2:{email:'pmo-demo.pm2@example.test',name:'[DEMO] Sari Utami',role:'pm',capacity:2},
 pm3:{email:'pmo-demo.pm3@example.test',name:'[DEMO] Rina Putri',role:'pm',capacity:3},
 viewer:{email:'pmo-demo.viewer@example.test',name:'[DEMO] Pengamat Proyek',role:'viewer'},
 newcomer:{email:'pmo-demo.new@example.test',name:'[DEMO] Pengguna Login Pertama',role:'viewer',firstLogin:true},
};
export const PROJECTS=[
 {key:'app',code:'DEMO-APP-01',name:'[DEMO] Implementasi Aplikasi Layanan',customer:'PT Nusantara Digital (fiktif)',manager:'pm1',start:-14,end:84,status:'active',contract:1200000000,pillar:'Application Services',sub:'Pengembangan Aplikasi',scenario:'Kontrak dari OCR, tiga termin, pembayaran parsial dan dokumen berversi.'},
 {key:'late',code:'DEMO-BTN-01',name:'[DEMO] Migrasi Data Center BTN',customer:'Bank BTN - SIMULASI, bukan proyek nyata',manager:'pm1',start:-70,end:-7,status:'at_risk',contract:850000000,pillar:'Infrastructure',sub:'Data Center',scenario:'Terlambat, akses server terhambat, laporan basi, risiko tinggi dan BAST tertunda.'},
 {key:'network',code:'DEMO-NET-01',name:'[DEMO] Jaringan Cabang',customer:'PT Cabang Sejahtera (fiktif)',manager:'pm2',start:-21,end:28,status:'active',contract:600000000,pillar:'Infrastructure',sub:'Network',scenario:'Deadline mendekat, change request disetujui dan riwayat baseline.'},
 {key:'security',code:'DEMO-SEC-01',name:'[DEMO] Penguatan Keamanan TI',customer:'PT Aman Sentosa (fiktif)',manager:'pm3',start:7,end:91,status:'planning',contract:400000000,pillar:'Managed Services',sub:'Security',scenario:'Perencanaan, OCR gambar/PDF scan/JPEG dan draft change request.'},
 {key:'closed',code:'DEMO-CLOSED-01',name:'[DEMO] Implementasi Arsip Digital',customer:'PT Arsip Mandiri (fiktif)',manager:'pm2',start:-84,end:-7,status:'active',contract:500000000,pillar:'Application Services',sub:'Document Management',scenario:'Selesai melalui approval, pembayaran lunas dan lessons learned.'},
 {key:'review',code:'DEMO-REVIEW-01',name:'[DEMO] Portal Monitoring',customer:'PT Pantau Bersama (fiktif)',manager:'pm1',start:-7,end:63,status:'active',contract:300000000,pillar:'Application Services',sub:'Portal',scenario:'Baseline, laporan, dokumen dan change request menunggu persetujuan.'},
 {key:'archive',code:'DEMO-ARCHIVE-01',name:'[DEMO] Proyek Arsip Uji Pemulihan',customer:'PT Pelanggan Arsip (fiktif)',manager:'pm3',start:0,end:70,status:'planning',contract:100000000,pillar:'Managed Services',sub:'Support',scenario:'Diarsipkan untuk uji pemulihan melalui Administrasi.'},
 {key:'closing',code:'DEMO-CLOSING-01',name:'[DEMO] Penutupan Proyek Menunggu PMO',customer:'PT Serah Terima (fiktif)',manager:'pm3',start:-77,end:-1,status:'active',contract:250000000,pillar:'Infrastructure',sub:'Deployment',scenario:'Pekerjaan dan pembayaran selesai; penutupan menunggu approval PMO.'},
];
export function localToday(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
export function day(base,offset){return new Date(Date.parse(base+'T12:00:00Z')+offset*86400000).toISOString().slice(0,10);}
export const rp=value=>'Rp '+Math.round(value).toLocaleString('id-ID');
export function operations(def,today){
 const week=Math.max(0,Math.min(Math.ceil((def.end-def.start)/7),Math.floor(-def.start/7)));
 const complete=['closed','closing'].includes(def.key);
 let actual=complete?[100,100,100,100,100,100]:def.key==='late'?[100,100,35,0,0,0]:def.key==='app'?[100,100,55,0,0,0]:def.key==='network'?[100,100,100,0,0,0]:def.key==='review'?[100,100,0,0,0,0]:[0,0,0,0,0,0];
 // Future work starts after W0 so planning fixtures do not appear late on creation.
 const starts=def.key==='app'?[0,1,2,7,8,9]:['security','archive'].includes(def.key)?[1,2,3,5,6,7]:[0,1,2,4,5,6];
 const names=['Kickoff dan mobilisasi','Analisis kebutuhan','Implementasi solusi','Integrasi dan konfigurasi','UAT bersama pelanggan','Dokumentasi dan serah terima'];
 const weights=[10,15,40,15,15,5],durations=[1,1,def.key==='app'?5:2,1,1,1];
 const tasks=names.map((name,i)=>({id:randomUUID(),name,weight:weights[i],start:starts[i],duration:durations[i],pattern:'even',plan:[],actual:{},dependencies:[],lag:0}));
 tasks.forEach((t,i)=>{if(i)t.dependencies=[tasks[i-1].id];const now=actual[i];if(now){t.actual[String(Math.max(0,week-2))]=Math.max(0,now-20);t.actual[String(Math.max(0,week-1))]=Math.max(0,now-10);t.actual[String(week)]=now;}});
 // For green/amber examples, record early completion rather than an overdue milestone.
 const reports={};for(const w of [...new Set([Math.max(0,week-2),Math.max(0,week-1),week])])reports[String(w)]={notes:`[DEMO] Laporan W${w} untuk ${def.code}; seluruh informasi sintetis.`,done:complete?'Seluruh deliverable diterima dalam simulasi.':def.key==='late'?'Analisis dan persiapan selesai.':'Koordinasi dan konfigurasi lingkungan uji selesai.',todo:def.key==='late'?'Akses server UAT belum diberikan.':'Validasi hasil dan dokumentasi.',next:def.key==='late'?'Eskalasi akses server kepada PIC pelanggan.':'Review deliverable dan persiapan tahap berikutnya.'};
 const issues=def.key==='late'?[{id:randomUUID(),task_id:tasks[2].id,category:'resource',description:'[DEMO] Akses server UAT dari pelanggan belum diberikan',impact:'high',action:'Eskalasi melalui rapat PMO dan sepakati batas waktu akses.',pic:ACTORS.pm2.name,due:day(today,-3),status:'in_progress',week}]:[];
 const phases=[{id:randomUUID(),name:'Persiapan',tasks:tasks.slice(0,2)},{id:randomUUID(),name:'Pelaksanaan',tasks:tasks.slice(2,4)},{id:randomUUID(),name:'Validasi dan serah terima',tasks:tasks.slice(4)}];
 return{phases,issues,reports,baseline:structuredClone(phases)};
}
export function risks(def,today){return{prepared:'PMO Demo',date:today,risks:[{id:randomUUID(),risk:`[DEMO] ${def.key==='late'?'Keterlambatan akses infrastruktur':'Perubahan kebutuhan saat pelaksanaan'}`,impact:['time','cost'],severity:def.key==='late'?'high':'low',probability:def.key==='late'?'high':'low',response:'Review risiko mingguan dan dokumentasikan keputusan serta eskalasi.',pic:ACTORS[def.manager].name,status:['closed','closing'].includes(def.key)?'closed':def.key==='app'?'mitigated':'open'},{id:randomUUID(),risk:'[DEMO] Dokumentasi pekerjaan belum lengkap',impact:['quality'],severity:'low',probability:'low',response:'Gunakan checklist deliverable dan review sebelum serah terima.',pic:ACTORS.pm3.name,status:['closed','closing'].includes(def.key)?'closed':'mitigated'}]};}
export function assignments(def,today){return{letters:[{id:randomUUID(),number:`DEMO/PM/${def.code}/${today.slice(0,4)}`,date:today,place:'Jakarta (simulasi)',signer:'Direktur Demo - FIKTIF',signer_position:'Direktur Operasional (dummy)',signer_unit:'PMO Demo',pm:ACTORS[def.manager].name,pm_position:'Project Manager',pm_unit:def.pillar,classification:def.contract>=800000000?'Big':def.contract>=300000000?'Medium':'Small'}]};}
export function mom(def,today,photo,signature){return{documents:[{id:randomUUID(),number:`DEMO/MOM/${def.code}/${today.slice(0,4)}`,date:day(today,-7),purpose:`[DEMO] Review pelaksanaan ${def.name}`,start:'09:00',end:'10:00',location:'Ruang rapat virtual (simulasi)',online:'Media pertemuan demo',internal:`${ACTORS[def.manager].name}; ${ACTORS.pm2.name}`,external:'PIC pelanggan fiktif',previous:'[DEMO] Meninjau pekerjaan minggu sebelumnya.',results:def.key==='late'?'[DEMO] Akses server masih terhambat; tim menyepakati eskalasi.':'[DEMO] Deliverable ditinjau dan daftar pekerjaan berikutnya disepakati.',notes:'DATA DUMMY. Foto dan gambar tanda tangan hanya contoh, bukan bukti rapat/tanda tangan nyata.',deadline:day(today,7),actions:[],notulis:ACTORS.pm2.name,approver:ACTORS[def.manager].name,photos:[photo],signature}]};}

/** Minimal real PDF with a readable text layer; fixture only, never a legal document. */
export function textPdf(lines){
 const safe=['DATA DUMMY - BUKAN DOKUMEN RESMI',...lines].flatMap(line=>{const words=String(line).replace(/[^\x20-\x7e]/g,' ').split(' '),out=[];let row='';for(const word of words){if((row+' '+word).length>85){out.push(row);row=word;}else row+=(row?' ':'')+word;}if(row)out.push(row);return out;}).slice(0,44);
 const esc=s=>s.replaceAll('\\','\\\\').replaceAll('(','\\(').replaceAll(')','\\)');
 const stream=Buffer.from('BT /F1 10 Tf 45 795 Td 16 TL '+safe.map((s,i)=>(i?'T* ':'')+'('+esc(s)+') Tj').join('\n')+' ET','ascii');
 const objects=[Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>'),Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),Buffer.concat([Buffer.from(`<< /Length ${stream.length} >>\nstream\n`),stream,Buffer.from('\nendstream')])];
 const chunks=[Buffer.from('%PDF-1.4\n')],offsets=[0];let length=chunks[0].length;
 objects.forEach((obj,i)=>{offsets.push(length);const bytes=Buffer.concat([Buffer.from(`${i+1} 0 obj\n`),obj,Buffer.from('\nendobj\n')]);chunks.push(bytes);length+=bytes.length;});
 const xref=length;chunks.push(Buffer.from(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')+`trailer << /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`));return Buffer.concat(chunks);
}
export function documentLines(def,today,kind,extra=[]){const titles={pks:'PERJANJIAN KERJA SAMA',spk:'SURAT PERINTAH KERJA',bast:'BERITA ACARA SERAH TERIMA PEKERJAAN',invoice:'INVOICE / TAGIHAN',mom:'NOTULEN RAPAT / MOM',report:'LAPORAN MINGGUAN PROYEK'};const number=`${kind.toUpperCase()}/DEMO/${def.code}/${today.slice(0,4)}`;return[titles[kind],...(kind==='pks'||kind==='spk'?[`Nomor ${kind.toUpperCase()}: ${number}`]:kind==='invoice'?[`Nomor Invoice: ${number}`,`Tanggal Invoice: ${today}`]:[`Nomor: ${number}`]),`Nama Proyek: ${def.name}`,`Pelanggan: ${def.customer}`,`Tanggal: ${today}`,`Nilai Kontrak: ${rp(def.contract)}`,...extra,'Semua pihak, transaksi dan referensi pada dokumen ini adalah simulasi.'];}
