"use client";

import React, { useState, useEffect, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import * as XLSX from "xlsx";
import { Upload, Filter, Trash2, RefreshCw, X, Calendar, MapPin, User, Phone, Mail, Building, FileText } from "lucide-react";
import { createClient } from "@supabase/supabase-js";

const getSupabaseClient = () => {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (url && key && url.startsWith("http")) {
      return createClient(url, key);
    }
  } catch (e) {
    console.warn("Supabase 클라이언트 초기화 생략:", e);
  }
  return null;
};

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  backgroundColor: string;
  borderColor: string;
  extendedProps: {
    seq: string;          // B열: 연번
    orderType: string;    // C열: 발주
    category: string;     // D열: 구분
    client: string;       // E열: 발주처
    projectName: string;  // F열: 공사명
    address: string;      // G열: 현장사무실 주소
    startDate: string;    // J열: 착공일
    endDate: string;      // K열: 준공일
    builder: string;      // R열: 시공사
    supervisor: string;   // S열: 감리사
    agentName: string;    // T열: 현장대리인 성명
    agentPhone: string;   // U열: 현장대리인 전화번호
    agentEmail: string;   // V열: 현장대리인 이메일
    progressStatus: string;// W열: 공사진행상태
    team: string;         // X열: 현장점검 담당조
    checkDate: string;    // Y열: 현장점검 예정일
  };
}

const TEAM_COLORS: Record<string, string> = {
  "1조": "#3B82F6",
  "2조": "#10B981",
  "3조": "#F59E0B",
  "TF1조": "#8B5CF6",
  "TF2조": "#EC4899",
};

