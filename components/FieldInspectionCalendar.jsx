import React, { useState, useEffect, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import * as XLSX from 'xlsx';
import { 
  Phone, 
  MapPin, 
  Filter, 
  PhoneCall, 
  Edit3, 
  Save, 
  FileText, 
  CheckCircle2, 
  Navigation, 
  Copy, 
  Check, 
  Calendar as CalendarIcon,
  Upload,
  Trash2,
  RefreshCw,
  X,
  Building,
  Sparkles,
  Camera,
  Search
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { marked } from 'marked';

const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY;

// Supabase 클라이언트 초기화
const getSupabaseClient = () => {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (url && key && url.startsWith('http')) {
      return createClient(url, key);
    }
  } catch (e) {
    console.warn('Supabase 클라이언트 초기화 생략:', e);
  }
  return null;
};

// 모던하고 은은한 파스텔톤 컬러 팔레트
const GROUP_COLORS = {
  '1조': { bg: '#60A5FA', text: '#ffffff' },   // 파스텔 블루
  '2조': { bg: '#34D399', text: '#ffffff' },   // 파스텔 민트
  '3조': { bg: '#FBBF24', text: '#ffffff' },   // 파스텔 앰버
  'TF1조': { bg: '#A78BFA', text: '#ffffff' }, // 파스텔 퍼플
  'TF2조': { bg: '#F472B6', text: '#ffffff' }  // 파스텔 핑크
};

const parseCheckDate = (val) => {
  if (!val) return '';
  const strVal = String(val).trim();
  const mmddMatch = strVal.match(/^(\d{1,2})[\.\/-](\d{1,2})[\.]?$/);
  if (mmddMatch) {
    const m = String(mmddMatch[1]).padStart(2, '0');
    const d = String(mmddMatch[2]).padStart(2, '0');
    return `2026-${m}-${d}`;
  }
  if (typeof val === 'number') {
    const jsDate = XLSX.SSF.parse_date_code(val);
    if (jsDate) {
      return `${jsDate.y}-${String(jsDate.m).padStart(2, '0')}-${String(jsDate.d).padStart(2, '0')}`;
    }
  }
  if (val instanceof Date) {
    return `${val.getFullYear()}-${String(val.getMonth() + 1).padStart(2, '0')}-${String(val.getDate()).padStart(2, '0')}`;
  }
  if (/^\d{8}$/.test(strVal)) {
    return `${strVal.substring(0, 4)}-${strVal.substring(4, 6)}-${strVal.substring(6, 8)}`;
  }
  const cleanStr = strVal.replace(/\./g, '-').replace(/\//g, '-');
  const dateObj = new Date(cleanStr);
  if (!isNaN(dateObj.getTime())) {
    return `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
  }
  return '';
};

export default function FieldInspectionCalendar({ initialData = [] }) {
  const [selectedGroup, setSelectedGroup] = useState('ALL');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [events, setEvents] = useState([]);
  const [masterData, setMasterData] = useState([]);
  const [deleteMonth, setDeleteMonth] = useState('2026-05');
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // 편집 모드 상태 및 입력폼 상태
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    group_name: '1조',
    project_name: '',
    check_date: '',
    site_address: '',
    builder: '',
    supervisor: '',
    manager_name: '',
    manager_phone: '',
    status_note: '',
    memo: ''
  });

  // AI 현장 사진 분석 상태
  const [aiActiveTab, setAiActiveTab] = useState('detail');
  const [aiPreviewUrl, setAiPreviewUrl] = useState(null);
  const [aiBase64Data, setAiBase64Data] = useState(null);
  const [aiMimeType, setAiMimeType] = useState(null);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState('');

  const calendarRef = useRef(null);
  const fileInputRef = useRef(null);
  const aiFileInputRef = useRef(null);

  // DB 데이터 로드
  const fetchEvents = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      if (initialData && initialData.length > 0) setMasterData(initialData);
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.from('events').select('*');
      if (error) throw error;

      if (data && data.length > 0) {
        const loadedData = data.map((item) => ({
          idx: item.id,
          group_name: item.team || '1조',
          project_name: item.location || item.title || '현장점검',
          check_date: item.start_date,
          site_address: item.address || '',
          builder: item.members || '',
          supervisor: item.supervisor || '',
          manager_name: item.agent_name || '',
          manager_phone: item.agent_phone || '',
          status_note: item.notes || '',
          memo: item.notes || ''
        }));
        setMasterData(loadedData);
      } else {
        setMasterData([]);
      }
    } catch (err) {
      console.error('DB 로딩 에러:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  useEffect(() => {
    const filtered = selectedGroup === 'ALL'
      ? masterData
      : masterData.filter(item => item.group_name === selectedGroup);

    const formatted = filtered.map(item => {
      const colorInfo = GROUP_COLORS[item.group_name] || { bg: '#60A5FA', text: '#ffffff' };
      const isDateChanged = item.is_date_modified ? ' [일정변경]' : '';
      return {
        id: String(item.idx),
        title: `[${item.group_name}] ${item.project_name}${isDateChanged}`,
        start: item.check_date,
        backgroundColor: colorInfo.bg,
        borderColor: 'transparent',
        extendedProps: { ...item }
      };
    });

    setEvents(formatted);

    if (masterData.length > 0 && calendarRef.current) {
      const calendarApi = calendarRef.current.getApi();
      const firstDate = masterData[0].check_date;
      if (firstDate) {
        calendarApi.gotoDate(firstDate);
      }
    }
  }, [selectedGroup, masterData]);

  const handleEventClick = (info) => {
    const data = info.event.extendedProps;
    setSelectedEvent(data);
    setEditForm({
      group_name: data.group_name || '1조',
      project_name: data.project_name || '',
      check_date: data.check_date || '',
      site_address: data.site_address || '',
      builder: data.builder || '',
      supervisor: data.supervisor || '',
      manager_name: data.manager_name || '',
      manager_phone: data.manager_phone || '',
      status_note: data.status_note || '',
      memo: data.memo || ''
    });
    setIsEditing(false);
    setCopied(false);
    setAiActiveTab('detail');
    setAiPreviewUrl(null);
    setAiBase64Data(null);
    setAiMimeType(null);
    setAiResult('');
  };

  // 정보 수정 및 일정 변경 DB 저장 처리
  const handleSaveInfo = async () => {
    if (!selectedEvent) return;

    const isDateModified = selectedEvent.check_date !== editForm.check_date;

    const updatedMaster = masterData.map(item => {
      if (item.idx === selectedEvent.idx) {
        return {
          ...item,
          group_name: editForm.group_name,
          project_name: editForm.project_name,
          check_date: editForm.check_date,
          site_address: editForm.site_address,
          builder: editForm.builder,
          supervisor: editForm.supervisor,
          manager_name: editForm.manager_name,
          manager_phone: editForm.manager_phone,
          status_note: editForm.status_note,
          memo: editForm.memo,
          is_date_modified: item.is_date_modified || isDateModified
        };
      }
      return item;
    });

    setMasterData(updatedMaster);
    setSelectedEvent(prev => ({
      ...prev,
      ...editForm,
      is_date_modified: prev.is_date_modified || isDateModified
    }));
    setIsEditing(false);

    // Supabase DB 업데이트
    const supabase = getSupabaseClient();
    if (supabase && !isNaN(Number(selectedEvent.idx))) {
      try {
        const updatedColor = GROUP_COLORS[editForm.group_name]?.bg || '#60A5FA';
        await supabase
          .from('events')
          .update({
            title: `[${editForm.group_name}] ${editForm.project_name}`,
            start_date: editForm.check_date,
            bg_color: updatedColor,
            border_color: updatedColor,
            team: editForm.group_name,
            location: editForm.project_name,
            address: editForm.site_address,
            members: editForm.builder,
            supervisor: editForm.supervisor,
            agent_name: editForm.manager_name,
            agent_phone: editForm.manager_phone,
            notes: editForm.memo || editForm.status_note
          })
          .eq('id', Number(selectedEvent.idx));
      } catch (e) {
        console.error('DB 수정 실패:', e);
      }
    }

    if (isDateModified && calendarRef.current && editForm.check_date) {
      const calendarApi = calendarRef.current.getApi();
      calendarApi.gotoDate(editForm.check_date);
    }

    alert('수정사항이 반영되었습니다.');
  };

  // AI 사진 파일 선택 처리
  const handleAiImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAiMimeType(file.type);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const res = evt.target?.result;
      setAiBase64Data(res.split(',')[1]);
      setAiPreviewUrl(res);
      setAiResult('');
    };
    reader.readAsDataURL(file);
  };

  // AI 국토부 기준 대조 실행
  const runAiAnalysis = async () => {
    if (!aiBase64Data || !aiMimeType) {
      alert('분석할 현장 사진을 먼저 등록해 주세요.');
      return;
    }

    const apiKey = GEMINI_API_KEY;
    if (!apiKey) {
      alert('NEXT_PUBLIC_GEMINI_API_KEY 환경변수가 설정되어 있지 않습니다.');
      return;
    }

    setAiAnalyzing(true);
    setAiResult('');

    const promptText = `당신은 대한민국 국토교통부 건설안전·품질 점검관입니다.
첨부된 현장 점검 사진을 분석하여 발견되는 시공 불량, 안전 취약 부위를 지적하고 관련 공식 기준을 제시하십시오.

[절대 준수 지침 - 원문 인용 및 환각 방지]
1. 적용 기준 엄격 제한:
   - 오직 대한민국 '국토교통부' 소관 법령 및 기준만 적용하십시오.
   - 대상: 표준시방서(KCS), 설계기준(KDS), 건설기술 진흥법(법률, 시행령, 시행규칙).
   - 타 부처 소관 법령(고용노동부 '산업안전보건법', '산업안전보건기준에 관한 규칙' 등)은 일절 인용하거나 언급하지 마십시오.
2. 조항 번호 및 원문 직인용 원칙:
   - 관련 기준은 반드시 공식 코드 번호, 장·절 번호, 조항 번호(예: KCS 14 31 25 제3장 3.4.2 등)를 명기하십시오.
   - 기준 내용은 요약하거나 추상화하지 말고, 고시된 공식 원문 문장 형태를 인용구(>) 안에 있는 그대로 제시하십시오.
3. 허위/추측 작성 금지 (Zero Hallucination):
   - 실제 존재하지 않는 코드 번호나 임의로 꾸며낸 규정 문장을 절대로 작성하지 마십시오.
   - 코드 번호나 정확한 원문 문구가 완벽히 확실하지 않은 경우에는 "추가 확인 필요"라고 기재하고 억지로 조항 번호를 지어내지 마십시오.

[작성 양식]
아래 순서와 형식에 맞추어 명확하게 작성하십시오:
1. 현장 사진 결함 및 문제점 분석
   - 시공 불량 상태, 부재 접합 상태, 규격 미달 사항 등을 항목별로 구체적으로 기술
2. 국토교통부 소관 관련 기준 및 법령 원문
   - **표준시방서(KCS)**: 코드 번호, 조항 명칭 및 공식 규정 원문 인용
   - **설계기준(KDS)**: 코드 번호, 조항 명칭 및 공식 규정 원문 인용
   - **건설기술 진흥법령**: 조항 번호(법·영·규칙 구분) 및 규정 원문 인용
3. 현장 시정 조치 지시사항
   - 시공사(현장대리인) 및 감리원에게 요구할 보수·보강·재시공 등의 기술적 조치사항`;

    const payload = {
      contents: [{
        role: 'user',
        parts: [
          { text: promptText },
          { inlineData: { mimeType: aiMimeType, data: aiBase64Data } }
        ]
      }],
      generationConfig: {
        temperature: 0.0
      }
    };

    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errDetail = await response.text();
        throw new Error(`API 통신 에러 (${response.status}): ${errDetail}`);
      }

      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '분석 결과를 가져올 수 없습니다.';
      setAiResult(text);
    } catch (err) {
      console.error(err);
      alert(`분석 중 오류 발생: ${err.message}`);
    } finally {
      setAiAnalyzing(false);
    }
  };

  // 특정 월 삭제 처리
  const handleDeleteSpecificMonth = async () => {
    if (!deleteMonth) return alert('삭제할 월을 선택하세요.');
    const yearMonthLabel = deleteMonth.replace('-', '년 ') + '월';
    if (!confirm(`정말로 ${yearMonthLabel}의 점검 데이터만 삭제하시겠습니까?`)) return;

    const supabase = getSupabaseClient();
    setIsLoading(true);
    try {
      if (supabase) {
        const { error } = await supabase.from('events').delete().like('start_date', `${deleteMonth}%`);
        if (error) alert(`[DB 삭제 오류]\n내용: ${error.message}`);
      }
      setMasterData(prev => prev.filter(item => !item.check_date.startsWith(deleteMonth)));
      alert(`${yearMonthLabel} 데이터가 삭제되었습니다.`);
    } catch (err) {
      console.error('월별 삭제 에러:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // 전체 데이터 초기화
  const handleClearDatabase = async () => {
    if (!confirm('정말로 등록된 전체 일정을 삭제하시겠습니까?')) return;
    const supabase = getSupabaseClient();
    if (supabase) {
      setIsLoading(true);
      try {
        await supabase.from('events').delete().neq('id', 0);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }
    setMasterData([]);
    alert('모든 일정이 초기화되었습니다.');
  };

  // 엑셀 업로드 처리
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: 'binary', cellDates: true });
        const wsname = workbook.SheetNames[0];
        const ws = workbook.Sheets[wsname];
        const sheetData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

        if (sheetData.length < 4) {
          alert('엑셀 파일에 데이터가 부족합니다.');
          setIsLoading(false);
          return;
        }

        const newItems = [];
        const dbRowsToInsert = [];

        for (let r = 0; r < sheetData.length; r++) {
          const row = sheetData[r];
          if (!row || row.length === 0) continue;

          const seq = String(row[1] || '').trim();
          const orderType = String(row[2] || '').trim();
          const category = String(row[3] || '').trim();
          const client = String(row[4] || '').trim();
          const projectName = String(row[5] || '').trim();
          const address = String(row[6] || '').trim();
          const builder = String(row[17] || '').trim();
          const supervisor = String(row[18] || '').trim();
          const agentName = String(row[19] || '').trim();
          const agentPhone = String(row[20] || '').trim();
          const progressStatus = String(row[22] || '').trim();
          const teamRaw = String(row[23] || '').trim();
          const rawCheckDate = row[24];

          if (teamRaw === '담당조' || String(rawCheckDate).includes('점검예정일')) continue;

          const checkDate = parseCheckDate(rawCheckDate);
          if (!checkDate) continue;

          const team = teamRaw || '1조';
          const color = GROUP_COLORS[team]?.bg || '#60A5FA';
          const title = `[${team}] ${projectName.replace(/\n/g, ' ') || '현장점검'}`;

          const itemIdx = Date.now() + Math.floor(Math.random() * 100000) + r;

          newItems.push({
            idx: itemIdx,
            group_name: team,
            project_name: projectName,
            check_date: checkDate,
            site_address: address,
            builder,
            supervisor,
            manager_name: agentName,
            manager_phone: agentPhone,
            status_note: progressStatus,
            memo: progressStatus
          });

          dbRowsToInsert.push({
            title,
            start_date: checkDate,
            end_date: null,
            bg_color: color,
            border_color: color,
            team,
            members: builder,
            location: projectName,
            notes: progressStatus,
            seq,
            order_type: orderType,
            category,
            client,
            address,
            supervisor,
            agent_name: agentName,
            agent_phone: agentPhone
          });
        }

        setMasterData(prev => [...prev, ...newItems]);

        const supabase = getSupabaseClient();
        if (supabase && dbRowsToInsert.length > 0) {
          try {
            await supabase.from('events').insert(dbRowsToInsert);
            await fetchEvents();
          } catch (err) {
            console.error('DB 저장 에러:', err);
          }
        }

        alert(`총 ${newItems.length}건의 일정이 추가되었습니다!`);
      } catch (err) {
        alert(`엑셀 처리 오류: ${err.message || err}`);
      } finally {
        setIsLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };

    reader.readAsBinaryString(file);
  };

  const handleCopyAddress = (address) => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-2 md:p-6">
      {/* 컨트롤 영역 상단바 */}
      <div className="bg-white p-4 rounded-xl shadow-sm mb-4 border border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-slate-500" />
            <span className="font-semibold text-slate-700 text-sm">조별 필터:</span>
            <select 
              value={selectedGroup}
              onChange={(e) => setSelectedGroup(e.target.value)}
              className="bg-slate-100 border border-slate-300 text-slate-800 text-sm rounded-lg p-2 font-medium focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">전체 보기 (전체조)</option>
              <option value="1조">1조</option>
              <option value="2조">2조</option>
              <option value="3조">3조</option>
              <option value="TF1조">TF1조</option>
              <option value="TF2조">TF2조</option>
            </select>
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            {Object.entries(GROUP_COLORS).map(([group, color]) => (
              <span 
                key={group} 
                style={{ backgroundColor: color.bg }} 
                className="px-3 py-1 rounded-full text-white font-bold shadow-sm"
              >
                {group}
              </span>
            ))}
          </div>
        </div>

        {/* 우측 관리 기능 버튼 세트 */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={fetchEvents}
            disabled={isLoading}
            className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 px-3 py-2 rounded-xl text-xs font-semibold transition"
            title="새로고침"
          >
            <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
          </button>

          <div className="flex items-center border border-slate-300 rounded-xl overflow-hidden bg-slate-50">
            <select
              value={deleteMonth}
              onChange={(e) => setDeleteMonth(e.target.value)}
              className="bg-transparent px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-none"
            >
              <option value="2026-05">2026년 5월</option>
              <option value="2026-06">2026년 6월</option>
              <option value="2026-07">2026년 7월</option>
              <option value="2026-08">2026년 8월</option>
              <option value="2026-09">2026년 9월</option>
              <option value="2026-10">2026년 10월</option>
            </select>
            <button
              onClick={handleDeleteSpecificMonth}
              disabled={isLoading}
              className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 text-xs font-semibold transition flex items-center gap-1"
            >
              <Trash2 size={13} />
              월 삭제
            </button>
          </div>

          <button
            onClick={handleClearDatabase}
            disabled={isLoading}
            className="flex items-center gap-1 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 px-3 py-2 rounded-xl text-xs font-semibold transition"
          >
            <Trash2 size={13} />
            전체 비우기
          </button>

          <input
            type="file"
            accept=".xlsx, .xls"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-xl text-xs font-semibold transition shadow-sm"
          >
            <Upload size={13} />
            {isLoading ? '처리 중...' : '엑셀 업로드'}
          </button>
        </div>
      </div>

      {/* 캘린더 영역 */}
      <div className="bg-white p-3 md:p-5 rounded-xl shadow-sm border border-slate-200">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          locale="ko"
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: ''
          }}
          events={events}
          eventClick={handleEventClick}
          height="auto"
          contentHeight="auto"
        />
      </div>

      {/* 상세정보 & 수정 & AI 사진 분석 통합 모달 */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="bg-white w-full md:max-w-2xl rounded-t-2xl md:rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto flex flex-col">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex justify-between items-start sticky top-0 bg-white z-10">
              <div className="flex-1 mr-2">
                <div className="flex items-center gap-2 mb-1.5">
                  <span 
                    style={{ backgroundColor: GROUP_COLORS[selectedEvent.group_name]?.bg || '#60A5FA' }}
                    className="px-3 py-0.5 text-white text-xs font-bold rounded-full"
                  >
                    {selectedEvent.group_name} 담당
                  </span>
                  {selectedEvent.is_date_modified && (
                    <span className="bg-rose-100 text-rose-700 text-xs font-bold px-2.5 py-0.5 rounded-md border border-rose-200">
                      일정 변경됨
                    </span>
                  )}
                </div>

                <h2 className="text-lg font-bold text-slate-800 leading-snug">
                  {isEditing ? (
                    <input 
                      type="text" 
                      value={editForm.project_name} 
                      onChange={(e) => setEditForm({ ...editForm, project_name: e.target.value })}
                      className="w-full border rounded-lg p-1.5 text-base font-bold bg-white"
                    />
                  ) : selectedEvent.project_name}
                </h2>
              </div>
              
              <div className="flex items-center gap-2">
                {aiActiveTab === 'detail' && (
                  !isEditing ? (
                    <button 
                      onClick={() => setIsEditing(true)}
                      className="flex items-center gap-1 text-xs bg-slate-100 text-slate-700 font-semibold px-2.5 py-1.5 rounded-lg hover:bg-slate-200 transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      수정하기
                    </button>
                  ) : (
                    <button 
                      onClick={handleSaveInfo}
                      className="flex items-center gap-1 text-xs bg-blue-600 text-white font-semibold px-2.5 py-1.5 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Save className="w-3.5 h-3.5" />
                      저장 완료
                    </button>
                  )
                )}
                <button 
                  onClick={() => setSelectedEvent(null)}
                  className="text-slate-400 text-xl font-bold p-1 hover:text-slate-600 leading-none"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* 탭 네비게이션 */}
            <div className="flex border-b border-slate-200 px-5 bg-slate-50 text-xs font-bold">
              <button
                type="button"
                onClick={() => setAiActiveTab('detail')}
                className={`py-3 px-4 border-b-2 transition flex items-center gap-1.5 ${
                  aiActiveTab === 'detail'
                    ? 'border-blue-600 text-blue-600 font-bold bg-white'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                📋 점검 상세 정보
              </button>
              <button
                type="button"
                onClick={() => setAiActiveTab('ai_check')}
                className={`py-3 px-4 border-b-2 transition flex items-center gap-1.5 ${
                  aiActiveTab === 'ai_check'
                    ? 'border-blue-600 text-blue-600 font-bold bg-white'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Search className="w-3.5 h-3.5 text-blue-600" />
                <span>🔍 현장 사진 AI 정밀 대조</span>
                <span className="bg-amber-400 text-slate-900 text-[10px] px-1.5 py-0.2 rounded font-extrabold">국토부 기준</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 flex-1">
              {aiActiveTab === 'detail' ? (
                /* 1. 기존 상세 정보 뷰 */
                <div className="space-y-4 text-sm text-slate-600">
                  {/* 1. 점검 예정일 */}
                  <div className="bg-amber-50/70 p-3 rounded-xl border border-amber-200/80">
                    <div className="flex items-center gap-2">
                      <CalendarIcon className="w-4 h-4 text-amber-700 shrink-0" />
                      <div className="flex-1 flex items-center justify-between">
                        <span className="font-semibold text-amber-900 text-xs">점검 예정일</span>
                        {isEditing ? (
                          <input 
                            type="date" 
                            value={editForm.check_date} 
                            onChange={(e) => setEditForm({ ...editForm, check_date: e.target.value })}
                            className="border border-amber-300 rounded-lg p-1.5 text-xs font-bold text-slate-800 bg-white focus:ring-2 focus:ring-blue-500"
                          />
                        ) : (
                          <span className="text-slate-900 font-bold text-sm bg-white px-2.5 py-1 rounded-md border border-amber-200">
                            {selectedEvent.check_date}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 2. 현장 위치 및 네비 연동 */}
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <div className="flex items-start gap-2 mb-2">
                      <MapPin className="w-4 h-4 text-rose-500 mt-0.5 shrink-0" />
                      <div className="flex-1">
                        <span className="font-semibold block text-slate-700 text-xs mb-1">현장 위치</span>
                        {isEditing ? (
                          <input 
                            type="text" 
                            value={editForm.site_address} 
                            onChange={(e) => setEditForm({ ...editForm, site_address: e.target.value })}
                            className="w-full border rounded-lg p-2 text-xs focus:ring-2 focus:ring-blue-500 bg-white"
                          />
                        ) : (
                          <span className="text-slate-800 font-medium leading-relaxed block">
                            {selectedEvent.site_address || '주소 정보 없음'}
                          </span>
                        )}
                      </div>
                    </div>

                    {!isEditing && selectedEvent.site_address && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-2 border-t border-slate-200">
                        <span className="text-[11px] font-semibold text-slate-400 mr-1 self-center">길안내:</span>
                        
                        {/* 카카오맵 */}
                        <a 
                          href={`https://map.kakao.com/link/search/${encodeURIComponent(selectedEvent.site_address)}`}
                          target="_blank" 
                          rel="noreferrer"
                          className="flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg hover:bg-amber-100 transition"
                        >
                          <Navigation size={11} />
                          카카오맵
                        </a>

                        {/* 네이버 지도 */}
                        <a 
                          href={`https://map.naver.com/v5/search/${encodeURIComponent(selectedEvent.site_address)}`}
                          target="_blank" 
                          rel="noreferrer"
                          className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg hover:bg-emerald-100 transition"
                        >
                          <Navigation size={11} />
                          네이버 지도
                        </a>

                        {/* 주소 복사 */}
                        <button 
                          onClick={() => handleCopyAddress(selectedEvent.site_address)}
                          className="flex items-center gap-1 bg-slate-200 text-slate-700 text-[11px] py-1 px-2 rounded-lg font-semibold hover:bg-slate-300 transition ml-auto"
                        >
                          {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                          {copied ? '복사됨' : '복사'}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* 3. 현장대리인 & 연락처 */}
                  <div className="flex items-start gap-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
                    <Phone className="w-4 h-4 text-slate-400 mt-1 shrink-0" />
                    <div className="flex-1">
                      <span className="font-semibold block text-slate-700 text-xs mb-1">현장대리인 / 연락처</span>
                      {isEditing ? (
                        <div className="space-y-2">
                          <input 
                            type="text" 
                            placeholder="이름"
                            value={editForm.manager_name} 
                            onChange={(e) => setEditForm({ ...editForm, manager_name: e.target.value })}
                            className="w-full border rounded-lg p-2 text-xs focus:ring-2 focus:ring-blue-500 bg-white"
                          />
                          <input 
                            type="text" 
                            placeholder="전화번호"
                            value={editForm.manager_phone} 
                            onChange={(e) => setEditForm({ ...editForm, manager_phone: e.target.value })}
                            className="w-full border rounded-lg p-2 text-xs focus:ring-2 focus:ring-blue-500 bg-white"
                          />
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-800">
                            {selectedEvent.manager_name || '미기재'} ({selectedEvent.builder || '시공사'})
                          </span>
                          {selectedEvent.manager_phone && (
                            <a 
                              href={`tel:${selectedEvent.manager_phone}`}
                              className="flex items-center gap-1 bg-emerald-600 text-white text-xs px-2.5 py-1.5 rounded-lg font-semibold shadow hover:bg-emerald-700 shrink-0 ml-2"
                            >
                              <PhoneCall className="w-3.5 h-3.5" />
                              전화걸기
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 4. 현장 메모 기능 */}
                  <div className="bg-blue-50/60 p-3 rounded-lg border border-blue-100">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <FileText className="w-3.5 h-3.5 text-blue-600" />
                      <span className="font-semibold text-blue-900 text-xs">공사진행상태 / 비고 메모</span>
                    </div>
                    {isEditing ? (
                      <textarea 
                        rows={3}
                        value={editForm.memo} 
                        onChange={(e) => setEditForm({ ...editForm, memo: e.target.value })}
                        className="w-full border rounded-lg p-2 text-xs focus:ring-2 focus:ring-blue-500 bg-white"
                      />
                    ) : (
                      <p className="text-xs text-slate-700 whitespace-pre-line leading-relaxed">
                        {selectedEvent.memo || selectedEvent.status_note || '등록된 내용이 없습니다.'}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                /* 2. AI 사진 정밀 분석 뷰 */
                <div className="space-y-4">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                    <div className="flex flex-col sm:flex-row gap-3 items-center">
                      <input
                        type="file"
                        accept="image/*"
                        ref={aiFileInputRef}
                        onChange={handleAiImageChange}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => aiFileInputRef.current?.click()}
                        className="w-full sm:w-auto flex items-center justify-center gap-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 px-4 py-2.5 rounded-lg text-xs font-bold transition shadow-sm"
                      >
                        <Camera className="w-4 h-4 text-blue-600" />
                        현장 점검 사진 촬영/선택
                      </button>

                      <button
                        type="button"
                        onClick={runAiAnalysis}
                        disabled={aiAnalyzing || !aiBase64Data}
                        className={`w-full sm:flex-1 py-2.5 px-4 rounded-lg text-xs font-bold text-white shadow transition flex items-center justify-center gap-1.5 ${
                          aiAnalyzing || !aiBase64Data
                            ? 'bg-slate-400 cursor-not-allowed'
                            : 'bg-blue-600 hover:bg-blue-700'
                        }`}
                      >
                        <Sparkles className={`w-4 h-4 ${aiAnalyzing ? 'animate-spin' : ''}`} />
                        {aiAnalyzing ? '국토부 기준 조항 대조 중...' : '국토부 기준 원문 대조 분석 실행'}
                      </button>
                    </div>

                    {/* 사진 미리보기 박스 */}
                    <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-lg p-2 bg-white min-h-[120px]">
                      {aiPreviewUrl ? (
                        <img src={aiPreviewUrl} alt="현장 점검 사진" className="max-h-48 object-contain rounded" />
                      ) : (
                        <p className="text-xs text-slate-400 text-center py-4">
                          스마트폰 카메라로 찍은 현장 사진을 선택하면 미리보기가 표시됩니다.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* 분석 결과 출력 박스 */}
                  <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-sm min-h-[220px]">
                    <div className="border-b border-slate-100 pb-2 mb-3 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-blue-600" />
                        국토교통부 공식 기준 대조 결과
                      </span>
                      {aiAnalyzing && (
                        <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded animate-pulse">
                          KCS·KDS·건진법 조항 검색 중...
                        </span>
                      )}
                    </div>

                    {aiResult ? (
                      <div 
                        className="text-xs text-slate-800 leading-relaxed space-y-2 [&>h1]:text-sm [&>h1]:font-bold [&>h1]:text-blue-900 [&>h2]:text-xs [&>h2]:font-bold [&>h2]:text-blue-800 [&>ul]:list-disc [&>ul]:pl-4 [&>ol]:list-decimal [&>ol]:pl-4 [&>blockquote]:border-l-4 [&>blockquote]:border-blue-500 [&>blockquote]:pl-2 [&>blockquote]:bg-slate-50 [&>blockquote]:py-1 [&>strong]:text-blue-900"
                        dangerouslySetInnerHTML={{ __html: marked.parse(aiResult) }}
                      />
                    ) : (
                      <p className="text-xs text-slate-400 text-center py-10 leading-relaxed">
                        현장 사진을 올린 후 [원문 대조 분석 실행]을 누르면<br />
                        표준시방서(KCS), 설계기준(KDS), 건설기술 진흥법령 원문과 시정 지시사항이 출력됩니다.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              {isEditing ? (
                <button 
                  onClick={handleSaveInfo}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 shadow text-xs"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  수정사항 저장하기
                </button>
              ) : (
                <button 
                  onClick={() => setSelectedEvent(null)}
                  className="w-full sm:w-auto px-6 py-2 bg-slate-800 hover:bg-slate-900 text-white font-semibold rounded-xl text-xs transition"
                >
                  닫기
                </button>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
