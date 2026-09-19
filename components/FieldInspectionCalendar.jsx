"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import { createClient } from "@supabase/supabase-js";
import { marked } from "marked";
import { parseInspectionExcel } from "../lib/excelParser";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://hylizcltiyqtnclmwspo.supabase.co";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_dD_I8Rbfc5qcOgbBRbL5qw_4yRK_EYs";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const GROUP_THEMES = {
  "1조": { bg: "#3B82F6", badge: "bg-blue-50 text-blue-700 border-blue-200", dot: "bg-blue-500" },
  "2조": { bg: "#10B981", badge: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  "3조": { bg: "#F59E0B", badge: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500" },
  "TF1조": { bg: "#8B5CF6", badge: "bg-purple-50 text-purple-700 border-purple-200", dot: "bg-purple-500" },
  "TF2조": { bg: "#EC4899", badge: "bg-pink-50 text-pink-700 border-pink-200", dot: "bg-pink-500" }
};

export default function FieldInspectionCalendar() {
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [activeTab, setActiveTab] = useState("ai_check");
  const [uploadingExcel, setUploadingExcel] = useState(false);
  const fileInputRef = useRef(null);

  // 수정 모드 상태
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState({});

  // AI 사진 정밀 대조 상태
  const [previewUrl, setPreviewUrl] = useState(null);
  const [base64Data, setBase64Data] = useState(null);
  const [mimeType, setMimeType] = useState("image/jpeg");
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState("");
  const [detectedBoxes, setDetectedBoxes] = useState([]);

  // Supabase 일정 로드
  const fetchEvents = async () => {
    try {
      const { data, error } = await supabase.from("events").select("*");
      if (error) throw error;
      if (data) {
        const formatted = data.map((item) => {
          const teamKey = item.team || item.group_name || "1조";
          const theme = GROUP_THEMES[teamKey] || GROUP_THEMES["1조"];
          return {
            id: String(item.id),
            title: item.title || `[${teamKey}] ${item.location || item.project_name || "현장점검"}`,
            start: item.start_date || item.check_date,
            backgroundColor: item.bg_color || theme.bg,
            borderColor: "transparent",
            textColor: "#ffffff",
            extendedProps: item
          };
        });
        setEvents(formatted);
      }
    } catch (err) {
      console.error("데이터 로드 에러:", err);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  // 통계 지표 계산 (KPI)
  const stats = useMemo(() => {
    const total = events.length;
    const teamCounts = { "1조": 0, "2조": 0, "3조": 0, "TF1조": 0, "TF2조": 0 };
    events.forEach((ev) => {
      const t = ev.extendedProps?.team || ev.extendedProps?.group_name || "1조";
      if (teamCounts[t] !== undefined) teamCounts[t]++;
    });
    return { total, teamCounts };
  }, [events]);

  // 엑셀 일괄 등록
  const handleExcelUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingExcel(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const parsedSchedules = parseInspectionExcel(arrayBuffer);

      if (!parsedSchedules || parsedSchedules.length === 0) {
        alert("엑셀 파일에서 유효한 점검 일정을 찾을 수 없습니다.");
        return;
      }

      const rowsToInsert = parsedSchedules.map((s) => ({
        title: `[${s.group_name || "1조"}] ${s.project_name || "현장점검"}`,
        location: s.project_name,
        address: s.site_address,
        start_date: s.check_date,
        team: s.group_name || "1조",
        members: s.builder,
        supervisor: s.supervisor,
        agent_name: s.manager_name,
        agent_phone: s.manager_phone,
        notes: s.status_note,
        bg_color: GROUP_THEMES[s.group_name]?.bg || "#3B82F6"
      }));

      const { error } = await supabase.from("events").insert(rowsToInsert);
      if (error) throw error;

      alert(`총 ${rowsToInsert.length}건의 현장점검 일정이 데이터베이스에 등록되었습니다.`);
      fetchEvents();
    } catch (err) {
      console.error("엑셀 등록 실패:", err);
      alert(`등록 실패: ${err.message}`);
    } finally {
      setUploadingExcel(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // 일정 선택 모달 열기
  const handleEventClick = (info) => {
    const data = info.event.extendedProps;
    setSelectedEvent(data);
    setEditFormData({
      location: data.location || data.project_name || "",
      start_date: data.start_date || data.check_date || "",
      address: data.address || data.site_address || "",
      team: data.team || data.group_name || "1조",
      members: data.members || data.builder || "",
      supervisor: data.supervisor || "",
      agent_name: data.agent_name || data.manager_name || "",
      agent_phone: data.agent_phone || data.manager_phone || "",
      notes: data.notes || data.status_note || ""
    });
    setIsEditing(false);
    setActiveTab("ai_check");
    setPreviewUrl(null);
    setBase64Data(null);
    setDetectedBoxes([]);
    setAiResult("");
  };

  // 모바일/PC 사진 자동 압축 (최대 1280px)
  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const img = new Image();
      img.onload = () => {
        const MAX_SIZE = 1280;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height = Math.round((height * MAX_SIZE) / width);
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width = Math.round((width * MAX_SIZE) / height);
            height = MAX_SIZE;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, width, height);

        const compressed = canvas.toDataURL("image/jpeg", 0.85);
        setPreviewUrl(compressed);
        setBase64Data(compressed.split(",")[1]);
        setMimeType("image/jpeg");
        setDetectedBoxes([]);
        setAiResult("");
      };
      img.src = evt.target?.result;
    };
    reader.readAsDataURL(file);
  };

  // AI 분석 실행 (Gemini 3.6 Flash + KCSC 딥링크)
  const runAiAnalysis = async () => {
    if (!base64Data) {
      alert("분석할 현장 점검 사진을 먼저 등록해 주세요.");
      return;
    }

    setAiAnalyzing(true);
    setAiResult("");
    setDetectedBoxes([]);

    try {
      const res = await fetch(`/api/analyze?t=${Date.now()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64Data, mimeType })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "분석 서버 응답 에러");

      if (data.defects && Array.isArray(data.defects)) {
        setDetectedBoxes(data.defects);
      }
      setAiResult(data.report || "결과를 불러올 수 없습니다.");
    } catch (err) {
      console.error(err);
      alert(`AI 분석 오류: ${err.message}`);
    } finally {
      setAiAnalyzing(false);
    }
  };

  // 일정 수정 업데이트
  const handleUpdateEvent = async (e) => {
    e.preventDefault();
    if (!selectedEvent?.id) return;

    try {
      const { error } = await supabase
        .from("events")
        .update({
          title: `[${editFormData.team}] ${editFormData.location}`,
          location: editFormData.location,
          start_date: editFormData.start_date,
          address: editFormData.address,
          team: editFormData.team,
          members: editFormData.members,
          supervisor: editFormData.supervisor,
          agent_name: editFormData.agent_name,
          agent_phone: editFormData.agent_phone,
          notes: editFormData.notes,
          bg_color: GROUP_THEMES[editFormData.team]?.bg || "#3B82F6"
        })
        .eq("id", selectedEvent.id);

      if (error) throw error;

      alert("일정이 성공적으로 수정되었습니다.");
      setIsEditing(false);
      setSelectedEvent({
        ...selectedEvent,
        ...editFormData,
        title: `[${editFormData.team}] ${editFormData.location}`
      });
      fetchEvents();
    } catch (err) {
      alert("수정 실패: " + err.message);
    }
  };

  // 일정 삭제
  const handleDelete = async (id) => {
    if (!confirm("해당 점검 일정을 완전히 삭제하시겠습니까?")) return;
    try {
      await supabase.from("events").delete().eq("id", id);
      setSelectedEvent(null);
      fetchEvents();
      alert("삭제되었습니다.");
    } catch (err) {
      alert("삭제 실패: " + err.message);
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. 상단 국토교통부 관제 헤더 & KPI 통계 배너 */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white rounded-2xl shadow-xl p-5 border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-xl shadow-inner">
              🏛️
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded border border-blue-400/30">
                  MOLIT Field Inspection OS
                </span>
                <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  시스템 정상 가동
                </span>
              </div>
              <h1 className="text-lg md:text-xl font-extrabold tracking-tight mt-0.5 text-slate-100">
                건설공사 현장점검 종합관제 및 AI 정밀대조 시스템
              </h1>
            </div>
          </div>

          {/* 엑셀 일괄 등록 트리거 */}
          <div className="flex items-center gap-2 self-start md:self-auto">
            <input
              type="file"
              ref={fileInputRef}
              accept=".xlsx, .xls"
              onChange={handleExcelUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingExcel}
              className="bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-900/30 transition flex items-center gap-2 border border-emerald-400/30"
            >
              <span className="text-sm">📥</span>
              <span>{uploadingExcel ? "엑셀 파싱 및 동기화 중..." : "점검계획 엑셀(.xlsx) 등록"}</span>
            </button>
          </div>
        </div>

        {/* 조별 통계 칩 바 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5 mt-4 pt-4 border-t border-slate-800/80 text-xs">
          <div className="bg-slate-800/50 rounded-xl p-2.5 border border-slate-700/50 flex flex-col">
            <span className="text-[11px] text-slate-400 font-medium">전체 점검계획</span>
            <span className="text-base font-black text-white mt-0.5">{stats.total} <span className="text-[10px] font-normal text-slate-400">개소</span></span>
          </div>
          {Object.entries(GROUP_THEMES).map(([team, theme]) => (
            <div key={team} className="bg-slate-800/50 rounded-xl p-2.5 border border-slate-700/50 flex flex-col">
              <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${theme.dot}`}></span>
                {team}
              </span>
              <span className="text-base font-black text-white mt-0.5">
                {stats.teamCounts[team] || 0} <span className="text-[10px] font-normal text-slate-400">개소</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* 2. 캘린더 메인 컨테이너 */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200/90 p-4 sm:p-6">
        <FullCalendar
          plugins={[dayGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          locale="ko"
          events={events}
          eventClick={handleEventClick}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: ""
          }}
          height="auto"
        />
      </div>

      {/* 3. 국토교통부 표준 [현장점검 & AI 정밀 대조] 듀얼패널 모달 */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[92vh] border border-slate-300 flex flex-col overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
            
            {/* 상단 모달 헤더 */}
            <div className="px-5 py-3.5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xs font-black bg-amber-400 text-slate-950 px-2.5 py-1 rounded-md shadow-sm">
                  {selectedEvent.team || selectedEvent.group_name || "1조"}
                </span>
                <div>
                  <h3 className="font-extrabold text-sm sm:text-base text-slate-100 flex items-center gap-2">
                    {selectedEvent.location || selectedEvent.project_name || selectedEvent.title}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    점검일자: {selectedEvent.start_date || selectedEvent.check_date || "-"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedEvent(null);
                  setIsEditing(false);
                }}
                className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 w-8 h-8 rounded-lg flex items-center justify-center transition font-bold text-lg"
              >
                ✕
              </button>
            </div>

            {/* 탭 네비게이션 */}
            <div className="flex border-b border-slate-200 bg-slate-50 text-xs font-bold px-5">
              <button
                onClick={() => setActiveTab("ai_check")}
                className={`py-3 px-4 border-b-2 flex items-center gap-2 transition ${
                  activeTab === "ai_check"
                    ? "border-blue-600 text-blue-600 bg-white font-extrabold"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <span>🔍 현장 사진 AI 정밀 대조</span>
                <span className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-[10px] px-1.5 py-0.5 rounded font-black shadow-xs">
                  KCSC 직인용
                </span>
              </button>
              <button
                onClick={() => setActiveTab("detail")}
                className={`py-3 px-4 border-b-2 transition ${
                  activeTab === "detail"
                    ? "border-blue-600 text-blue-600 bg-white font-extrabold"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                📋 일정 상세 관리
              </button>
            </div>

            {/* 메인 컨텐츠 바디 */}
            <div className="p-5 flex-1 overflow-y-auto bg-slate-50/50">
              {activeTab === "ai_check" ? (
                /* AI 정밀 대조 듀얼 스플릿 뷰 */
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                  
                  {/* 좌측: 현장 사진 업로드 및 붉은색 결함 박스 뷰어 (5컬럼) */}
                  <div className="lg:col-span-5 flex flex-col space-y-3">
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                          📸 현장 검측 사진 등록
                        </span>
                        <span className="text-[11px] text-slate-400">자동 압축 최적화</span>
                      </div>

                      <label className="border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-3 flex flex-col items-center justify-center bg-slate-50 hover:bg-blue-50/40 cursor-pointer transition text-center min-h-[190px] relative overflow-hidden group">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageChange}
                          className="hidden"
                        />
                        {previewUrl ? (
                          <div className="relative inline-block max-w-full">
                            <img
                              src={previewUrl}
                              alt="검측대상사진"
                              className="max-h-72 object-contain rounded-lg block shadow"
                            />
                            {/* Gemini 정규화 좌표 오버레이 */}
                            {detectedBoxes.map((defect, idx) => {
                              if (!defect.box_2d || defect.box_2d.length !== 4) return null;
                              const [ymin, xmin, ymax, xmax] = defect.box_2d;
                              const top = `${ymin / 10}%`;
                              const left = `${xmin / 10}%`;
                              const width = `${(xmax - xmin) / 10}%`;
                              const height = `${(ymax - ymin) / 10}%`;

                              return (
                                <div
                                  key={idx}
                                  style={{ top, left, width, height }}
                                  className="absolute border-2 border-rose-500 bg-rose-500/20 pointer-events-none rounded shadow-sm animate-in fade-in duration-300"
                                >
                                  {defect.label && (
                                    <span className="absolute -top-6 left-0 bg-rose-600 text-white text-[10px] font-black px-1.5 py-0.5 rounded shadow whitespace-nowrap flex items-center gap-1">
                                      ⚠️ {defect.label}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="space-y-1.5 text-slate-400 py-6">
                            <div className="text-3xl">📷</div>
                            <div className="text-xs font-bold text-slate-700">현장 사진 촬영 또는 파일 선택</div>
                            <div className="text-[11px]">카메라 또는 갤러리에서 사진을 추가하세요</div>
                          </div>
                        )}
                      </label>

                      <button
                        type="button"
                        onClick={runAiAnalysis}
                        disabled={aiAnalyzing || !base64Data}
                        className={`w-full py-3 px-4 rounded-xl text-xs font-extrabold text-white shadow-md transition flex items-center justify-center gap-2 ${
                          aiAnalyzing || !base64Data
                            ? "bg-slate-300 text-slate-500 cursor-not-allowed"
                            : "bg-blue-600 hover:bg-blue-700 active:scale-98 shadow-blue-500/20"
                        }`}
                      >
                        {aiAnalyzing ? (
                          <>
                            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
                            <span>KCSC 표준기준 대조 및 검측서 작성 중...</span>
                          </>
                        ) : (
                          <>
                            <span>⚡ KCSC 국토부 기준 실시간 정밀대조 실행</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* 우측: 국토교통부 표준 시정확인서 렌더링 패널 (7컬럼) */}
                  <div className="lg:col-span-7">
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5 min-h-[360px] flex flex-col">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-3">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                          <h4 className="text-xs font-black text-slate-900 tracking-tight">
                            건설공사 현장점검 공식 확인서 (MOLIT Standard Report)
                          </h4>
                        </div>
                        {aiAnalyzing && (
                          <span className="text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded animate-pulse">
                            Vision AI 40년 감리엔진 판독 중...
                          </span>
                        )}
                      </div>

                      {aiResult ? (
                        <div
                          className="text-xs text-slate-800 leading-relaxed space-y-3 flex-1 
                            [&>h2]:text-sm [&>h2]:font-black [&>h2]:text-slate-900 [&>h2]:border-b-2 [&>h2]:border-slate-800 [&>h2]:pb-1.5 [&>h2]:mb-3
                            [&>table]:w-full [&>table]:border-collapse [&>table]:rounded-lg [&>table]:overflow-hidden [&>table]:border [&>table]:border-slate-200 [&>table]:my-2 [&>table]:shadow-xs
                            [&_th]:bg-slate-100/90 [&_th]:text-slate-700 [&_th]:font-bold [&_th]:p-2.5 [&_th]:border [&_th]:border-slate-200 [&_th]:text-center [&_th]:w-1/4
                            [&_td]:p-3 [&_td]:border [&_td]:border-slate-200 [&_td]:align-top [&_td]:bg-white
                            [&>blockquote]:border-l-4 [&>blockquote]:border-blue-600 [&>blockquote]:pl-3 [&>blockquote]:bg-blue-50/50 [&>blockquote]:py-2 [&>blockquote]:rounded-r-md [&>blockquote]:text-slate-700
                            [&>ul]:list-disc [&>ul]:pl-5 [&>ol]:list-decimal [&>ol]:pl-5 [&>strong]:text-slate-900
                            [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1 [&_a]:text-blue-700 [&_a]:bg-blue-50 [&_a]:border [&_a]:border-blue-200 [&_a]:px-2 [&_a]:py-0.5 [&_a]:rounded-md [&_a]:font-bold [&_a]:no-underline hover:[&_a]:bg-blue-100 hover:[&_a]:text-blue-900 transition"
                          dangerouslySetInnerHTML={{ __html: marked.parse(aiResult) }}
                        />
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-400 space-y-2 border-2 border-dashed border-slate-100 rounded-xl">
                          <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-xl text-slate-400 mb-1">
                            📄
                          </div>
                          <div className="text-xs font-bold text-slate-700">공식 점검 확인서 대기 중</div>
                          <p className="text-[11px] text-slate-400 leading-normal max-w-sm">
                            좌측에서 현장 점검 사진을 업로드한 후 분석을 실행하면, 40년 감리기술인 엔진이 결함 박스와 KCSC 공식 시방 기준을 표 양식으로 즉시 도출합니다.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              ) : (
                /* 일정 상세 조회 및 수정 폼 패널 */
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 max-w-2xl mx-auto">
                  {isEditing ? (
                    <form onSubmit={handleUpdateEvent} className="space-y-4 text-xs">
                      <div className="border-b border-slate-100 pb-2">
                        <span className="text-xs font-black text-slate-900">✏️ 점검 일정 정보 수정</span>
                      </div>

                      <div>
                        <label className="block text-slate-700 font-bold mb-1">일정명 / 공사명</label>
                        <input
                          type="text"
                          value={editFormData.location}
                          onChange={(e) => setEditFormData({ ...editFormData, location: e.target.value })}
                          className="w-full p-2.5 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:bg-white focus:outline-blue-500 font-medium"
                          required
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-slate-700 font-bold mb-1">점검 일자</label>
                          <input
                            type="date"
                            value={editFormData.start_date}
                            onChange={(e) => setEditFormData({ ...editFormData, start_date: e.target.value })}
                            className="w-full p-2.5 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:bg-white focus:outline-blue-500 font-medium"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-slate-700 font-bold mb-1">배정 점검조</label>
                          <select
                            value={editFormData.team}
                            onChange={(e) => setEditFormData({ ...editFormData, team: e.target.value })}
                            className="w-full p-2.5 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:bg-white focus:outline-blue-500 font-bold"
                          >
                            <option value="1조">1조</option>
                            <option value="2조">2조</option>
                            <option value="3조">3조</option>
                            <option value="TF1조">TF1조</option>
                            <option value="TF2조">TF2조</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label className="block text-slate-700 font-bold mb-1">현장 주소</label>
                        <input
                          type="text"
                          value={editFormData.address}
                          onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                          className="w-full p-2.5 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:bg-white focus:outline-blue-500"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-slate-700 font-bold mb-1">시공사</label>
                          <input
                            type="text"
                            value={editFormData.members}
                            onChange={(e) => setEditFormData({ ...editFormData, members: e.target.value })}
                            className="w-full p-2.5 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-700 font-bold mb-1">감리단 / 발주기관</label>
                          <input
                            type="text"
                            value={editFormData.supervisor}
                            onChange={(e) => setEditFormData({ ...editFormData, supervisor: e.target.value })}
                            className="w-full p-2.5 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:bg-white"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-slate-700 font-bold mb-1">현장 대리인 / 담당자</label>
                          <input
                            type="text"
                            value={editFormData.agent_name}
                            onChange={(e) => setEditFormData({ ...editFormData, agent_name: e.target.value })}
                            className="w-full p-2.5 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-700 font-bold mb-1">연락처</label>
                          <input
                            type="text"
                            value={editFormData.agent_phone}
                            onChange={(e) => setEditFormData({ ...editFormData, agent_phone: e.target.value })}
                            className="w-full p-2.5 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:bg-white"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-slate-700 font-bold mb-1">점검 메모 / 특이사항</label>
                        <textarea
                          rows={3}
                          value={editFormData.notes}
                          onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                          className="w-full p-2.5 border border-slate-300 rounded-lg text-xs bg-slate-50 focus:bg-white"
                        />
                      </div>

                      <div className="flex gap-2 pt-2">
                        <button
                          type="submit"
                          className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold shadow"
                        >
                          저장 및 반영
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsEditing(false)}
                          className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold"
                        >
                          취소
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="space-y-4 text-xs text-slate-700">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <span className="text-xs font-black text-slate-900">📑 현장점검 세부 정보</span>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setIsEditing(true)}
                            className="text-xs text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100 px-3 py-1.5 rounded-lg font-bold transition"
                          >
                            ✏️ 수정
                          </button>
                          <button
                            onClick={() => handleDelete(selectedEvent.id)}
                            className="text-xs text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 px-3 py-1.5 rounded-lg font-bold transition"
                          >
                            🗑️ 삭제
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200/80">
                        <div>
                          <div className="text-[11px] font-semibold text-slate-400">공사명 / 일정명</div>
                          <div className="text-sm font-black text-slate-800 mt-0.5">
                            {selectedEvent.location || selectedEvent.project_name || selectedEvent.title}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] font-semibold text-slate-400">점검 예정일자</div>
                          <div className="text-sm font-black text-emerald-600 mt-0.5">
                            {selectedEvent.start_date || selectedEvent.check_date || "-"}
                          </div>
                        </div>
                        <div className="sm:col-span-2">
                          <div className="text-[11px] font-semibold text-slate-400">현장 소재지</div>
                          <div className="text-xs font-bold text-slate-800 mt-0.5">
                            {selectedEvent.address || selectedEvent.site_address || "주소 정보 없음"}
                          </div>
                          {(selectedEvent.address || selectedEvent.site_address) && (
                            <div className="flex items-center gap-2 mt-2">
                              <a
                                href={`https://map.kakao.com/link/search/${encodeURIComponent(selectedEvent.address || selectedEvent.site_address)}`}
                                target="_blank"
                                rel="noreferrer"
                                className="bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-1 rounded text-[11px] font-bold hover:bg-amber-100"
                              >
                                카카오맵 길안내
                              </a>
                              <a
                                href={`https://map.naver.com/v5/search/${encodeURIComponent(selectedEvent.address || selectedEvent.site_address)}`}
                                target="_blank"
                                rel="noreferrer"
                                className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 rounded text-[11px] font-bold hover:bg-emerald-100"
                              >
                                네이버 지도
                              </a>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200/80">
                        <div>
                          <div className="text-[11px] font-semibold text-slate-400">시공사</div>
                          <div className="font-bold text-slate-800 mt-0.5">{selectedEvent.members || selectedEvent.builder || "미등록"}</div>
                        </div>
                        <div>
                          <div className="text-[11px] font-semibold text-slate-400">감리단 / 발주청</div>
                          <div className="font-bold text-slate-800 mt-0.5">{selectedEvent.supervisor || selectedEvent.client || "미등록"}</div>
                        </div>
                      </div>

                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80">
                        <div className="text-[11px] font-semibold text-slate-400">현장 담당자 및 비상연락망</div>
                        <div className="text-slate-800 font-bold mt-1 flex items-center gap-3">
                          <span>👤 {selectedEvent.agent_name || selectedEvent.manager_name || "담당자 미지정"}</span>
                          {(selectedEvent.agent_phone || selectedEvent.manager_phone) && (
                            <a
                              href={`tel:${selectedEvent.agent_phone || selectedEvent.manager_phone}`}
                              className="text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded font-bold hover:underline"
                            >
                              📞 {selectedEvent.agent_phone || selectedEvent.manager_phone}
                            </a>
                          )}
                        </div>
                      </div>

                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80">
                        <div className="text-[11px] font-semibold text-slate-400 mb-1">점검 메모 및 관리 이력</div>
                        <p className="text-slate-700 whitespace-pre-line leading-relaxed">
                          {selectedEvent.notes || selectedEvent.status_note || "등록된 메모가 없습니다."}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 하단 모달 푸터 */}
            <div className="px-5 py-3 border-t border-slate-200 bg-white flex items-center justify-between">
              <span className="text-[11px] text-slate-400 font-medium">
                국토교통부 건설안전품질지원 포털 2026
              </span>
              <button
                onClick={() => {
                  setSelectedEvent(null);
                  setIsEditing(false);
                }}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-sm"
              >
                창 닫기
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
