"use client";

import React, { useState, useEffect, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import * as XLSX from "xlsx";
import { Upload, Filter, Trash2, RefreshCw } from "lucide-react";
import { createClient } from "@supabase/supabase-js";

// Supabase 클라이언트 헬퍼
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

// 범용 엑셀 날짜 변환 로직 (다양한 엑셀 포맷 대응)
const parseExcelDate = (val: any): string => {
  if (!val) return new Date().toISOString().split("T")[0];

  // 1. 숫자인 경우 (Excel Serial Date: 45412 등)
  if (typeof val === "number") {
    const jsDate = XLSX.SSF.parse_date_code(val);
    if (jsDate) {
      const y = jsDate.y;
      const m = String(jsDate.m).padStart(2, "0");
      const d = String(jsDate.d).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }

  // 2. Date 객체인 경우
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const d = String(val.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // 3. 문자열인 경우 ("2026.05.10", "2026-05-10", "2026/05/10", "05/10/2026")
  let str = String(val).trim();
  str = str.replace(/\./g, "-").replace(/\//g, "-");

  // YYYYMMDD 형태의 8자리 숫자 문자열 처리 (예: "20260510")
  if (/^\d{8}$/.test(str)) {
    return `${str.substring(0, 4)}-${str.substring(4, 6)}-${str.substring(6, 8)}`;
  }

  const dateObj = new Date(str);
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

  // DB 데이터 조회
  const fetchEvents = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) {
      console.warn("Supabase 환경변수가 설정되지 않아 로컬 상태만 사용합니다.");
      return;
    }

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

  // DB 전체 비우기
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

  // 엑셀 파일 업로드
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
        
        // 엑셀 데이터를 JSON 배열로 변환
        const data = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });

        if (data.length === 0) {
          alert("엑셀 파일에 데이터가 없습니다.");
          setIsLoading(false);
          return;
        }

        const newCalendarEvents: CalendarEvent[] = [];
        const dbRowsToInsert: any[] = [];

        data.forEach((row: any, idx: number) => {
          // 객체의 키들 중 대소문자/공백 제거하여 검색
          const findVal = (...keys: string[]) => {
            for (const key of keys) {
              const matchedKey = Object.keys(row).find(
                (k) => k.trim().replace(/\s+/g, "") === key.replace(/\s+/g, "")
              );
              if (matchedKey && row[matchedKey] !== undefined && row[matchedKey] !== "") {
                return row[matchedKey];
              }
            }
            return "";
          };

          // 필드값 추출
          const teamRaw = findVal("조", "구분", "점검조", "팀", "조구분") || "1조";
          const team = String(teamRaw).trim();
          const color = TEAM_COLORS[team] || "#3B82F6";

          const rawStartDate = findVal("시작일", "점검일", "일자", "날짜", "시작일자", "점검일자", "시작");
          const startDate = parseExcelDate(rawStartDate);

          const rawEndDate = findVal("종료일", "종료일자", "종료");
          const endDate = rawEndDate ? parseExcelDate(rawEndDate) : undefined;

          const location = String(findVal("점검지역", "지역", "점검장소", "장소", "내용", "점검내용", "점검대상") || "현장점검");
          const members = String(findVal("점검자", "참석자", "담당자", "점검인원", "명단") || "");
          const notes = String(findVal("비고", "메모", "특이사항") || "");

          const title = `${team} - ${location}`;

          // 화면 출력용 이벤트
          newCalendarEvents.push({
            id: String(Date.now() + idx),
            title,
            start: startDate,
            end: endDate,
            backgroundColor: color,
            borderColor: color,
            extendedProps: { team, members, location, notes },
          });

          // DB 저장용 데이터
          dbRowsToInsert.push({
            title,
            start_date: startDate,
            end_date: endDate || null,
            bg_color: color,
            border_color: color,
            team,
            members,
            location,
            notes,
          });
        });

        // Supabase DB에 저장 시도
        const supabase = getSupabaseClient();
        if (supabase) {
          const { error } = await supabase.from("events").insert(dbRowsToInsert);
          if (error) {
            console.error("DB 저장 에러:", error);
            alert(`DB 저장 중 에러가 발생했습니다: ${error.message}\n(화면에는 일정이 표시됩니다.)`);
          } else {
            alert(`총 ${dbRowsToInsert.length}건의 일정이 데이터베이스에 저장되었습니다!`);
          }
          await fetchEvents();
        } else {
          // DB 연결 없어도 화면에는 올린 데이터 즉시 반영
          setEvents((prev) => [...prev, ...newCalendarEvents]);
          alert(`총 ${newCalendarEvents.length}건의 일정이 화면에 표시되었습니다.`);
        }
      } catch (err: any) {
        console.error("엑셀 파일 파싱 에러:", err);
        alert(`엑셀 파일 처리 중 오류가 발생했습니다: ${err.message || err}`);
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
