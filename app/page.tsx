'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { parseInspectionExcel } from '../lib/excelParser';
import { Upload } from 'lucide-react';

// FullCalendar 컴포넌트를 서버 렌더링(SSR)에서 제외하고 브라우저에서만 로드하도록 설정
const FieldInspectionCalendar = dynamic(
  () => import('../components/FieldInspectionCalendar'),
  { ssr: false }
);

export default function HomePage() {
  const [scheduleData, setScheduleData] = useState([]);
  const [fileName, setFileName] = useState('');

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const buffer = event.target.result;
      const parsedData = parseInspectionExcel(buffer);
      setScheduleData(parsedData);
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <main className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="max-w-5xl mx-auto mb-6 bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-800">현장점검 일정 캘린더</h1>
          <p className="text-xs text-slate-500">엑셀 파일(.xlsx)을 올리면 아래 캘린더에 조별로 즉시 표시됩니다.</p>
        </div>

        <label className="cursor-pointer bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-2.5 rounded-lg flex items-center gap-2 shadow transition-colors">
          <Upload className="w-4 h-4" />
          <span>엑셀 파일 선택</span>
          <input 
            type="file" 
            accept=".xlsx, .xls" 
            onChange={handleFileUpload} 
            className="hidden" 
          />
        </label>
      </div>

      {fileName && (
        <div className="max-w-5xl mx-auto mb-4 text-xs text-slate-600 text-right">
          현재 불러온 파일: <span className="font-semibold text-blue-600">{fileName}</span> ({scheduleData.length}건)
        </div>
      )}

      <div className="max-w-5xl mx-auto">
        <FieldInspectionCalendar initialData={scheduleData} />
      </div>
    </main>
  );
}
