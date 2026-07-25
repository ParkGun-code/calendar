import * as XLSX from 'xlsx';

export function parseInspectionExcel(fileBuffer) {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames.includes('전체') ? '전체' : workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  
  const schedules = [];
  
  for (let i = 3; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || !row[1] || !row[5]) continue;

    let checkDateStr = row[24] ? String(row[24]).trim() : '';
    let formattedDate = null;
    
    if (checkDateStr) {
      // "05.11." 또는 "05.11" 형태에서 숫자만 추출 (예: ['05', '11'])
      const numbers = checkDateStr.match(/\d+/g);
      if (numbers && numbers.length >= 2) {
        const month = numbers[0].padStart(2, '0');
        const day = numbers[1].padStart(2, '0');
        formattedDate = `2026-${month}-${day}`;
      }
    }

    if (!formattedDate) continue;

    schedules.push({
      idx: row[1],
      order_type: row[2] || '',
      category: row[3] || '',
      client: row[4] || '',
      project_name: row[5] || '',
      site_address: row[6] || '',
      builder: row[17] || '',
      supervisor: row[18] || '',
      manager_name: row[19] || '',
      manager_phone: row[20] || '',
      status_note: row[22] || '',
      group_name: row[23] || '미정',
      check_date: formattedDate
    });
  }

  return schedules;
}