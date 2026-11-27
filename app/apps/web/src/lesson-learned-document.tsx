import type { RefObject } from 'react';
import { lessonAnswers, lessonCode, lessonDateLabel, type LessonData } from '../../../packages/shared/lesson-learned';
import { buildDocumentPdf } from './document-export';
import { downloadFile } from './download';
import type { DownloadFormat } from './download-menu';

const checklist='Project Lessons-Learned Checklist';
const description='Project Lessons-Learned Description';
const company='PT. SWADHARMA DUTA DATA';
const instruction='Place your cursor in the appropriate boxes and type an X. (Insert additional rows as needed)';
const headings=['No.','Lesson Learned','Yes','No','N/A'];
const mark=(answer:string|null,index:number)=>answer===lessonAnswers[index][0]?'X':'';
const widths=[6,70,8,8,8];
const columnLabels=(data:LessonData)=>[
  ['Project Name:',data.projectName],['Prepared by:',data.preparedByName],['Date:',lessonDateLabel(data.documentDate)],
];
const descriptionLabels=(data:LessonData)=>[['Project Name:',data.projectName],['Project Manager:',data.projectManagerName]];

export function LessonPaper({data,logo,paper}:{data:LessonData;logo:string;paper:RefObject<HTMLElement>}){
  let offset=0;
  const header=(title:string)=><header className="lesson-paper-header">
    <div><img src={logo} alt="Logo SDD"/><div>{company}</div></div><div>{title}<br/>{lessonCode}</div>
  </header>;
  const identities=(fields:string[][])=><table className="lesson-identities"><tbody>
    {fields.map(([label,value])=><tr key={label}><th scope="row">{label}</th><td>{value}</td></tr>)}
  </tbody></table>;
  return <article ref={paper} className="document-paper lesson-paper">
    {header(checklist)}
    <h2>PROJECT LESSONS-LEARNED CHECKLIST</h2>
    {identities(columnLabels(data))}
    <h3>1. {checklist}</h3>
    <table className="lesson-paper-checklist">
      <colgroup>{widths.map((width,i)=><col key={i} style={{width:width+'%'}}/>)}</colgroup>
      <thead><tr>{headings.map(title=><th key={title} scope="col">{title}</th>)}</tr>
      <tr><td colSpan={5}>{instruction}</td></tr></thead>
      <tbody>{data.categories.map(category=>{
        const start=offset;
        offset+=category.items.length;
        return <CategoryPaper key={category.id} category={category} offset={start}/>;
      })}</tbody>
    </table>
    <section data-document-page-break>
      {header(description)}
      <h3>2. {description}</h3>
      {identities(descriptionLabels(data))}
      <div className="lesson-paper-description" data-document-text>
        {data.description.split('\n').map((line,i)=><p key={i}>{line||'\u00a0'}</p>)}
      </div>
    </section>
  </article>;
}

function CategoryPaper({category,offset}:{category:LessonData['categories'][number];offset:number}){
  return <><tr className="lesson-paper-category" data-keep-with-next={category.items.length>0||undefined}><th colSpan={5}>{category.name}</th></tr>
    {category.items.map((item,index)=><tr key={item.id}><td>{offset+index+1}</td><td>{item.prompt}</td>
      {lessonAnswers.map(([key],index)=><td key={key}>{mark(item.answer,index)}</td>)}</tr>)}</>;
}

async function logoBytes(logo:string){
  const response=await fetch(logo);
  if(!response.ok)throw new Error('Logo resmi SDD gagal dimuat.');
  return new Uint8Array(await response.arrayBuffer());
}

export async function lessonWord(data:LessonData,logo:string){
  const [{AlignmentType,Document,ImageRun,Packer,Paragraph,Table,TableCell,TableRow,TextRun,WidthType},logoData]=await Promise.all([
    import('docx'),logoBytes(logo),
  ]);
  const para=(value:string,{bold=false,center=false,breakBefore=false,keepNext=false}={})=>new Paragraph({
    alignment:center?AlignmentType.CENTER:undefined,pageBreakBefore:breakBefore,keepNext,
    spacing:{line:240,after:30},
    children:value.split('\n').map((text,index)=>new TextRun({text,break:index?1:undefined,bold,font:'Arial',size:20})),
  });
  const table=(rows:InstanceType<typeof TableRow>[],columnWidths?:number[])=>new Table({
    width:{size:100,type:WidthType.PERCENTAGE},columnWidths,
    margins:{top:45,bottom:45,left:75,right:75},rows,
  });
  const row=(values:string[],options:{header?:boolean;group?:boolean;note?:boolean}={})=>new TableRow({
    tableHeader:options.header||options.note,cantSplit:options.header||options.group||options.note,
    children:values.map((value,index)=>new TableCell({
      columnSpan:options.group||options.note?5:undefined,
      shading:options.header||options.group?{fill:options.header?'D7D7D7':'EEEEEE'}:undefined,
      children:[para(value,{bold:options.header||options.group,center:values.length===5&&index!==1,keepNext:options.group})],
    })),
  });
  const docHeader=(title:string)=>new Table({
    width:{size:100,type:WidthType.PERCENTAGE},columnWidths:[5400,5400],
    borders:{top:{style:'none'},bottom:{style:'none'},left:{style:'none'},right:{style:'none'},insideHorizontal:{style:'none'},insideVertical:{style:'none'}},
    rows:[new TableRow({cantSplit:true,children:[
      new TableCell({children:[new Paragraph({keepNext:true,children:[new ImageRun({
        type:'png',data:logoData,transformation:{width:109,height:48},
      })]}),para(company,{bold:true,keepNext:true})]}),
      new TableCell({verticalAlign:'center',children:[new Paragraph({alignment:AlignmentType.RIGHT,children:[
        new TextRun({text:title,bold:true,font:'Arial',size:20}),
        new TextRun({text:lessonCode,break:1,bold:true,font:'Arial',size:20}),
      ]})]}),
    ]})],
  });
  let number=0;
  const rows=[row(headings,{header:true}),row([instruction],{note:true})];
  for(const category of data.categories){
    rows.push(row([category.name],{group:true}));
    for(const item of category.items)rows.push(row([String(++number),item.prompt,...lessonAnswers.map((_,index)=>mark(item.answer,index))]));
  }
  return Packer.toBlob(new Document({
    title:'Lesson Learned',styles:{default:{document:{run:{font:'Arial',size:20}}}},
    sections:[{properties:{page:{size:{width:11906,height:16838},margin:{top:567,bottom:567,left:567,right:567}}},children:[
      docHeader(checklist),para('PROJECT LESSONS-LEARNED CHECKLIST',{bold:true,center:true,keepNext:true}),
      table(columnLabels(data).map(value=>row(value)),[2700,8000]),
      para('1. '+checklist,{bold:true,keepNext:true}),table(rows,[645,7540,860,860,860]),
      new Paragraph({pageBreakBefore:true,keepNext:true,spacing:{after:0, line:1,lineRule:'exact'}}),docHeader(description),para('2. '+description,{bold:true,keepNext:true}),table(descriptionLabels(data).map(value=>row(value)),[2700,8000]),
      new Paragraph({spacing:{before:120}}),
      table([new TableRow({children:[new TableCell({children:data.description.split('\n').map(line=>para(line))})]})]),
    ]}],
  }));
}

