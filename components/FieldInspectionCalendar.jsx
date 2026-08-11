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
  Building
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

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

  const calendarRef = useRef(null);
  const fileInputRef = useRef(null);

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

      {/* 상세정보 & 수정 & 네비 연동 & 일정변경 모달 */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl p-6 shadow-xl max-h-[85vh] overflow-y-auto">
            
            {/* Header */}
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center gap-2">
                <span 
                  style={{ backgroundColor: GROUP_COLORS[selectedEvent.group_name]?.bg || '#60A5FA' }}
                  className="px-3 py-1 text-white text-xs font-bold rounded-full"
                >
                  {selectedEvent.group_name} 담당
                </span>
                {selectedEvent.is_date_modified && (
                  <span className="bg-rose-100 text-rose-700 text-xs font-bold px-2.5 py-0.5 rounded-md border border-rose-200">
                    일정 변경됨
                  </span>
                )}
              </div>
              
              <div className="flex items-center gap-2">
                {!isEditing ? (
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
                )}
                <button 
                  onClick={() => setSelectedEvent(null)}
                  className="text-slate-400 text-xl font-bold p-1 hover:text-slate-600"
                >
                  ✕
                </button>
              </div>
            </div>

            <h2 className="text-lg font-bold text-slate-800 mb-2">
              {isEditing ? (
                <input 
                  type="text" 
                  value={editForm.project_name} 
                  onChange={(e) => setEditForm({ ...editForm, project_name: e.target.value })}
                  className="w-full border rounded-lg p-1.5 text-base font-bold bg-white"
                />
              ) : selectedEvent.project_name}
            </h2>

            <div className="space-y-4 text-sm text-slate-600 mt-4 border-t pt-4">
              
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

              {/* 2. 현장 위치 및 네비 연동 (카카오맵 / 네이버 지도) */}
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

              {/* 3. 현장대리인 & 전화번호 */}
              <div className="flex items-start gap-2">
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
                        className="w-full border rounded-lg p-2 text-xs focus:ring-2 focus:ring-blue-500"
                      />
                      <input 
                        type="text" 
                        placeholder="전화번호"
                        value={editForm.manager_phone}
                        onChange={(e) => setEditForm({ ...editForm, manager_phone: e.target.value })}
                        className="w-full border rounded-lg p-2 text-xs focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-800">
                        {selectedEvent.manager_name} ({selectedEvent.builder || '시공사'})
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

            {/* Bottom Button */}
            {isEditing ? (
              <button 
                onClick={handleSaveInfo}
                className="w-full mt-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 shadow text-sm"
              >
                <CheckCircle2 className="w-4 h-4" />
                수정사항 저장하기
              </button>
            ) : (
              <button 
                onClick={() => setSelectedEvent(null)}
                className="w-full mt-5 py-3 bg-slate-800 text-white font-semibold rounded-xl text-sm"
              >
                닫기
              </button>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
