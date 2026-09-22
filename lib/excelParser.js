import * as XLSX from 'xlsx';

export function parseInspectionExcel(fileBuffer) {
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  
  // '전체' 글자가 포함된 시트 우선 선택, 없으면 첫 번째 시트 선택
  const targetSheetName = workbook.SheetNames.find(name => name.includes('전체')) || workbook.SheetNames[0];
  const sheet = workbook.Sheets[targetSheetName];
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  
  const schedules = [];
  
  for (let i = 3; i < rawData.length; i++) {
    const row = rawData[i];
    if (!row || !row[1] || !row[5]) continue;

    let checkDateStr = row[24] ? String(row[24]).trim() : '';
    let formattedDate = null;
    
    if (checkDateStr) {
      // 숫자 배열 추출: "26.10.08." -> ['26', '10', '08'] / "05.11." -> ['05', '11']
      const numbers = checkDateStr.match(/\d+/g);
      
      if (numbers) {
        if (numbers.length >= 3) {
          // [연, 월, 일] 형식인 경우 (예: '26.10.08.')
          let year = numbers[0];
          if (year.length === 2) year = `20${year}`;
          const month = numbers[1].padStart(2, '0');
          const day = numbers[2].padStart(2, '0');
          formattedDate = `${year}-${month}-${day}`;
        } else if (numbers.length === 2) {
          // [월, 일] 형식인 경우 (예: '05.11.')
          const month = numbers[0].padStart(2, '0');
          const day = numbers[1].padStart(2, '0');
          formattedDate = `2026-${month}-${day}`;
        }
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
