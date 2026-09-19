"use client";

import React, { useState, useEffect, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import { createClient } from "@supabase/supabase-js";
import { marked } from "marked";
import { parseInspectionExcel } from "../lib/excelParser";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://hylizcltiyqtnclmwspo.supabase.co";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_dD_I8Rbfc5qcOgbBRbL5qw_4yRK_EYs";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const GROUP_COLORS = {
  "1조": "#60A5FA",
  "2조": "#34D399",
  "3조": "#FBBF24",
  "TF1조": "#A78BFA",
  "TF2조": "#F472B6"
};

export default function FieldInspectionCalendar() {
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [activeTab, setActiveTab] = useState("detail");
  const [uploadingExcel, setUploadingExcel] = useState(false);
  const fileInputRef = useRef(null);

  // 일정 수정 관련 상태
  const [isEditing, setIsEditing] = useState(false);
  const [editFormData, setEditFormData] = useState({});

  // AI 분석 관련 상태
  const [previewUrl, setPreviewUrl] = useState(null);
  const [base64Data, setBase64Data] = useState(null);
  const [mimeType, setMimeType] = useState("image/jpeg");
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState("");
  const [detectedBoxes, setDetectedBoxes] = useState([]);

  // Supabase 일정 불러오기
  const fetchEvents = async () => {
    try {
      const { data, error } = await supabase.from("events").select("*");
      if (error) throw error;
      if (data) {
        const formatted = data.map((item) => ({
          id: String(item.id),
          title: item.title || `[${item.team || "1조"}] ${item.location || item.project_name || "현장점검"}`,
          start: item.start_date || item.check_date,
          backgroundColor: item.bg_color || GROUP_COLORS[item.team || item.group_name] || "#60A5FA",
          borderColor: "transparent",
          textColor: "#ffffff",
          extendedProps: item
        }));
        setEvents(formatted);
      }
    } catch (err) {
      console.error("데이터 로드 에러:", err);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  // 1. 엑셀 파일 업로드 및 Supabase 자동 일정 생성 기능 복원
  const handleExcelUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingExcel(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const parsedSchedules = parseInspectionExcel(arrayBuffer);

      if (!parsedSchedules || parsedSchedules.length === 0) {
        alert("업로드한 엑셀 파일에서 점검 일정을 찾을 수 없습니다. 양식을 확인해 주세요.");
        return;
      }

      // Supabase 테이블 컬럼 규격에 맞춰 매핑
      const rowsToInsert = parsedSchedules.map((s) => ({
        title: `[${s.group_name}] ${s.project_name}`,
        location: s.project_name,
        address: s.site_address,
        start_date: s.check_date,
        team: s.group_name,
        members: s.builder,
        supervisor: s.supervisor,
        agent_name: s.manager_name,
        agent_phone: s.manager_phone,
        notes: s.status_note,
        bg_color: GROUP_COLORS[s.group_name] || "#60A5FA"
      }));

      const { error } = await supabase.from("events").insert(rowsToInsert);
      if (error) throw error;

      alert(`총 ${rowsToInsert.length}건의 점검 일정이 캘린더에 성공적으로 등록되었습니다.`);
      fetchEvents();
    } catch (err) {
      console.error("엑셀 업로드 실패:", err);
      alert(`엑셀 등록 오류: ${err.message}`);
    } finally {
      setUploadingExcel(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // 일정 클릭 시 모달 오픈
  const handleEventClick = (info) => {
    const eventData = info.event.extendedProps;
    setSelectedEvent(eventData);
    setEditFormData({
      location: eventData.location || eventData.project_name || "",
      start_date: eventData.start_date || eventData.check_date || "",
      address: eventData.address || eventData.site_address || "",
      team: eventData.team || eventData.group_name || "1조",
      members: eventData.members || eventData.builder || "",
      supervisor: eventData.supervisor || "",
      agent_name: eventData.agent_name || eventData.manager_name || "",
      agent_phone: eventData.agent_phone || eventData.manager_phone || "",
      notes: eventData.notes || eventData.status_note || ""
    });
    setIsEditing(false);
    setActiveTab("detail");
    setPreviewUrl(null);
    setBase64Data(null);
    setDetectedBoxes([]);
    setAiResult("");
  };

  // 2. 일정 수정(저장) 기능 복원
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
          bg_color: GROUP_COLORS[editFormData.team] || "#60A5FA"
        })
        .eq("id", selectedEvent.id);

      if (error) throw error;

      alert("일정이 성공적으로 수정되었습니다.");
      setIsEditing(false);
      setSelectedEvent({ ...selectedEvent, ...editFormData, title: `[${editFormData.team}] ${editFormData.location}` });
      fetchEvents();
    } catch (err) {
      alert("수정 실패: " + err.message);
    }
  };

  // 3. 일정 삭제 기능
  const handleDelete = async (id) => {
    if (!confirm("이 일정을 삭제하시겠습니까?")) return;
    try {
      await supabase.from("events").delete().eq("id", id);
      setSelectedEvent(null);
      fetchEvents();
      alert("삭제되었습니다.");
    } catch (e) {
      alert("삭제 실패: " + e.message);
    }
  };

  // 모바일 사진 자동 압축 (최대 1280px 리사이즈)
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

        const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.85);
        setPreviewUrl(compressedDataUrl);
        setBase64Data(compressedDataUrl.split(",")[1]);
        setMimeType("image/jpeg");
        setDetectedBoxes([]);
        setAiResult("");
      };
      img.src = evt.target?.result;
    };
    reader.readAsDataURL(file);
  };

  // AI 분석 실행 (KCSC 연동)
  const runAiAnalysis = async () => {
    if (!base64Data) {
      alert("분석할 현장 점검 사진을 먼저 선택해 주세요.");
      return;
    }

    setAiAnalyzing(true);
    setAiResult("");
    setDetectedBoxes([]);

    try {
      const response = await fetch(`/api/analyze?t=${Date.now()}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache"
        },
        body: JSON.stringify({
          base64Data,
          mimeType
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "분석 요청에 실패했습니다.");
      }

      if (data.defects && Array.isArray(data.defects)) {
        setDetectedBoxes(data.defects);
      }

      setAiResult(data.report || "결과를 표시할 수 없습니다.");
    } catch (err) {
      console.error(err);
      alert(`분석 실패: ${err.message}`);
    } finally {
      setAiAnalyzing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto bg-white rounded-xl shadow p-4 border border-slate-200">
      {/* 상단 툴바: 엑셀 파일 일괄 등록 버튼 */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-slate-800">📅 현장점검 종합 일정</span>
          <span className="text-xs text-slate-400">| 조별 일정 관리 및 사진 AI 분석</span>
        </div>

        <div className="flex items-center gap-2">
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
            className={`px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow transition flex items-center gap-1.5 ${
              uploadingExcel ? "bg-slate-400 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            📊 {uploadingExcel ? "엑셀 일정 등록 중..." : "현장점검 엑셀(.xlsx) 등록"}
          </button>
        </div>
      </div>

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

      {/* 일정 상세 / 수정 & AI 대조 모달 */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-slate-200 flex flex-col">
            
            {/* Header */}
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
              <div className="flex items-center gap-2">
                <span className="bg-amber-400 text-slate-900 text-xs font-bold px-2.5 py-0.5 rounded-full">
                  {selectedEvent.team || selectedEvent.group_name || "1조"}
                </span>
                <h3 className="font-bold text-slate-800 text-base">
                  {isEditing ? "일정 정보 수정" : "일정 상세정보"}
                </h3>
              </div>
              <button
                onClick={() => {
                  setSelectedEvent(null);
                  setIsEditing(false);
                }}
                className="text-slate-400 hover:text-slate-600 text-xl font-bold leading-none p-1"
              >
                ✕
              </button>
            </div>

            {/* 2단 탭 메뉴 */}
            <div className="flex border-b border-slate-200 bg-slate-50 text-xs font-bold px-4">
              <button
                onClick={() => setActiveTab("detail")}
                className={`py-2.5 px-3 border-b-2 transition ${
                  activeTab === "detail"
                    ? "border-blue-600 text-blue-600 bg-white"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                📋 일정 상세정보
              </button>
              <button
                onClick={() => setActiveTab("ai_check")}
                className={`py-2.5 px-3 border-b-2 flex items-center gap-1.5 transition ${
                  activeTab === "ai_check"
                    ? "border-blue-600 text-blue-600 bg-white"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                <span>🔍 현장 사진 AI 정밀 대조</span>
                <span className="bg-amber-400 text-slate-900 text-[10px] px-1 py-0.2 rounded font-extrabold">KCSC 공식</span>
              </button>
            </div>

            {/* Body */}
            <div className="p-5 flex-1">
              {activeTab === "detail" ? (
                isEditing ? (
                  /* 일정 수정 폼 화면 */
                  <form onSubmit={handleUpdateEvent} className="space-y-3 text-xs">
                    <div>
                      <label className="block text-slate-600 font-bold mb-1">일정명 / 사업명</label>
                      <input
                        type="text"
                        value={editFormData.location}
                        onChange={(e) => setEditFormData({ ...editFormData, location: e.target.value })}
                        className="w-full p-2 border border-slate-300 rounded bg-slate-50 focus:bg-white focus:outline-blue-500"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-slate-600 font-bold mb-1">점검 날짜</label>
                        <input
                          type="date"
                          value={editFormData.start_date}
                          onChange={(e) => setEditFormData({ ...editFormData, start_date: e.target.value })}
                          className="w-full p-2 border border-slate-300 rounded bg-slate-50 focus:bg-white focus:outline-blue-500"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 font-bold mb-1">담당 조</label>
                        <select
                          value={editFormData.team}
                          onChange={(e) => setEditFormData({ ...editFormData, team: e.target.value })}
                          className="w-full p-2 border border-slate-300 rounded bg-slate-50 focus:bg-white focus:outline-blue-500 font-bold"
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
                      <label className="block text-slate-600 font-bold mb-1">현장 주소</label>
                      <input
                        type="text"
                        value={editFormData.address}
                        onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                        className="w-full p-2 border border-slate-300 rounded bg-slate-50 focus:bg-white focus:outline-blue-500"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-slate-600 font-bold mb-1">시공사</label>
                        <input
                          type="text"
                          value={editFormData.members}
                          onChange={(e) => setEditFormData({ ...editFormData, members: e.target.value })}
                          className="w-full p-2 border border-slate-300 rounded bg-slate-50 focus:bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 font-bold mb-1">감리사 / 발주청</label>
                        <input
                          type="text"
                          value={editFormData.supervisor}
                          onChange={(e) => setEditFormData({ ...editFormData, supervisor: e.target.value })}
                          className="w-full p-2 border border-slate-300 rounded bg-slate-50 focus:bg-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-slate-600 font-bold mb-1">현장 담당자</label>
                        <input
                          type="text"
                          value={editFormData.agent_name}
                          onChange={(e) => setEditFormData({ ...editFormData, agent_name: e.target.value })}
                          className="w-full p-2 border border-slate-300 rounded bg-slate-50 focus:bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-600 font-bold mb-1">연락처</label>
                        <input
                          type="text"
                          value={editFormData.agent_phone}
                          onChange={(e) => setEditFormData({ ...editFormData, agent_phone: e.target.value })}
                          className="w-full p-2 border border-slate-300 rounded bg-slate-50 focus:bg-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-600 font-bold mb-1">비고 및 메모</label>
                      <textarea
                        rows={3}
                        value={editFormData.notes}
                        onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                        className="w-full p-2 border border-slate-300 rounded bg-slate-50 focus:bg-white"
                      />
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button
                        type="submit"
                        className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold shadow"
                      >
                        수정사항 저장
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsEditing(false)}
                        className="px-4 py-2 border border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-bold"
                      >
                        취소
                      </button>
                    </div>
                  </form>
                ) : (
                  /* 기존 일정 상세 조회 화면 */
                  <div className="space-y-4 text-xs text-slate-700">
                    <div>
                      <div className="text-slate-400 font-semibold mb-0.5 flex items-center gap-1">
                        🏢 일정명 / 명칭
                      </div>
                      <div className="text-sm font-bold text-slate-800">
                        {selectedEvent.location || selectedEvent.project_name || selectedEvent.title || "현장점검"}
                      </div>
                    </div>

                    <div>
                      <div className="text-slate-400 font-semibold mb-0.5 flex items-center gap-1">
                        📅 날짜
                      </div>
                      <div className="font-bold text-emerald-600">
                        {selectedEvent.start_date || selectedEvent.check_date || "-"}
                      </div>
                    </div>

                    <div>
                      <div className="text-slate-400 font-semibold mb-0.5 flex items-center gap-1">
                        📍 장소 / 주소
                      </div>
                      <div className="font-medium text-slate-800 leading-relaxed mb-2">
                        {selectedEvent.address || selectedEvent.site_address || "주소 정보 없음"}
                      </div>
                      {(selectedEvent.address || selectedEvent.site_address) && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400 text-[11px]">길안내:</span>
                          <a
                            href={`https://map.kakao.com/link/search/${encodeURIComponent(selectedEvent.address || selectedEvent.site_address)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded text-[11px] font-bold hover:bg-amber-100"
                          >
                            카카오맵
                          </a>
                          <a
                            href={`https://map.naver.com/v5/search/${encodeURIComponent(selectedEvent.address || selectedEvent.site_address)}`}
                            target="_blank"
                            rel="noreferrer"
                            className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded text-[11px] font-bold hover:bg-emerald-100"
                          >
                            네이버 지도
                          </a>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <div>
                        <div className="text-slate-400 font-semibold mb-0.5">시공사</div>
                        <div className="font-bold text-slate-800">{selectedEvent.members || selectedEvent.builder || "정보 없음"}</div>
                      </div>
                      <div>
                        <div className="text-slate-400 font-semibold mb-0.5">감리사 / 발주청</div>
                        <div className="font-bold text-slate-800">{selectedEvent.supervisor || selectedEvent.client || "정보 없음"}</div>
                      </div>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <div className="text-slate-400 font-semibold mb-0.5">담당자 / 연락처</div>
                      <div className="text-slate-800 font-medium flex items-center gap-2">
                        <span>👤 {selectedEvent.agent_name || selectedEvent.manager_name || "담당자"}</span>
                        {(selectedEvent.agent_phone || selectedEvent.manager_phone) && (
                          <a href={`tel:${selectedEvent.agent_phone || selectedEvent.manager_phone}`} className="text-blue-600 font-semibold hover:underline">
                            📞 {selectedEvent.agent_phone || selectedEvent.manager_phone} (전화연결)
                          </a>
                        )}
                      </div>
                    </div>

                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                      <div className="text-slate-400 font-semibold mb-1 flex items-center gap-1">
                        📄 주요 내용 / 비고 메모
                      </div>
                      <p className="text-slate-700 whitespace-pre-line leading-relaxed">
                        {selectedEvent.notes || selectedEvent.status_note || "등록된 메모가 없습니다."}
                      </p>
                    </div>
                  </div>
                )
              ) : (
                /* AI 사진 정밀 대조 및 붉은색 사각형 시각화 뷰 */
                <div className="space-y-4">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1.5">
                        현장 점검 사진 등록 (카메라 촬영/앨범 선택)
                      </label>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                        className="block w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:bg-blue-50 file:text-blue-700 file:font-bold bg-white border border-slate-200 rounded-lg cursor-pointer"
                      />
                    </div>

                    <div className="relative flex items-center justify-center border-2 border-dashed border-slate-300 rounded-lg p-2 bg-white min-h-[160px] overflow-hidden">
                      {previewUrl ? (
                        <div className="relative inline-block max-w-full">
                          <img
                            src={previewUrl}
                            alt="현장사진"
                            className="max-h-64 object-contain rounded block"
                          />
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
                                className="absolute border-2 border-red-500 bg-red-500/20 pointer-events-none rounded transition-all"
                              >
                                {defect.label && (
                                  <span className="absolute -top-5 left-0 bg-red-600 text-white text-[9px] font-bold px-1.5 py-0.2 rounded shadow whitespace-nowrap">
                                    ⚠️ {defect.label}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">사진을 등록하면 미리보기가 표시됩니다.</span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={runAiAnalysis}
                      disabled={aiAnalyzing || !base64Data}
                      className={`w-full py-2.5 px-4 rounded-lg text-xs font-bold text-white shadow transition flex items-center justify-center gap-1.5 ${
                        aiAnalyzing || !base64Data
                          ? "bg-slate-400 cursor-not-allowed"
                          : "bg-blue-600 hover:bg-blue-700"
                      }`}
                    >
                      {aiAnalyzing ? "KCSC 기준 정밀 대조 중..." : "KCSC 공식 기준 원문 대조 분석 실행"}
                    </button>
                  </div>

                  <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-sm min-h-[200px]">
                    <div className="border-b border-slate-100 pb-2 mb-2.5 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">📋 KCSC(국가건설기준센터) 공식 기준 대조 결과</span>
                      {aiAnalyzing && (
                        <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded animate-pulse">
                          AI 기준 대조 분석 진행 중...
                        </span>
                      )}
                    </div>
                    {aiResult ? (
                      <div
                        className="text-xs text-slate-800 leading-relaxed space-y-2 [&>h1]:text-sm [&>h1]:font-bold [&>h1]:text-blue-900 [&>h2]:text-xs [&>h2]:font-bold [&>h2]:text-blue-800 [&>table]:w-full [&>table]:border-collapse [&>table]:border [&>table]:border-slate-300 [&>table]:my-2 [&_th]:bg-slate-100 [&_th]:p-2 [&_th]:border [&_th]:border-slate-300 [&_th]:text-center [&_td]:p-2 [&_td]:border [&_td]:border-slate-300 [&_td]:align-top [&>ul]:list-disc [&>ul]:pl-4 [&>ol]:list-decimal [&>ol]:pl-4 [&>blockquote]:border-l-4 [&>blockquote]:border-blue-500 [&>blockquote]:pl-2 [&>blockquote]:bg-slate-50 [&>blockquote]:py-1 [&>strong]:text-blue-900 [&>a]:text-blue-600 [&>a]:font-bold [&>a]:underline hover:[&>a]:text-blue-800"
                        dangerouslySetInnerHTML={{ __html: marked.parse(aiResult) }}
                      />
                    ) : (
                      <p className="text-xs text-slate-400 text-center py-8">
                        현장 사진을 올린 후 분석 실행 버튼을 누르면<br />
                        사진 상의 <strong className="text-red-500">결함 부위에 붉은색 사각형이 표시</strong>되고,<br />
                        KCSC(국가건설기준센터) 공식 기준과 바로가기 링크가 포함된 [현장점검 확인서]가 출력됩니다.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              {activeTab === "detail" && !isEditing ? (
                <>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsEditing(true)}
                      className="text-xs text-blue-600 border border-blue-200 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg font-semibold"
                    >
                      ✏️ 수정하기
                    </button>
                    <button
                      onClick={() => handleDelete(selectedEvent.id)}
                      className="text-xs text-rose-600 border border-rose-200 bg-rose-50 hover:bg-rose-100 px-3 py-1.5 rounded-lg font-semibold"
                    >
                      🗑️ 삭제
                    </button>
                  </div>
                  <button
                    onClick={() => setSelectedEvent(null)}
                    className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold"
                  >
                    닫기
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setSelectedEvent(null);
                    setIsEditing(false);
                  }}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold"
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
