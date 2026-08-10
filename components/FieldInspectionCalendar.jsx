import React, { useState, useEffect, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import { Phone, MapPin, Filter, PhoneCall, Edit3, Save, FileText, CheckCircle2, Navigation, Copy, Check, Calendar as CalendarIcon, FilePenLine } from 'lucide-react';

const GROUP_COLORS = {
  '1조': { bg: '#3B82F6', text: '#ffffff' },
  '2조': { bg: '#10B981', text: '#ffffff' },
  '3조': { bg: '#F59E0B', text: '#ffffff' },
  'TF1조': { bg: '#8B5CF6', text: '#ffffff' },
  'TF2조': { bg: '#EC4899', text: '#ffffff' }
};

export default function FieldInspectionCalendar({ initialData = [] }) {
  const [selectedGroup, setSelectedGroup] = useState('ALL');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [events, setEvents] = useState([]);
  const [masterData, setMasterData] = useState([]);
  const [copied, setCopied] = useState(false);
  
  // 편집 모드 상태 및 입력폼 상태 (check_date 추가)
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    check_date: '',
    site_address: '',
    manager_name: '',
    manager_phone: '',
    status_note: '',
    memo: ''
  });

  // 💡 [추가] 현장 확인서 작성 모드 상태
  const [isWritingInspection, setIsWritingInspection] = useState(false);
  const [inspectionForm, setInspectionForm] = useState({
    violation_content: '',
    inspector_name: ''
  });

  const calendarRef = useRef(null);

  useEffect(() => {
    setMasterData(initialData);
  }, [initialData]);

  useEffect(() => {
    const filtered = selectedGroup === 'ALL' 
      ? masterData 
      : masterData.filter(item => item.group_name === selectedGroup);

    const formatted = filtered.map(item => {
      const colorInfo = GROUP_COLORS[item.group_name] || { bg: '#6B7280', text: '#ffffff' };
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
      check_date: data.check_date || '',
      site_address: data.site_address || '',
      manager_name: data.manager_name || '',
      manager_phone: data.manager_phone || '',
      status_note: data.status_note || '',
      memo: data.memo || ''
    });
    setIsEditing(false);
    setIsWritingInspection(false); // 모달 열 때 확인서 작성 폼은 닫힘 상태로 초기화
    setCopied(false);
  };

  // 정보 수정 및 일정 변경 저장 처리
  const handleSaveInfo = () => {
    if (!selectedEvent) return;

    const isDateModified = selectedEvent.check_date !== editForm.check_date;

    const updatedMaster = masterData.map(item => {
      if (item.idx === selectedEvent.idx) {
        return {
          ...item,
          check_date: editForm.check_date,
          site_address: editForm.site_address,
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

    // 변경된 일자의 달력 화면으로 자동 이동
    if (isDateModified && calendarRef.current && editForm.check_date) {
      const calendarApi = calendarRef.current.getApi();
      calendarApi.gotoDate(editForm.check_date);
    }
  };

  // 💡 [추가] 현장 확인서 제출 핸들러 (Supabase 연동 또는 상태 저장)
  const handleSaveInspection = (e) => {
    e.preventDefault();
    if (!inspectionForm.inspector_name || !inspectionForm.violation_content) {
      alert('점검자 성명과 지적 사항을 모두 입력해주세요.');
      return;
    }

    // 여기에 Supabase 연동 코드 (insert 등)를 추가하거나 부모 컴포넌트로 전달 가능
    alert(`[${selectedEvent.project_name}] 현장 확인서가 성공적으로 저장되었습니다!`);
    setIsWritingInspection(false);
    setInspectionForm({ violation_content: '', inspector_name: '' });
  };

  const handleCopyAddress = (address) => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenMap = (address) => {
    if (!address) return alert('주소 정보가 없습니다.');
    const encoded = encodeURIComponent(address);
    window.open(`https://map.naver.com/v5/search/${encoded}`, '_blank');
  };

  const handleOpenKakaoNavi = (address, name) => {
    if (!address) return alert('주소 정보가 없습니다.');
    const query = encodeURIComponent(`${name} ${address}`);
    window.open(`https://map.kakao.com/link/search/${query}`, '_blank');
  };

  return (
    <div className="min-h-screen bg-slate-50 p-2 md:p-6">
      {/* 조별 필터 상단바 */}
      <div className="bg-white p-4 rounded-xl shadow-sm mb-4 border border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-slate-500" />
          <span className="font-semibold text-slate-700 text-sm">조별 필터:</span>
          <select 
            value={selectedGroup}
            onChange={(e) => setSelectedGroup(e.target.value)}
            className="bg-slate-100 border border-slate-300 text-slate-800 text-sm rounded-lg p-2 font-medium focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">전체 보기</option>
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
              className="px-2.5 py-1 rounded-full text-white font-semibold"
            >
              {group}
            </span>
          ))}
        </div>
      </div>

      {/* 캘린더 영역 */}
      <div className="bg-white p-3 md:p-5 rounded-xl shadow-sm border border-slate-200">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          initialDate="2026-05-01"
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

      {/* 상세정보 & 수정 & 네비 & 확인서 작성 모달 */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
          <div className="bg-white w-full md:max-w-lg rounded-t-2xl md:rounded-2xl p-6 shadow-xl animate-slide-up max-h-[85vh] overflow-y-auto">
            
            {/* Header */}
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center gap-2">
                <span 
                  style={{ backgroundColor: GROUP_COLORS[selectedEvent.group_name]?.bg || '#6B7280' }}
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
                    onClick={() => { setIsEditing(true); setIsWritingInspection(false); }}
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
              {selectedEvent.project_name}
            </h2>

            {/* 💡 [추가] 모달 내 상단 전환 탭: 상세정보 vs 현장 확인서 작성 */}
            <div className="flex gap-2 mb-4 border-b pb-3">
              <button
                onClick={() => setIsWritingInspection(false)}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${!isWritingInspection ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                📋 일정 상세 및 메모
              </button>
              <button
                onClick={() => { setIsWritingInspection(true); setIsEditing(false); }}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 ${isWritingInspection ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700 hover:bg-blue-100'}`}
              >
                <FilePenLine className="w-4 h-4" />
                현장 확인서 작성
              </button>
            </div>

            {/* 💡 [추가] 현장 확인서 작성 폼 영역 */}
            {isWritingInspection ? (
              <form onSubmit={handleSaveInspection} className="space-y-4 bg-blue-50/40 p-4 rounded-xl border border-blue-100">
                <div className="bg-white p-3 rounded-lg border border-blue-200 text-xs space-y-1">
                  <p className="font-semibold text-slate-700">현장명: <span className="text-blue-600">{selectedEvent.project_name}</span></p>
                  <p className="font-semibold text-slate-700">점검예정일: <span className="text-slate-900">{selectedEvent.check_date}</span></p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">점검자 성명</label>
                  <input 
                    type="text"
                    placeholder="예: 김철수 주무관"
                    value={inspectionForm.inspector_name}
                    onChange={(e) => setInspectionForm({ ...inspectionForm, inspector_name: e.target.value })}
                    className="w-full border rounded-lg p-2 text-xs bg-white focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">현장 지적 사항 (적발 내용)</label>
                  <textarea 
                    rows={4}
                    placeholder="현장에서 확인된 지적사항 및 조치 필요 내용을 상세히 기록하세요."
                    value={inspectionForm.violation_content}
                    onChange={(e) => setInspectionForm({ ...inspectionForm, violation_content: e.target.value })}
                    className="w-full border rounded-lg p-2 text-xs bg-white focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <button 
                  type="submit"
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 shadow text-xs"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  확인서 저장 및 결과 연동하기
                </button>
              </form>
            ) : (
              /* 기존 상세정보 및 수정 영역 */
              <div className="space-y-4 text-sm text-slate-600 mt-2">
                
                {/* 1. 점검 예정일 (날짜 변경 기능 추가) */}
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
                    <MapPin className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
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
                    <div className="flex flex-wrap gap-2 mt-3 pt-2 border-t border-slate-200">
                      <button
                        onClick={() => handleOpenMap(selectedEvent.site_address)}
                        className="flex-1 flex items-center justify-center gap-1 bg-blue-600 text-white text-xs py-2 px-3 rounded-lg font-semibold shadow hover:bg-blue-700 transition-colors"
                      >
                        <Navigation className="w-3.5 h-3.5" />
                        네이버 지도
                      </button>
                      <button
                        onClick={() => handleOpenKakaoNavi(selectedEvent.site_address, selectedEvent.project_name)}
                        className="flex-1 flex items-center justify-center gap-1 bg-amber-400 text-slate-900 text-xs py-2 px-3 rounded-lg font-semibold shadow hover:bg-amber-500 transition-colors"
                      >
                        <Navigation className="w-3.5 h-3.5" />
                        카카오 길안내
                      </button>
                      <button
                        onClick={() => handleCopyAddress(selectedEvent.site_address)}
                        className="flex items-center justify-center gap-1 bg-slate-200 text-slate-700 text-xs py-2 px-3 rounded-lg font-semibold hover:bg-slate-300 transition-colors"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied ? '복사됨' : '주소복사'}
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
                          placeholder="이름 (시공사명)"
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

                {/* 4. 공사 진행 상태 */}
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <span className="font-semibold block text-slate-700 text-xs mb-1">공사 진행 상태</span>
                  {isEditing ? (
                    <textarea 
                      rows={2}
                      value={editForm.status_note}
                      onChange={(e) => setEditForm({ ...editForm, status_note: e.target.value })}
                      className="w-full border rounded-lg p-2 text-xs focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  ) : (
                    <p className="text-xs text-slate-600 whitespace-pre-line">
                      {selectedEvent.status_note || '특이사항 없음'}
                    </p>
                  )}
                </div>

                {/* 5. 현장 메모 기능 */}
                <div className="bg-blue-50/60 p-3 rounded-lg border border-blue-100">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <FileText className="w-3.5 h-3.5 text-blue-600" />
                    <span className="font-semibold text-blue-900 text-xs">현장 점검 메모 (사내 공유)</span>
                  </div>
                  {isEditing ? (
                    <textarea 
                      rows={3}
                      placeholder="현장 특이사항, 개략적인 인스펙션 내용, 준비사항 등을 기록하세요."
                      value={editForm.memo}
                      onChange={(e) => setEditForm({ ...editForm, memo: e.target.value })}
                      className="w-full border rounded-lg p-2 text-xs focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  ) : (
                    <p className="text-xs text-slate-700 whitespace-pre-line leading-relaxed">
                      {selectedEvent.memo ? selectedEvent.memo : '등록된 메모가 없습니다. [수정하기]를 눌러 현장 특이사항을 작성해 보세요.'}
                    </p>
                  )}
                </div>

              </div>
            )}

            {/* Bottom Button */}
            {isEditing ? (
              <button 
                onClick={handleSaveInfo}
                className="w-full mt-5 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 shadow text-xs"
              >
                <CheckCircle2 className="w-4 h-4" />
                수정사항 저장하기
              </button>
            ) : (
              !isWritingInspection && (
                <button 
                  onClick={() => setSelectedEvent(null)}
                  className="w-full mt-5 py-3 bg-slate-800 text-white font-semibold rounded-xl text-xs"
                >
                  닫기
                </button>
              )
            )}

          </div>
        </div>
      )}
    </div>
  );
}
