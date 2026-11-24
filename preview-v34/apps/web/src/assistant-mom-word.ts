import type { MomData } from '../../../packages/shared/mom-sample';
import { downloadFile } from './download';
import { readOutcome } from './mom-editors';
import { dateLabel } from './ui';

export const momWordFileName='Contoh-Notulen-Rapat.docx';

export async function downloadMomWord(mom:MomData) {
  const {
    AlignmentType, BorderStyle, Document, Footer, HeadingLevel, ImageRun, LevelFormat,
    Packer, PageNumber, Paragraph, Table, TableCell, TableLayoutType, TableRow, TextRun, VerticalAlign, WidthType,
  }=await import('docx');

  const f=mom.fields;
  const navy='142B55', blue='204779', text='263754', muted='546580', line='CFDAE8', tint='F0F5FA';
  const font='Calibri';
  const width=9906;
  type Row={label:string;value:string};
  type Part=InstanceType<typeof Paragraph>|InstanceType<typeof Table>;
  const run=(value:string,properties:{size?:number;bold?:boolean;color?:string}={})=>new TextRun({text:value,font,...properties});
  const paragraph=(value:string)=>new Paragraph({children:[run(value)]});
  const heading=(value:string)=>new Paragraph({
    heading:HeadingLevel.HEADING_1,keepNext:true,spacing:{before:142,after:55},
    children:[run(value,{size:24,bold:true,color:navy})],
  });
  const subheading=(value:string,nested:boolean)=>new Paragraph({
    heading:nested?HeadingLevel.HEADING_3:HeadingLevel.HEADING_2,
    keepNext:true,spacing:{before:nested?38:68,after:35},
    children:[run(value,{size:nested?19:20,bold:true,color:nested?muted:blue})],
  });
  const border={style:BorderStyle.SINGLE,color:line,size:5} as const;
  const grid={top:border,bottom:border,left:border,right:border,insideHorizontal:border,insideVertical:border};
  function table(rows:InstanceType<typeof TableRow>[],columnWidths:number[]){
    return new Table({width:{size:width,type:WidthType.DXA},layout:TableLayoutType.FIXED,columnWidths,margins:{top:65,bottom:65,left:105,right:105},borders:grid,rows});
  }
  function cell(value:string,size:number,{header=false,shade=false,center=false}:{header?:boolean;shade?:boolean;center?:boolean}={}){
    return new TableCell({
      width:{size,type:WidthType.DXA},verticalAlign:VerticalAlign.CENTER,
      shading:header?{fill:navy}:shade?{fill:tint}:undefined,
      children:[new Paragraph({
        spacing:{after:0,line:245},alignment:center?AlignmentType.CENTER:AlignmentType.LEFT,
        children:[run(value,{bold:header,color:header?'FFFFFF':text,size:20})],
      })],
    });
  }
  function fieldCell(field:Row,size:number){
    return new TableCell({
      width:{size,type:WidthType.DXA},shading:{fill:tint},
      children:[new Paragraph({
        spacing:{after:0,line:248},
        children:[run(field.label+'  ',{bold:true,color:navy,size:20}),run(field.value||'—',{size:20})],
      })],
    });
  }
  const docDate=(date:string|undefined)=>date?dateLabel(date):'—';
  const response=await fetch('/brand/sdd.png');
  if(!response.ok)throw new Error('Logo dokumen gagal dimuat.');
  const logo=new Uint8Array(await response.arrayBuffer());

  const metadataWidths=[4953,4953];
  const metadata:Row[][]=[
    [{label:'Tanggal',value:docDate(f.date)},{label:'Waktu',value:[f.start,f.end].filter(Boolean).join('–')+(f.start||f.end?' WIB':'')}],
    [{label:'Lokasi',value:f.location||f.online},{label:'Divisi',value:f.division}],
  ];
  const followupWidths=[520,3936,1480,1690,2280];
  const followupHeaders=['No.','Tindak lanjut','Pihak','PIC','Tenggat'];
  const attendees=(f.attendees||'').split(/\r?\n/).map(name=>name.trim()).filter(Boolean);
  const discussion=[f.previous,f.result].filter(Boolean).flatMap(readOutcome);
  const children:Part[]=[
    new Paragraph({spacing:{after:48},children:[new ImageRun({type:'png',data:logo,transformation:{width:84,height:37}})]}),
    new Paragraph({
      heading:HeadingLevel.TITLE,keepNext:true,spacing:{before:0,after:24,line:290},
      children:[run('Notulen Rapat',{size:46,bold:true,color:navy})],
    }),
    new Paragraph({
      keepNext:true,spacing:{after:90},
      border:{bottom:{...border,size:12,space:5,color:blue}},
      children:[run([f.number,'Contoh data fiktif'].filter(Boolean).join('  ·  '),{color:muted,size:19})],
    }),
    heading('Informasi rapat'),
    table(metadata.map(row=>new TableRow({cantSplit:true,children:row.map((field,i)=>fieldCell(field,metadataWidths[i]))})),metadataWidths),
    new Paragraph({spacing:{before:82,after:48},children:[run('Tujuan  ',{bold:true,color:navy}),run(f.purpose||'—')]}),
    heading('Peserta'),
  ];
  if(f.internal||f.customer)children.push(new Paragraph({
    children:[
      ...(f.internal?[run('Tim internal  ',{bold:true,color:navy}),run(f.internal)]:[]),
      ...(f.internal&&f.customer?[run('  ·  ',{color:muted})]:[]),
      ...(f.customer?[run('Pelanggan  ',{bold:true,color:navy}),run(f.customer)]:[]),
    ],
  }));
  attendees.forEach(attendee=>children.push(new Paragraph({numbering:{reference:'mom-bullets',level:0},spacing:{after:22},children:[run(attendee)]})));

  if(discussion.length){
    children.push(heading('Pembahasan dan keputusan'));
    discussion.forEach((block,index)=>{
      if(block.type==='heading'||block.type==='subheading'){
        children.push(subheading(block.lines[0],block.type==='subheading'));
      }else{
        const ordered=block.type==='ordered';
        block.lines.forEach(value=>children.push(new Paragraph({
          numbering:ordered?{reference:'mom-decisions',level:0,instance:index}:block.type==='list'?{reference:'mom-bullets',level:0}:undefined,
          spacing:{after:24},children:[run(value)],
        })));
      }
    });
  }
  if(mom.followups.length){
    children.push(heading('Tindak lanjut'),table([
      new TableRow({tableHeader:true,cantSplit:true,children:followupHeaders.map((label,i)=>cell(label,followupWidths[i],{header:true,center:i===0}))}),
      ...mom.followups.map((row,i)=>new TableRow({
        cantSplit:true,
        children:[String(i+1),row.note,row.side,row.pic,docDate(row.due)].map((value,j)=>cell(value||'—',followupWidths[j],{shade:i%2===1,center:j===0})),
      })),
    ],followupWidths));
  }

  if(f.revisionNote||f.revisionDate||f.writer||f.manager){
    children.push(heading('Peninjauan dan pengesahan'));
    if(f.revisionNote)children.push(paragraph(f.revisionNote));
    if(f.revisionDate)children.push(new Paragraph({children:[run('Batas koreksi  ',{bold:true,color:navy}),run(docDate(f.revisionDate))]}));
    if(f.closing)children.push(paragraph(f.closing));
    if(f.place||f.signDate)children.push(new Paragraph({
      keepNext:true,spacing:{before:45,after:50},
      children:[run([f.place,f.signDate&&docDate(f.signDate)].filter(Boolean).join(', '),{color:muted})],
    }));
    if(f.writer||f.manager)children.push(table([new TableRow({
      cantSplit:true,
      children:[
        {label:'Disusun oleh',name:f.writer,title:f.writerTitle},
        {label:'Disetujui oleh',name:f.manager,title:f.managerTitle},
      ].map(person=>new TableCell({
        width:{size:4953,type:WidthType.DXA},shading:{fill:tint},
        children:[
          new Paragraph({spacing:{after:135},children:[run(person.label,{color:muted,size:18})]}),
          new Paragraph({spacing:{after:12},children:[run(person.name||'—',{bold:true,color:navy})]}),
          new Paragraph({spacing:{after:0},children:[run(person.title||'',{size:19})]}),
        ],
      })),
    })],[4953,4953]));
  }
  const doc=new Document({
    title:'Notulen Rapat',creator:'Shockwave PMO',
    styles:{default:{document:{run:{font,color:text,size:21},paragraph:{spacing:{line:257,after:43}}}}},
    numbering:{config:[
      {reference:'mom-decisions',levels:[{level:0,format:LevelFormat.DECIMAL,text:'%1.',start:1,alignment:AlignmentType.LEFT,
        style:{paragraph:{indent:{left:380,hanging:230}}}}]},
      {reference:'mom-bullets',levels:[{level:0,format:LevelFormat.BULLET,text:'•',alignment:AlignmentType.LEFT,
        style:{paragraph:{indent:{left:380,hanging:230}}}}]},
    ]},
    sections:[{
      properties:{page:{size:{width:11906,height:16838},margin:{top:820,bottom:790,left:1000,right:1000,footer:450}}},
      footers:{default:new Footer({children:[new Paragraph({
        spacing:{after:0},alignment:AlignmentType.RIGHT,border:{top:{...border,space:4}},
        children:[run('Contoh notulen  ·  ',{size:17,color:muted}),new TextRun({font,color:muted,size:17,children:[PageNumber.CURRENT]})],
      })]})},
      children,
    }],
  });
  downloadFile(await Packer.toBlob(doc),momWordFileName);
}
