"use client";

import React, { useState, useEffect, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import * as XLSX from "xlsx";
import { Upload, Filter, Trash2, RefreshCw, X, Calendar, MapPin, User, FileText } from "lucide-react";
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
  end?: string;
  backgroundColor: string;
  borderColor: string;
  extendedProps: {
    team: string;
    members?: string;
    location?: string;
    notes?: string;
  };
}

const TEAM_COLORS: Record<string, string> = {
  "1조": "#3B82F6",
  "2조": "#10B981",
  "3조": "#F59E0B",
  "TF1조": "#8B5CF6",
  "TF2조": "#EC4899",
};

// "05.11." 또는 "05.11" 날짜 문자열을 YYYY-MM-DD 포맷으로 변환
const parseYColumnDate = (val: any): string => {
  if (!val) return "";

  const strVal = String(val).trim();

  // "05.11." 또는 "05.11" 또는 "5.11" 형태 매칭
  const mmddMatch = strVal.match(/^(\d{1,2})[\.\/-](\d{1,2})[\.]?$/);
  if (mmddMatch) {
    const currentYear = new Date().getFullYear();
    const m = String(mmddMatch[1]).padStart(2, "0");
    const d = String(mmddMatch[2]).padStart(2, "0");
    return `${currentYear}-${m}-${d}`;
  }

  // 엑셀 숫자 날짜
  if (typeof val === "number") {
    const jsDate = XLSX.SSF.parse_date_code(val);
    if (jsDate) {
      const y = jsDate.y;
      const m = String(jsDate.m).padStart(2, "0");
      const d = String(jsDate.d).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }

  // Date 객체
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const d = String(val.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // 8자리 숫자 "20260511"
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
          end: item.end_date || undefined,
          backgroundColor: item.bg_color || "#3B82F6",
          borderColor: item.border_color || "#3B82F6",
          extendedProps: {
            team: item.team || "1조",
            members: item.members || "",
            location: item.location || "",
            notes: item.notes || "",
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

        const sheetData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

        if (sheetData.length < 4) {
          alert("엑셀 파일에 데이터가 부족합니다.");
          setIsLoading(false);
          return;
        }

        const newCalendarEvents: CalendarEvent[] = [];
        const dbRowsToInsert: any[] = [];

        // 4번째 행(인덱스 3)부터 실제 데이터 처리
        for (let r = 3; r < sheetData.length; r++) {
          const row = sheetData[r];
          if (!row || row.length === 0) continue;

          // 열 지정: X열(23)=담당조, Y열(24)=점검예정일, F열(5)=공사명, R열(17)=시공회사명, W열(22)=공사진행상태
          const teamRaw = String(row[23] || "").trim();
          const rawDate = row[24];
          const rawName = String(row[5] || "").trim();
          const members = String(row[17] || "").trim();
          const notes = String(row[22] || "").trim();

          if (teamRaw === "담당조" || String(rawDate).includes("점검예정일")) continue;

          const startDate = parseYColumnDate(rawDate);
          if (!startDate) continue;

          const team = teamRaw || "1조";
          const color = TEAM_COLORS[team] || "#3B82F6";
          const location = rawName || "현장점검";
          const title = `${team} - ${location}`;

          const eventItem: CalendarEvent = {
            id: String(Date.now() + r),
            title,
            start: startDate,
            backgroundColor: color,
            borderColor: color,
            extendedProps: { team, members, location, notes },
          };

          newCalendarEvents.push(eventItem);

          dbRowsToInsert.push({
            title,
            start_date: startDate,
            end_date: null,
            bg_color: color,
            border_color: color,
            team,
            members,
            location,
            notes,
          });
        }

        // 화면 캘린더에 무조건 즉시 일정을 뿌려줍니다.
        setEvents(newCalendarEvents);

        // Supabase에도 백그라운드로 데이터 저장을 시도합니다.
        const supabase = getSupabaseClient();
        if (supabase && dbRowsToInsert.length > 0) {
          try {
            await supabase.from("events").insert(dbRowsToInsert);
          } catch (e) {
            console.error("DB 동기화 시도 중 에러:", e);
          }
        }

        alert(`총 ${newCalendarEvents.length}건의 점검 일정이 캘린더에 성공적으로 표시되었습니다!`);

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
    setSelectedEvent({
      id: evt.id,
      title: evt.title,
      start: evt.startStr,
      backgroundColor: evt.backgroundColor,
      borderColor: evt.borderColor,
      extendedProps: {
        team: evt.extendedProps.team,
        members: evt.extendedProps.members,
        location: evt.extendedProps.location,
        notes: evt.extendedProps.notes,
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
              엑셀 파일(.xlsx)을 올리면 아래 캘린더에 조별로 즉시 표시됩니다.
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
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-5 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <span
                  className="px-2.5 py-1 rounded-md text-xs font-bold text-white"
                  style={{ backgroundColor: selectedEvent.backgroundColor }}
                >
                  {selectedEvent.extendedProps.team}
                </span>
                <h3 className="text-lg font-bold text-slate-800">현장점검 상세정보</h3>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-3.5 text-sm">
              <div className="flex items-start gap-3">
                <MapPin className="text-blue-500 shrink-0 mt-0.5" size={18} />
                <div>
                  <span className="text-xs font-semibold text-slate-400 block">공사명 / 위치</span>
                  <span className="font-semibold text-slate-800">{selectedEvent.extendedProps.location}</span>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Calendar className="text-emerald-500 shrink-0 mt-0.5" size={18} />
                <div>
                  <span className="text-xs font-semibold text-slate-400 block">점검예정일</span>
                  <span className="font-semibold text-slate-800">{selectedEvent.start}</span>
                </div>
              </div>

              {selectedEvent.extendedProps.members && (
                <div className="flex items-start gap-3">
                  <User className="text-amber-500 shrink-0 mt-0.5" size={18} />
                  <div>
                    <span className="text-xs font-semibold text-slate-400 block">시공회사명</span>
                    <span className="text-slate-700">{selectedEvent.extendedProps.members}</span>
                  </div>
                </div>
              )}

              {selectedEvent.extendedProps.notes && (
                <div className="flex items-start gap-3">
                  <FileText className="text-purple-500 shrink-0 mt-0.5" size={18} />
                  <div>
                    <span className="text-xs font-semibold text-slate-400 block">공사진행상태 / 비고</span>
                    <p className="text-slate-700 whitespace-pre-wrap bg-slate-50 p-3 rounded-lg border border-slate-200 mt-1 text-xs">
                      {selectedEvent.extendedProps.notes}
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
