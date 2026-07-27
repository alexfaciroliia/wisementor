const ExcelJS = require('exceljs');
const path = require('path');

const file2 = path.join('c:\\WiseMentor', 'Planilha 2 - Modelo UpSeller Produtos Únicos (sistema).xlsx');
const file3 = path.join('c:\\WiseMentor', 'Planilha 3 - Modelo UpSeller Produtos Variantes (sistema).xlsx');

function colorToString(color) {
  if (!color) return 'none';
  if (color.argb) return color.argb;
  if (color.theme !== undefined) return `theme:${color.theme}(tint:${color.tint})`;
  if (color.indexed !== undefined) return `indexed:${color.indexed}`;
  return 'unknown';
}

function fontToString(font) {
  if (!font) return 'none';
  return `name=${font.name || 'default'} size=${font.size || 'default'} bold=${!!font.bold} italic=${!!font.italic} color=${colorToString(font.color)}`;
}

function fillToString(fill) {
  if (!fill) return 'none';
  if (fill.type === 'pattern') {
    return `pattern=${fill.pattern} fg=${colorToString(fill.fgColor)} bg=${colorToString(fill.bgColor)}`;
  }
  return JSON.stringify(fill);
}

async function analyzeSheet(filepath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filepath);
  const ws = wb.worksheets[0];
  const filename = path.basename(filepath);
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Arquivo: ${filename}`);
  console.log(`Aba: ${ws.name}`);
  console.log(`${'='.repeat(70)}`);

  // Header rows (1 to 3)
  for (let rowIdx = 1; rowIdx <= 3; rowIdx++) {
    const row = ws.getRow(rowIdx);
    let hasContent = false;
    row.eachCell({ includeEmpty: false }, () => { hasContent = true; });
    if (!hasContent && rowIdx > 1) continue;
    
    console.log(`\n--- Linha ${rowIdx} ---`);
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const colLetter = ws.getColumn(colNumber).letter || String.fromCharCode(64 + colNumber);
      const colWidth = ws.getColumn(colNumber).width;
      console.log(`  ${colLetter}: val='${cell.value}' | fill=[${fillToString(cell.fill)}] | font=[${fontToString(cell.font)}] | width=${colWidth}`);
    });
  }

  // Column widths
  console.log(`\n--- Larguras das colunas ---`);
  for (let i = 1; i <= Math.min(ws.columnCount, 25); i++) {
    const col = ws.getColumn(i);
    const letter = String.fromCharCode(64 + i);
    console.log(`  Col ${letter}: width=${col.width}`);
  }

  return ws;
}

async function main() {
  const ws2 = await analyzeSheet(file2);
  const ws3 = await analyzeSheet(file3);

  console.log(`\n\n${'='.repeat(70)}`);
  console.log('DIFERENÇAS NO CABEÇALHO (Linha 1):');
  console.log(`${'='.repeat(70)}`);

  const maxCol = Math.max(ws2.columnCount, ws3.columnCount);
  let diffCount = 0;

  for (let col = 1; col <= Math.max(30, maxCol); col++) {
    const cell2 = ws2.getCell(1, col);
    const cell3 = ws3.getCell(1, col);
    const colLetter = String.fromCharCode(64 + col);

    const fill2 = fillToString(cell2.fill);
    const fill3 = fillToString(cell3.fill);
    const font2 = fontToString(cell2.font);
    const font3 = fontToString(cell3.font);
    const width2 = ws2.getColumn(col).width;
    const width3 = ws3.getColumn(col).width;

    const diffs = [];
    if (fill2 !== fill3) diffs.push(`FILL: P2=[${fill2}] vs P3=[${fill3}]`);
    if (font2 !== font3) diffs.push(`FONT: P2=[${font2}] vs P3=[${font3}]`);
    if (width2 !== width3) diffs.push(`WIDTH: P2=${width2} vs P3=${width3}`);

    if (diffs.length > 0) {
      diffCount++;
      console.log(`\nCol ${colLetter}: P2='${cell2.value}' | P3='${cell3.value}'`);
      diffs.forEach(d => console.log(`  -> ${d}`));
    }
  }

  if (diffCount === 0) {
    console.log('Nenhuma diferença encontrada no cabeçalho!');
  } else {
    console.log(`\nTotal de ${diffCount} coluna(s) com diferença.`);
  }
}

main().catch(console.error);
