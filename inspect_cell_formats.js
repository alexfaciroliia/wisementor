const ExcelJS = require('exceljs');
const path = require('path');

async function inspectCellFormats(filepath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filepath);
  const ws = wb.worksheets[0];
  console.log('\n======================================================');
  console.log('ARQUIVO:', path.basename(filepath));
  console.log('======================================================');
  
  const row1 = ws.getRow(1);
  const row2 = ws.getRow(2);

  for (let c = 1; c <= ws.columnCount; c++) {
    const cell1 = row1.getCell(c);
    const cell2 = row2.getCell(c);
    const letter = ws.getColumn(c).letter;
    
    console.log(`Col ${c} (${letter}):`);
    console.log(`  Header: "${String(cell1.value).replace(/\n/g, '↵')}"`);
    console.log(`  Row 2 Value:`, cell2.value, `(type: ${cell2.type})`);
    console.log(`  Row 2 numFmt:`, cell2.numFmt);
    console.log(`  Row 2 alignment:`, JSON.stringify(cell2.alignment));
    console.log(`  Row 2 font:`, JSON.stringify(cell2.font));
  }
}

async function main() {
  await inspectCellFormats('c:\\WiseMentor\\Planilha 2 - Modelo UpSeller Produtos Únicos (base).xlsx');
  await inspectCellFormats('c:\\WiseMentor\\Planilha 3 - Modelo UpSeller Produtos Variantes (base).xlsx');
}

main().catch(console.error);
