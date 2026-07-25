"use client";

import React, { useState, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import * as XLSX from "xlsx";
import { Upload, Filter } from "lucide-react";

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
  "1조": "#3B82F6", // Blue
  "2조": "#10B981", // Green
  "3조": "#F59E0B", // Yellow
  "TF1조": "#8B5CF6", // Purple
  "TF2조": "#EC4899", // Pink
};

export default function Home() {
  // --- 1. 로그인 상태 관리 ---
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  // --- 2. 캘린더 데이터 및 필터 상태 ---
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string>("all");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 로그인 처리 함수
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (username === "admin" && password === "1234") {
      setIsAuthenticated(true);
      setLoginError("");
    } else {
      setLoginError("아이디 또는 비밀번호가 올바르지 않습니다.");
    }
  };

  // 엑셀 파일 처리 함수
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: "binary" });
        const wsname = workbook.SheetNames[0];
        const ws = workbook.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json<any>(ws);

        const newEvents: CalendarEvent[] = data.map((row, index) => {
          const team = row["조"] || row["구분"] || "1조";
          const color = TEAM_COLORS[team] || "#6B7280";

          return {
            id: String(index + 1),
            title: `${team} - ${row["점검지역"] || row["내용"] || "현장점검"}`,
            start: row["시작일"] || row["날짜"] || new Date().toISOString().split("T")[0],
            end: row["종료일"] || undefined,
            backgroundColor: color,
            borderColor: color,
            extendedProps: {
              team: team,
              members: row["점검자"] || row["참석자"] || "",
              location: row["점검지역"] || "",
              notes: row["비고"] || "",
            },
          };
        });

        setEvents(newEvents);
      } catch (err) {
        alert("엑셀 파일을 읽는 중 오류가 발생했습니다. 파일 양식을 확인해 주세요.");
      }
    };
    reader.readAsBinaryString(file);
  };

  // 선택된 조별 필터링
  const filteredEvents = selectedTeam === "all"
    ? events
    : events.filter((evt) => evt.extendedProps.team === selectedTeam);

  // ----------------------------------------------------
  // A. 로그인 전 화면
  // ----------------------------------------------------
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

  // ----------------------------------------------------
  // B. 로그인 성공 후 캘린더 메인 화면
  // ----------------------------------------------------
  return (
    <main className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* 상단 헤더 */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              현장점검 일정 캘린더
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              엑셀 파일(.xlsx)을 올리면 아래 캘린더에 조별로 즉시 표시됩니다.
            </p>
          </div>
          <div>
            <input
              type="file"
              accept=".xlsx, .xls"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-medium text-sm transition shadow-sm"
            >
              <Upload size={16} />
              엑셀 파일 선택
            </button>
          </div>
        </div>

        {/* 조별 필터 영역 */}
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

          {/* 조별 배지 뱃지 표시 */}
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

        {/* FullCalendar 달력 */}
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
