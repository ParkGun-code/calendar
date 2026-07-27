"use client";

import React, { useState, useEffect, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import * as XLSX from "xlsx";
import { Upload, Filter, Trash2, RefreshCw } from "lucide-react";
import { createClient } from "@supabase/supabase-js";

const getSupabaseClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
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

// "05.11." 또는 "20260323" 또는 Date/Serial 포맷을 YYYY-MM-DD로 정확히 변환
const parseSpecialDate = (val: any): string => {
  if (!val) return new Date().toISOString().split("T")[0];

  // 1. "05.11." 나 "05.11" 같은 MM.DD. 형태 처리
  const strVal = String(val).trim();
  const mmddMatch = strVal.match(/^(\d{1,2})[\.\/-](\d{1,2})[\.]?$/);
  if (mmddMatch) {
    const currentYear = new Date().getFullYear();
    const m = String(mmddMatch[1]).padStart(2, "0");
    const d = String(mmddMatch[2]).padStart(2, "0");
    return `${currentYear}-${m}-${d}`;
  }

  // 2. 숫자인 경우 (Excel Serial Date)
  if (typeof val === "number") {
    const jsDate = XLSX.SSF.parse_date_code(val);
    if (jsDate) {
      const y = jsDate.y;
      const m = String(jsDate.m).padStart(2, "0");
      const d = String(jsDate.d).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }

  // 3. Date 객체
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const d = String(val.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // 4. "20260323" 같은 8자리 문자열
  if (/^\d{8}$/.test(strVal)) {
    return `${strVal.substring(0, 4)}-${strVal.substring(4, 6)}-${strVal.substring(6, 8)}`;
  }

  // 5. 기타 표준 문자열
  const cleanStr = strVal.replace(/\./g, "-").replace(/\//g, "-");
  const dateObj = new Date(cleanStr);
  if (!isNaN(dateObj.getTime())) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, "0");
    const d = String(dateObj.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  return new Date().toISOString().split("T")[0];
};

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchEvents = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.from("events").select("*");
      if (error) throw error;

      if (data) {
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
    if (username === "molitdj" && password === "eowjscjd1!") {
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
        const { error } = await supabase.from("events").delete().neq("id", 0);
        if (error) {
          alert(`삭제 실패: ${error.message}`);
          return;
        }
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

        // 엑셀을 2D 배열 형태(header: 1)로 변환하여 상단 복합 헤더 행 자동 탐색
        const sheetData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });

        if (sheetData.length === 0) {
          alert("엑셀 파일에 데이터가 없습니다.");
          setIsLoading(false);
          return;
        }

        // 실제 헤더(열 이름) 행 위치 탐색 ("담당조", "점검예정일", "공사명", "조" 등이 포함된 행)
        let headerRowIdx = -1;
        for (let i = 0; i < Math.min(sheetData.length, 10); i++) {
          const rowStr = sheetData[i].map(c => String(c).replace(/\s+/g, "")).join(" ");
          if (rowStr.includes("담당조") || rowStr.includes("점검예정일") || rowStr.includes("공사명") || rowStr.includes("점검지역")) {
            headerRowIdx = i;
            break;
          }
        }

        if (headerRowIdx === -1) {
          headerRowIdx = 0; // 발견 못한 경우 기본 0번 행 사용
        }

        const headers = sheetData[headerRowIdx].map(h => String(h).trim().replace(/\s+/g, ""));

        const findColIdx = (...keyNames: string[]) => {
          for (const kn of keyNames) {
            const idx = headers.findIndex(h => h.includes(kn));
            if (idx !== -1) return idx;
          }
          return -1;
        };

        const teamColIdx = findColIdx("담당조", "조", "구분", "점검조");
        const dateColIdx = findColIdx("점검예정일", "시작일", "점검일", "일자", "날짜", "착공일");
        const nameColIdx = findColIdx("공사명", "점검지역", "지역", "장소", "내용");
        const memberColIdx = findColIdx("성명", "점검자", "참석자", "담당자", "시공회사명");
        const noteColIdx = findColIdx("공사진행상태", "비고", "메모");

        const newCalendarEvents: CalendarEvent[] = [];
        const dbRowsToInsert: any[] = [];

        // 헤더 다음 행부터 데이터 추출
        for (let r = headerRowIdx + 1; r < sheetData.length; r++) {
          const row = sheetData[r];
          if (!row || row.length === 0) continue;

          const teamRaw = teamColIdx !== -1 ? String(row[teamColIdx] || "").trim() : "";
          const rawDate = dateColIdx !== -1 ? row[dateColIdx] : "";
          const rawName = nameColIdx !== -1 ? String(row[nameColIdx] || "").trim() : "";

          // 주요 값이 모두 없으면 건너뜀
          if (!teamRaw && !rawDate && !rawName) continue;

          const team = teamRaw || "1조";
          const color = TEAM_COLORS[team] || "#3B82F6";
          const startDate = parseSpecialDate(rawDate);
          const location = rawName || "현장점검";
          const members = memberColIdx !== -1 ? String(row[memberColIdx] || "").trim() : "";
          const notes = noteColIdx !== -1 ? String(row[noteColIdx] || "").trim() : "";

          const title = `${team} - ${location}`;

          newCalendarEvents.push({
            id: String(Date.now() + r),
            title,
            start: startDate,
            backgroundColor: color,
            borderColor: color,
            extendedProps: { team, members, location, notes },
          });

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

        const supabase = getSupabaseClient();
        if (supabase && dbRowsToInsert.length > 0) {
          const { error } = await supabase.from("events").insert(dbRowsToInsert);
          if (error) {
            console.error("DB 저장 에러:", error);
            alert(`DB 저장 에러: ${error.message}`);
          } else {
            alert(`총 ${dbRowsToInsert.length}건의 일정이 업로드되었습니다!`);
          }
          await fetchEvents();
        } else {
          setEvents((prev) => [...prev, ...newCalendarEvents]);
          alert(`총 ${newCalendarEvents.length}건의 일정이 화면에 표시되었습니다.`);
        }
      } catch (err: any) {
        console.error("엑셀 파일 파싱 에러:", err);
        alert(`엑셀 파일 처리 오류: ${err.message || err}`);
      } finally {
        setIsLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };

    reader.readAsBinaryString(file);
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
              엑셀 파일(.xlsx)을 올리면 아래 캘린더에 조별로 즉시 표시되며 서버에 자동 저장됩니다.
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
            locale="ko"
            events={filteredEvents}
            headerToolbar={{
              left: "prev,next today",
              center: "title",
              right: "",
            }}
            height="auto"
          />
        </div>
      </div>
    </main>
  );
}
