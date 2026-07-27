"use client";

import React, { useState, useEffect, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import * as XLSX from "xlsx";
import { Upload, Filter, Trash2 } from "lucide-react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

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

// 엑셀 날짜 변환 함수 (Excel serial date 또는 string 처리)
const parseExcelDate = (val: any): string => {
  if (!val) return new Date().toISOString().split("T")[0];
  
  if (typeof val === "number") {
    const jsDate = XLSX.SSF.parse_date_code(val);
    if (jsDate) {
      const y = jsDate.y;
      const m = String(jsDate.m).padStart(2, "0");
      const d = String(jsDate.d).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }

  const str = String(val).trim().replace(/\./g, "-").replace(/\//g, "-");
  const dateObj = new Date(str);
  if (!isNaN(dateObj.getTime())) {
    return dateObj.toISOString().split("T")[0];
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
    setIsLoading(true);
    try {
      const { data, error } = await supabase.from("events").select("*");
      if (error) throw error;

      if (data) {
        const dbEvents: CalendarEvent[] = data.map((item: any) => ({
          id: String(item.id),
          title: item.title,
          start: item.start_date,
          end: item.end_date || undefined,
          backgroundColor: item.bg_color || "#3B82F6",
          borderColor: item.border_color || "#3B82F6",
          extendedProps: {
            team: item.team || "",
            members: item.members || "",
            location: item.location || "",
            notes: item.notes || "",
          },
        }));
        setEvents(dbEvents);
      }
    } catch (err) {
      console.error("DB 데이터 로딩 오류:", err);
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

  // DB 전체 비우기 (잘못 입력된 데이터 초기화용)
  const handleClearDatabase = async () => {
    if (!confirm("정말로 등록된 모든 일정을 삭제하시겠습니까?")) return;
    setIsLoading(true);
    try {
      const { error } = await supabase.from("events").delete().neq("id", 0);
      if (error) throw error;
      alert("모든 일정이 초기화되었습니다.");
      await fetchEvents();
    } catch (err) {
      alert("초기화 중 오류가 발생했습니다.");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
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
        const data = XLSX.utils.sheet_to_json<any>(ws);

        if (data.length === 0) {
          alert("엑셀 파일에 데이터가 없습니다.");
          return;
        }

        const rowsToInsert = data.map((row) => {
          // 다양한 열 이름 조합 유연하게 매칭
          const teamRaw =
            row["조"] || row["구분"] || row["점검조"] || row["팀"] || "1조";
          const team = String(teamRaw).trim();
          const color = TEAM_COLORS[team] || "#3B82F6";

          const rawDate =
            row["시작일"] ||
            row["일자"] ||
            row["날짜"] ||
            row["점검일"] ||
            row["점검일자"] ||
            row["시작일자"];
          const startDate = parseExcelDate(rawDate);

          const rawEndDate = row["종료일"] || row["종료일자"];
          const endDate = rawEndDate ? parseExcelDate(rawEndDate) : null;

          const location =
            row["점검지역"] || row["지역"] || row["점검장소"] || row["장소"] || row["내용"] || "현장점검";
          const members = row["점검자"] || row["참석자"] || row["담당자"] || "";
          const notes = row["비고"] || row["메모"] || "";

          return {
            title: `${team} - ${location}`,
            start_date: startDate,
            end_date: endDate,
            bg_color: color,
            border_color: color,
            team: team,
            members: String(members),
            location: String(location),
            notes: String(notes),
          };
        });

        const { error } = await supabase.from("events").insert(rowsToInsert);
        if (error) throw error;

        alert("엑셀 데이터가 성공적으로 등록되었습니다!");
        await fetchEvents();
      } catch (err) {
        alert("업로드 중 오류가 발생했습니다. 엑셀 파일 형식을 확인해 주세요.");
        console.error(err);
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
