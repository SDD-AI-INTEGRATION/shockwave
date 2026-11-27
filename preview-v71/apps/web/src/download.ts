export function downloadFile(blob: Blob, name: string) {
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;link.download=name;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

export async function word(name:string, title:string, lines:string[], table?:string[][], customLogo?:string) {
  const {Document,HeadingLevel,ImageRun,Packer,Paragraph,Table,TableCell,TableRow}=await import('docx');
  const response=await fetch(customLogo||'/brand/sdd.png');
  if(!response.ok)throw new Error('Logo dokumen gagal dimuat.');
  let logo=new Uint8Array(await response.arrayBuffer());
  let logoWidth=111,logoHeight=49;
  if(customLogo){
    const bitmap=await createImageBitmap(new Blob([logo],{type:response.headers.get('content-type')||'image/png'}));
    try{
      const canvas=document.createElement('canvas');
      canvas.width=bitmap.width;canvas.height=bitmap.height;
      canvas.getContext('2d')!.drawImage(bitmap,0,0);
      const image=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/png'));
      if(!image)throw new Error('Logo dokumen tidak dapat diproses.');
      logo=new Uint8Array(await image.arrayBuffer());
      const scale=Math.min(111/bitmap.width,56/bitmap.height);
      logoWidth=Math.max(1,Math.round(bitmap.width*scale));logoHeight=Math.max(1,Math.round(bitmap.height*scale));
    }finally{bitmap.close()}
  }
  const content = [
    new Paragraph({children:[new ImageRun({type:'png',data:logo,transformation:{width:logoWidth,height:logoHeight}})]}),
    new Paragraph({text:title,heading:HeadingLevel.TITLE}),
    ...lines.flatMap(line=>line.split('\n').map(text=>{
      if(text.startsWith('## '))return new Paragraph({text:text.slice(3),heading:HeadingLevel.HEADING_2});
      if(text.startsWith('# '))return new Paragraph({text:text.slice(2),heading:HeadingLevel.HEADING_1});
      if(text.startsWith('- '))return new Paragraph({text:text.slice(2),bullet:{level:0}});
      return new Paragraph({text});
    })),
  ];
  const children = table?.length ? [...content,new Table({rows:table.map((row,i)=>new TableRow({
    tableHeader:i===0,children:row.map(value=>new TableCell({children:value.split('\n').map(text=>new Paragraph({text}))})),
  }))})] : content;
  downloadFile(await Packer.toBlob(new Document({sections:[{children}]})),name+'.docx');
}

export async function excel(name:string, title:string, rows:(string|number)[][]) {
  const ExcelJS=(await import('exceljs')).default;
  const book=new ExcelJS.Workbook();
  const sheet=book.addWorksheet(title,{views:[{state:'frozen',ySplit:1}]});
  sheet.addRows(rows);
  sheet.columns.forEach(col=>col.width=24);
  sheet.getRow(1).eachCell(cell=>{
    cell.font={bold:true,color:{argb:'FFFFFFFF'}};
    cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF0E1B4D'}};
  });
  sheet.eachRow(row=>row.eachCell(cell=>cell.alignment={wrapText:true,vertical:'top'}));
  const buffer=await book.xlsx.writeBuffer();
  downloadFile(new Blob([new Uint8Array(buffer)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),name+'.xlsx');
}
