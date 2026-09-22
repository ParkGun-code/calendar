import * as XLSX from 'xlsx';

// 텍스트에서 안전하게 'YYYY-MM-DD' 날짜만 추출하는 함수 (타임존 왜곡 0%)
function extractDateString(rawVal) {
  if (!rawVal) return null;

  // 1. 이미 Date 객체로 들어온 경우 타임존 오차 방지 (로컬 시간 기준 추출)
  if (rawVal instanceof Date) {
    const y = rawVal.getFullYear();
    const m = String(rawVal.getMonth() + 1).padStart(2, '0');
    const d = String(rawVal.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  const str = String(rawVal).trim();

  // 2. "2026-10-08" 또는 "2026.10.08" 형태 매칭
  const ymdMatch = str.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
  if (ymdMatch) {
    const y = ymdMatch[1];
    const m = ymdMatch[2].padStart(2, '0');
    const d = ymdMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 3. "26.10.08." 형태 (2자리 연도)
  const shortYmdMatch = str.match(/^(\d{2})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
  if (shortYmdMatch) {
    const y = `20${shortYmdMatch[1]}`;
    const m = shortYmdMatch[2].padStart(2, '0');
    const d = shortYmdMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 4. "05.11." 또는 "10.08" 형태 (월.일만 있는 경우)
  const mdMatch = str.match(/^(\d{1,2})[.\-\/](\d{1,2})/);
  if (mdMatch) {
    const m = mdMatch[1].padStart(2, '0');
    const d = mdMatch[2].padStart(2, '0');
    return `2026-${m}-${d}`;
  }

  // 5. 만약 엑셀 일련번호 숫자로 들어온 경우 (타임존 없이 순수 일수로 계산)
  const num = Number(str);
  if (!isNaN(num) && num > 30000 && num < 60000) {
    // 엑셀 1900년 윤년 버그(2일 보정)를 반영한 정확한 날짜 계산
    const utcDays = Math.floor(num - 25569);
    const date = new Date(utcDays * 86400 * 1000);
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  return null;
}

export function parseInspectionExcel(fileBuffer) {
  // ★ cellDates: false 로 읽어야 엑셀 고유 서식 문자열을 왜곡 없이 읽어옵니다.
  const workbook = XLSX.read(fileBuffer, { type: 'array', cellDates: false });
  
  // '전체' 시트 우선 선택
  const targetSheetName = workbook.SheetNames.find(name => name.includes('전체')) || workbook.SheetNames[0];
  const sheet = workbook.Sheets[targetSheetName];
  
  // raw: false 설정으로 엑셀 화면에 보이는 텍스트("2026-10-08") 그대로 획득
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
  
  const schedules = [];
  
  for (let i = 3; i < rawData.length; i++) {
    const row = rawData[i];
    // 연번(row[1])과 공사명(row[5])이 있는 행만 대상
    if (!row || !row[1] || !row[5]) continue;

    // 25번째 열 (점검예정일)
    const formattedDate = extractDateString(row[24]);

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
      check_date: formattedDate // '2026-10-08' 정확히 유지
    });
  }

  return schedules;
}
