const ExcelJS = require('exceljs');
const path = require('path');

// Analisa a planilha de referência (modelo correto)
async function analyzeRefSheet(filepath, label) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filepath);
  const ws = wb.worksheets[0];
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`${label}: ${path.basename(filepath)}`);
  console.log(`Aba: ${ws.name} | Total colunas: ${ws.columnCount} | Total linhas: ${ws.rowCount}`);
  console.log(`${'='.repeat(70)}`);

  function colorStr(c) {
    if (!c) return 'none';
    if (c.argb) return `argb:${c.argb}`;
    if (c.theme !== undefined) return `theme:${c.theme},tint:${c.tint || 0}`;
    if (c.indexed !== undefined) return `indexed:${c.indexed}`;
    return 'none';
  }

  function fontStr(f) {
    if (!f) return 'NO_FONT';
    return `[name:${f.name||'?'} size:${f.size||'?'} bold:${!!f.bold} color:${colorStr(f.color)}]`;
  }

  function fillStr(f) {
    if (!f || !f.type) return 'NO_FILL';
    if (f.type === 'pattern') return `[pattern:${f.pattern} fg:${colorStr(f.fgColor)} bg:${colorStr(f.bgColor)}]`;
    return JSON.stringify(f);
  }

  // Linha 1 - cabeçalho
  const row1 = ws.getRow(1);
  console.log(`\n--- LINHA 1 (Cabeçalho) ---`);
  row1.eachCell({ includeEmpty: false }, (cell, colNum) => {
    const col = ws.getColumn(colNum);
    console.log(`  Col${colNum}(${col.letter}): val="${String(cell.value).substring(0,40).replace(/\n/g,'↵')}" | fill=${fillStr(cell.fill)} | font=${fontStr(cell.font)} | align=[h:${cell.alignment?.horizontal} v:${cell.alignment?.vertical} wrap:${cell.alignment?.wrapText}] | width=${col.width}`);
  });

  // Linha 2 - primeira linha de dados
  const row2 = ws.getRow(2);
  let hasRow2 = false;
  row2.eachCell({ includeEmpty: false }, () => { hasRow2 = true; });
  if (hasRow2) {
    console.log(`\n--- LINHA 2 (1ª linha de dados) ---`);
    row2.eachCell({ includeEmpty: false }, (cell, colNum) => {
      const col = ws.getColumn(colNum);
      console.log(`  Col${colNum}(${col.letter}): val="${String(cell.value).substring(0,40).replace(/\n/g,'↵')}" | fill=${fillStr(cell.fill)} | font=${fontStr(cell.font)}`);
    });
  }

  // Altura das linhas
  console.log(`\n--- Alturas das linhas ---`);
  for (let r = 1; r <= Math.min(3, ws.rowCount); r++) {
    console.log(`  Linha ${r}: height=${ws.getRow(r).height}`);
  }

  // Larguras completas
  console.log(`\n--- Larguras de todas as colunas ---`);
  for (let c = 1; c <= ws.columnCount; c++) {
    const col = ws.getColumn(c);
    console.log(`  Col${c}(${col.letter}): width=${col.width}`);
  }

  return ws;
}

async function main() {
  // Analisa os 4 arquivos: 2 de referência e 2 do sistema
  const files = [
    { path: 'c:\\WiseMentor\\Planilha 2 - Modelo UpSeller Produtos Únicos.xlsx', label: 'P2 REFERÊNCIA' },
    { path: 'c:\\WiseMentor\\Planilha 3 - Modelo UpSeller Produtos Variantes.xlsx', label: 'P3 REFERÊNCIA' },
    { path: 'c:\\WiseMentor\\Planilha 2 - Modelo UpSeller Produtos Únicos (sistema).xlsx', label: 'P2 SISTEMA' },
    { path: 'c:\\WiseMentor\\Planilha 3 - Modelo UpSeller Produtos Variantes (sistema).xlsx', label: 'P3 SISTEMA' },
  ];

  for (const f of files) {
    await analyzeRefSheet(f.path, f.label);
  }
}

main().catch(console.error);