export async function lessonExcel(data:LessonData,logo:string){
  const [{default:ExcelJS},logoData]=await Promise.all([import('exceljs'),logoBytes(logo)]);
  const book=new ExcelJS.Workbook();
  const image=book.addImage({buffer:logoData.buffer as ArrayBuffer,extension:'png'});
  const options={pageSetup:{paperSize:9,orientation:'portrait' as const,fitToPage:true,fitToWidth:1,fitToHeight:0}};
  const sheet=book.addWorksheet('Checklist',options);
  sheet.columns=[{width:7},{width:74},{width:8},{width:8},{width:8}];
  const notes=book.addWorksheet('Description',options);
  notes.columns=[{width:28},{width:78}];
  function brand(target:typeof sheet,title:string){
    target.getRow(1).height=40;
    target.addImage(image,{tl:{col:0,row:0},ext:{width:109,height:48}});
    target.getCell('B1').value=title+' · '+lessonCode;
    target.getCell('B1').alignment={horizontal:'right',vertical:'middle',wrapText:true};
    target.addRow([company]);
  }
  function section(target:typeof sheet,title:string,last:number){
    const row=target.addRow([title]);
    target.mergeCells(row.number,1,row.number,last);
    row.getCell(1).font={bold:true};
    row.getCell(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE5E5E5'}};
  }
  brand(sheet,checklist);
  for(const [label,value] of columnLabels(data)){
    const date=label==='Date:'&&data.documentDate;
    const row=sheet.addRow([label,date?new Date(data.documentDate+'T00:00:00.000Z'):value]);
    sheet.mergeCells(row.number,2,row.number,5);
    if(date)row.getCell(2).numFmt='dd/mm/yyyy';
  }
  section(sheet,'1. '+checklist,5);
  sheet.addRow(headings).font={bold:true};
  sheet.pageSetup.printTitlesRow='7:7';
  const help=sheet.addRow([instruction]);
  sheet.mergeCells(help.number,1,help.number,5);
  let number=0;
  for(const category of data.categories){
    section(sheet,category.name,5);
    for(const item of category.items){
      const row=sheet.addRow([++number,item.prompt,...lessonAnswers.map((_,index)=>mark(item.answer,index)||null)]);
      row.height=Math.max(17,item.prompt.split('\n').reduce((total,line)=>total+Math.max(1,Math.ceil(line.length/65)),0)*15);
      row.getCell(2).alignment={wrapText:true,vertical:'top'};
      for(let col=3;col<=5;col++)row.getCell(col).alignment={horizontal:'center',vertical:'middle'};
    }
  }
  brand(notes,description);
  section(notes,'2. '+description,2);
  for(const values of descriptionLabels(data))notes.addRow(values);
  // Keep long descriptions editable and visible within Excel's maximum row height.
  for(const line of data.description.split('\n')){
    const segments=line.match(/[\s\S]{1,1200}/gu)??[''];
    for(const value of segments){
      const row=notes.addRow([value]);
      notes.mergeCells(row.number,1,row.number,2);
      row.height=Math.max(17,Math.ceil(value.length/85)*16);
      row.getCell(1).alignment={wrapText:true,vertical:'top'};
    }
  }
  return new Blob([new Uint8Array(await book.xlsx.writeBuffer())],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}

export async function downloadLesson(format:DownloadFormat,data:LessonData,logo:string,paper:HTMLElement,name:string){
  if(format==='Word')downloadFile(await lessonWord(data,logo),name+'.docx');
  if(format==='Excel')downloadFile(await lessonExcel(data,logo),name+'.xlsx');
  if(format==='PDF')downloadFile(await buildDocumentPdf(paper,name),name+'.pdf');
}
