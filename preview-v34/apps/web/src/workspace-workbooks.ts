import type { Cell, Workbook, Worksheet } from 'exceljs';

export const spreadsheetType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function addGuide(book:Workbook,lines:string[]){
  const sheet=book.addWorksheet('Panduan');
  sheet.columns=[{width:100}];
  sheet.addRows(lines.map(text=>[text]));
  for(const row of sheet.getRows(1,lines.length)??[]){
    row.getCell(1).alignment={wrapText:true,vertical:'top'};
    row.height=row.number===1?25:29;
  }
  sheet.getRow(1).font={bold:true,size:14,color:{argb:'FF1F4D81'}};
}
export function workbookTable(book:Workbook,name:string,headers:string[],widths:number[]){
  const sheet=book.addWorksheet(name,{views:[{state:'frozen',ySplit:1}]});
  sheet.columns=widths.map(width=>({width}));
  sheet.addRow(headers);
  const row=sheet.getRow(1);
  row.height=22;
  row.eachCell(cell=>{cell.font={bold:true,color:{argb:'FFFFFFFF'}};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF1F4D81'}}});
  return sheet;
}
export function readColumns(sheet:Worksheet,headers:string[]){
  const index=headers.map(label=>{
    const values=sheet.getRow(1).values as unknown[];
    return values.findIndex(cell=>String(cell??'').trim().toLowerCase()===label.toLowerCase());
  });
  if(index.some(i=>i<1))throw new Error('Judul kolom tidak sesuai templat. Gunakan file panduan.');
  return index;
}
export function workbookText(cell:Cell){
  if(typeof cell.value==='object'&&cell.value&&('formula' in cell.value||'sharedFormula' in cell.value))throw new Error('Gunakan nilai tetap, tanpa rumus di '+cell.address+'.');
  return cell.text.trim();
}
