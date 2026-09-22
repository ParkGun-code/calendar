import * as XLSX from 'xlsx';

// 모든 형태의 날짜(YYYY-MM-DD, 26.10.08., 05.11., 엑셀 일련번호)를 'YYYY-MM-DD'로 변환
function parseInspectionDate(rawVal) {
  if (!rawVal) return null;

  // 1. 이미 Date 객체인 경우
  if (rawVal instanceof Date) {
    const y = rawVal.getFullYear();
    const m = String(rawVal.getMonth() + 1).padStart(2, '0');
    const d = String(rawVal.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 2. 엑셀 숫자 일련번호인 경우 (예: 46303)
  const num = Number(rawVal);
  if (!isNaN(num) && num > 30000 && num < 60000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const dateObj = new Date(excelEpoch.getTime() + num * 86400000);
    const y = dateObj.getUTCFullYear();
    const m = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 3. 문자열 처리
  const str = String(rawVal).trim();

  // 3-1. 이미 'YYYY-MM-DD' 형태인 경우 (예: '2026-10-08')
  const isoMatch = str.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const y = isoMatch[1];
    const m = isoMatch[2].padStart(2, '0');
    const d = isoMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 3-2. 숫자 분리 추출 ('26.10.08.' 또는 '05.11.')
  const numbers = str.match(/\d+/g);
  if (numbers) {
    if (numbers.length >= 3) {
      // 3개 이상: [연도, 월, 일] (예: ['2026', '10', '08'] 또는 ['26', '10', '08'])
      let year = numbers[0];
      if (year.length === 2) year = `20${year}`;
      const month = numbers[1].padStart(2, '0');
      const day = numbers[2].padStart(2, '0');
      return `${year}-${month}-${day}`;
    } else if (numbers.length === 2) {
      // 2개: [월, 일] (예: ['05', '11'])
      const month = numbers[0].padStart(2, '0');
      const day = numbers[1].padStart(2, '0');
      return `2026-${month}-${day}`;
    }
  }

  return null;
}

export function parseInspectionExcel(fileBuffer) {
  // raw: false 설정 시 엑셀 화면에 보이는 텍스트 형태 그대로 읽어옴
  const workbook = XLSX.read(fileBuffer, { type: 'array', cellDates: true });
  
  // '전체' 글자가 포함된 시트 우선 선택
  const targetSheetName = workbook.SheetNames.find(name => name.includes('전체')) || workbook.SheetNames[0];
  const sheet = workbook.Sheets[targetSheetName];
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  
  const schedules = [];
  
  // 헤더를 건너뛰고 4번째 줄(인덱스 3)부터 데이터 파싱
  for (let i = 3; i < rawData.length; i++) {
    const row = rawData[i];
    // 연번(row[1])과 공사명(row[5])이 있는 행만 대상
    if (!row || !row[1] || !row[5]) continue;

    const formattedDate = parseInspectionDate(row[24]); // 25번째 열 (점검예정일)

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