// Y열("05.11.")의 점검예정일을 YYYY-MM-DD 포맷으로 안전 변환
const parseCheckDate = (val: any): string => {
  if (!val) return "";

  const strVal = String(val).trim();

  // "05.11." 또는 "05.11" 또는 "5.11" 매칭
  const mmddMatch = strVal.match(/^(\d{1,2})[\.\/-](\d{1,2})[\.]?$/);
  if (mmddMatch) {
    const m = String(mmddMatch[1]).padStart(2, "0");
    const d = String(mmddMatch[2]).padStart(2, "0");
    return `2026-${m}-${d}`;
  }

  if (typeof val === "number") {
    const jsDate = XLSX.SSF.parse_date_code(val);
    if (jsDate) {
      const y = jsDate.y;
      const m = String(jsDate.m).padStart(2, "0");
      const d = String(jsDate.d).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }

  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const d = String(val.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  if (/^\d{8}$/.test(strVal)) {
    return `${strVal.substring(0, 4)}-${strVal.substring(4, 6)}-${strVal.substring(6, 8)}`;
  }

  const cleanStr = strVal.replace(/\./g, "-").replace(/\//g, "-");
  const dateObj = new Date(cleanStr);
  if (!isNaN(dateObj.getTime())) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, "0");
    const d = String(dateObj.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  return "";
};

// 일반 날짜(착공일/준공일) 포맷팅 함수
const formatDate = (val: any): string => {
  if (!val) return "-";
  if (typeof val === "number") {
    const jsDate = XLSX.SSF.parse_date_code(val);
    if (jsDate) {
      return `${jsDate.y}-${String(jsDate.m).padStart(2, "0")}-${String(jsDate.d).padStart(2, "0")}`;
    }
  }
  const str = String(val).split(" ")[0].replace(/\./g, "-");
  return str || "-";
};

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchEvents = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.from("events").select("*");
      if (error) throw error;

      if (data && data.length > 0) {
        const dbEvents: CalendarEvent[] = data.map((item: any) => ({
          id: String(item.id),
          title: item.title || "현장점검",
          start: item.start_date,
          backgroundColor: item.bg_color || "#3B82F6",
          borderColor: item.border_color || "#3B82F6",
          extendedProps: {
            seq: item.seq || "",
            orderType: item.order_type || "",
            category: item.category || "",
            client: item.client || "",
            projectName: item.location || "",
            address: item.address || "",
            startDate: item.start_date_work || "",
            endDate: item.end_date_work || "",
            builder: item.members || "",
            supervisor: item.supervisor || "",
            agentName: item.agent_name || "",
            agentPhone: item.agent_phone || "",
            agentEmail: item.agent_email || "",
            progressStatus: item.notes || "",
            team: item.team || "1조",
            checkDate: item.start_date || "",
          },
        }));
        setEvents(dbEvents);
      }
    } catch (err: any) {
      console.error("DB 로딩 에러:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      fetchEvents();
    }
  }, [isAuthenticated]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (username === "admin" && password === "1234") {
      setIsAuthenticated(true);
      setLoginError("");
    } else {
      setLoginError("아이디 또는 비밀번호가 올바르지 않습니다.");
    }
  };

  const handleClearDatabase = async () => {
    const supabase = getSupabaseClient();
    if (!confirm("정말로 등록된 모든 일정을 삭제하시겠습니까?")) return;

    if (supabase) {
      setIsLoading(true);
      try {
        await supabase.from("events").delete().neq("id", 0);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }
    
    setEvents([]);
    alert("모든 일정이 초기화되었습니다.");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    const reader = new FileReader();

    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: "binary", cellDates: true });
        const wsname = workbook.SheetNames[0];
        const ws = workbook.Sheets[wsname];

        // 2D 배열로 변환
        const sheetData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

        if (sheetData.length < 5) {
          alert("엑셀 파일에 5행 이상의 데이터가 필요합니다.");
          setIsLoading(false);
          return;
        }

        const newCalendarEvents: CalendarEvent[] = [];
        const dbRowsToInsert: any[] = [];

        // 요청하신 지정 규칙: 5행(인덱스 4)부터 데이터 시작
        for (let r = 4; r < sheetData.length; r++) {
          const row = sheetData[r];
          if (!row || row.length === 0) continue;

          // 지정된 열 정확 매핑:
          // B열 (1): 연번
          // C열 (2): 발주
          // D열 (3): 구분
          // E열 (4): 발주처(인허가기관)
          // F열 (5): 공사명
          // G열 (6): 현장사무실 주소
          // J열 (9): 착공일
          // K열 (10): 준공일
          // R열 (17): 시공사
          // S열 (18): 감리사
          // T열 (19): 현장대리인 성명
          // U열 (20): 현장대리인 전화번호
          // V열 (21): 현장대리인 이메일
          // W열 (22): 공사진행상태
          // X열 (23): 현장점검 담당조
          // Y열 (24): 현장점검 예정일

          const seq = String(row[1] || "").trim();
          const orderType = String(row[2] || "").trim();
          const category = String(row[3] || "").trim();
          const client = String(row[4] || "").trim();
          const projectName = String(row[5] || "").trim();
          const address = String(row[6] || "").trim();
          const startDate = formatDate(row[9]);
          const endDate = formatDate(row[10]);
          const builder = String(row[17] || "").trim();
          const supervisor = String(row[18] || "").trim();
          const agentName = String(row[19] || "").trim();
          const agentPhone = String(row[20] || "").trim();
          const agentEmail = String(row[21] || "").trim();
          const progressStatus = String(row[22] || "").trim();
          const teamRaw = String(row[23] || "").trim();
          const rawCheckDate = row[24];

          // Y열(현장점검 예정일) 파싱
          const checkDate = parseCheckDate(rawCheckDate);
          if (!checkDate) continue; // 점검예정일이 없는 데이터는 제외

          const team = teamRaw || "1조";
          const color = TEAM_COLORS[team] || "#3B82F6";
          const title = `${team} - ${projectName || "현장점검"}`;

          const eventItem: CalendarEvent = {
            id: String(Date.now() + r),
            title,
            start: checkDate,
            backgroundColor: color,
            borderColor: color,
            extendedProps: {
              seq,
              orderType,
              category,
              client,
              projectName,
              address,
              startDate,
              endDate,
              builder,
              supervisor,
              agentName,
              agentPhone,
              agentEmail,
              progressStatus,
              team,
              checkDate,
            },
          };

          newCalendarEvents.push(eventItem);

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
          });
        }

        setEvents(newCalendarEvents);

        // Supabase에도 백그라운드로 저장
        const supabase = getSupabaseClient();
        if (supabase && dbRowsToInsert.length > 0) {
          try {
            await supabase.from("events").insert(dbRowsToInsert);
          } catch (e) {
            console.error("DB 동기화 에러:", e);
          }
        }

        alert(`총 ${newCalendarEvents.length}건의 현장점검 일정이 캘린더에 정확히 등록되었습니다!`);

      } catch (err: any) {
        console.error("엑셀 파싱 오류:", err);
        alert(`엑셀 처리 오류: ${err.message || err}`);
      } finally {
        setIsLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };

    reader.readAsBinaryString(file);
  };

  const handleEventClick = (info: any) => {
    const evt = info.event;
    const props = evt.extendedProps;
    setSelectedEvent({
      id: evt.id,
      title: evt.title,
      start: evt.startStr,
      backgroundColor: evt.backgroundColor,
      borderColor: evt.borderColor,
      extendedProps: {
        seq: props.seq,
        orderType: props.orderType,
        category: props.category,
        client: props.client,
        projectName: props.projectName,
        address: props.address,
        startDate: props.startDate,
        endDate: props.endDate,
        builder: props.builder,
        supervisor: props.supervisor,
        agentName: props.agentName,
        agentPhone: props.agentPhone,
        agentEmail: props.agentEmail,
        progressStatus: props.progressStatus,
        team: props.team,
        checkDate: props.checkDate,
      },
    });
  };

  const filteredEvents =
    selectedTeam === "all"
      ? events
      : events.filter((evt) => evt.extendedProps.team === selectedTeam);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-lg max-w-md w-full border border-slate-200">
          <div className="text-center mb-6">
            <h1 className="text-xl font-bold text-slate-800">
              현장점검 일정 캘린더
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              접근 권한이 필요합니다. 아이디와 비밀번호를 입력하세요.
            </p>
          </div>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                아이디
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 transition"
                placeholder="아이디 입력"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                비밀번호
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full border border-slate-300 rounded-lg p-2.5 text-sm outline-none focus:border-blue-500 transition"
                placeholder="비밀번호 입력"
                required
              />
            </div>
            {loginError && (
              <p className="text-red-500 text-xs font-medium mt-1">
                {loginError}
              </p>
            )}
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg text-sm transition shadow-sm"
            >
              로그인
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              현장점검 일정 캘린더
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              우기 대비 현장점검 엑셀 파일(.xlsx)을 등록하면 아래 달력에 일정이 즉시 표시됩니다.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchEvents}
              disabled={isLoading}
              className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 px-3 py-2.5 rounded-xl font-medium text-sm transition"
              title="새로고침"
            >
              <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
            </button>
            <button
              onClick={handleClearDatabase}
              disabled={isLoading}
              className="flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 px-3.5 py-2.5 rounded-xl font-medium text-sm transition"
              title="전체 일정 초기화"
            >
              <Trash2 size={16} />
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
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition shadow-sm disabled:bg-slate-400"
            >
              <Upload size={16} />
              {isLoading ? "데이터 처리 중..." : "엑셀 파일 선택"}
            </button>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Filter size={18} className="text-slate-500" />
            <span className="text-sm font-semibold text-slate-700">조별 필터:</span>
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-500"
            >
              <option value="all">전체 보기</option>
              <option value="1조">1조</option>
              <option value="2조">2조</option>
              <option value="3조">3조</option>
              <option value="TF1조">TF1조</option>
              <option value="TF2조">TF2조</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {Object.entries(TEAM_COLORS).map(([team, color]) => (
              <span
                key={team}
                className="px-2.5 py-1 rounded-full text-xs font-semibold text-white"
                style={{ backgroundColor: color }}
              >
                {team}
              </span>
            ))}
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <FullCalendar
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            initialDate="2026-05-01"
            locale="ko"
            events={filteredEvents}
            eventClick={handleEventClick}
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "",
            }}
            height="auto"
          />
        </div>
      </div>

      {/* 상세보기 모달 팝업 */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3 sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2">
                <span
                  className="px-2.5 py-1 rounded-md text-xs font-bold text-white"
                  style={{ backgroundColor: selectedEvent.backgroundColor }}
                >
                  {selectedEvent.extendedProps.team}
                </span>
                <h3 className="text-lg font-bold text-slate-800">
                  {selectedEvent.extendedProps.seq ? `[NO.${selectedEvent.extendedProps.seq}] ` : ""}현장점검 상세정보
                </h3>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 text-sm">
              {/* 공사명 */}
              <div className="flex items-start gap-3">
                <Building className="text-blue-500 shrink-0 mt-0.5" size={18} />
                <div>
                  <span className="text-xs font-semibold text-slate-400 block">공사명</span>
                  <span className="font-bold text-slate-800 text-base">{selectedEvent.extendedProps.projectName}</span>
                  {(selectedEvent.extendedProps.orderType || selectedEvent.extendedProps.category) && (
                    <div className="mt-1 flex gap-1.5">
                      {selectedEvent.extendedProps.orderType && (
                        <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[11px] font-medium">
                          {selectedEvent.extendedProps.orderType}
                        </span>
                      )}
                      {selectedEvent.extendedProps.category && (
                        <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-[11px] font-medium">
                          {selectedEvent.extendedProps.category}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* 점검예정일 */}
              <div className="flex items-start gap-3">
                <Calendar className="text-emerald-500 shrink-0 mt-0.5" size={18} />
                <div>
                  <span className="text-xs font-semibold text-slate-400 block">현장점검 예정일</span>
                  <span className="font-bold text-emerald-600">{selectedEvent.start}</span>
                </div>
              </div>

              {/* 현장사무실 주소 */}
              {selectedEvent.extendedProps.address && (
                <div className="flex items-start gap-3">
                  <MapPin className="text-rose-500 shrink-0 mt-0.5" size={18} />
                  <div>
                    <span className="text-xs font-semibold text-slate-400 block">현장사무실 주소</span>
                    <span className="text-slate-700">{selectedEvent.extendedProps.address}</span>
                  </div>
                </div>
              )}

              {/* 발주처 */}
              {selectedEvent.extendedProps.client && (
                <div className="flex items-start gap-3">
                  <Building className="text-purple-500 shrink-0 mt-0.5" size={18} />
                  <div>
                    <span className="text-xs font-semibold text-slate-400 block">발주처 (인·허가 기관)</span>
                    <span className="text-slate-700">{selectedEvent.extendedProps.client}</span>
                  </div>
                </div>
              )}

              {/* 시공사 & 감리사 */}
              {(selectedEvent.extendedProps.builder || selectedEvent.extendedProps.supervisor) && (
                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                  {selectedEvent.extendedProps.builder && (
                    <div>
                      <span className="text-[11px] font-semibold text-slate-400 block">시공사</span>
                      <span className="text-xs font-semibold text-slate-800">{selectedEvent.extendedProps.builder}</span>
                    </div>
                  )}
                  {selectedEvent.extendedProps.supervisor && (
                    <div>
                      <span className="text-[11px] font-semibold text-slate-400 block">감리사</span>
                      <span className="text-xs font-semibold text-slate-800">{selectedEvent.extendedProps.supervisor}</span>
                    </div>
                  )}
                </div>
              )}

              {/* 현장대리인 정보 */}
              {(selectedEvent.extendedProps.agentName || selectedEvent.extendedProps.agentPhone) && (
                <div className="space-y-1.5 bg-blue-50/60 p-3 rounded-xl border border-blue-100">
                  <span className="text-[11px] font-bold text-blue-700 block">현장대리인 정보</span>
                  <div className="flex items-center gap-4 text-xs text-slate-700">
                    {selectedEvent.extendedProps.agentName && (
                      <span className="flex items-center gap-1 font-semibold">
                        <User size={14} className="text-blue-500" />
                        {selectedEvent.extendedProps.agentName}
                      </span>
                    )}
                    {selectedEvent.extendedProps.agentPhone && (
                      <span className="flex items-center gap-1">
                        <Phone size={14} className="text-blue-500" />
                        {selectedEvent.extendedProps.agentPhone}
                      </span>
                    )}
                  </div>
                  {selectedEvent.extendedProps.agentEmail && (
                    <div className="flex items-center gap-1 text-xs text-slate-600">
                      <Mail size={14} className="text-blue-500" />
                      {selectedEvent.extendedProps.agentEmail}
                    </div>
                  )}
                </div>
              )}

              {/* 공사기간 */}
              {(selectedEvent.extendedProps.startDate || selectedEvent.extendedProps.endDate) && (
                <div className="text-xs text-slate-500">
                  <span className="font-semibold text-slate-400">공사기간: </span>
                  {selectedEvent.extendedProps.startDate} ~ {selectedEvent.extendedProps.endDate}
                </div>
              )}

              {/* 공사진행상태 / 비고 */}
              {selectedEvent.extendedProps.progressStatus && (
                <div className="flex items-start gap-3">
                  <FileText className="text-amber-500 shrink-0 mt-0.5" size={18} />
                  <div className="w-full">
                    <span className="text-xs font-semibold text-slate-400 block">공사진행상태 (비고)</span>
                    <p className="text-slate-700 whitespace-pre-wrap bg-slate-50 p-3 rounded-lg border border-slate-200 mt-1 text-xs leading-relaxed">
                      {selectedEvent.extendedProps.progressStatus}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setSelectedEvent(null)}
                className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-medium px-4 py-2 rounded-lg transition"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
