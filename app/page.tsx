"use client";

import React, { useState, useEffect, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import * as XLSX from "xlsx";
import {
  Upload,
  Filter,
  Trash2,
  RefreshCw,
  X,
  Calendar,
  MapPin,
  User,
  Phone,
  Building,
  FileText,
  Navigation,
  Edit2,
  Check,
  PlusCircle,
} from "lucide-react";
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
    seq: string;
    orderType: string;
    category: string;
    client: string;
    projectName: string;
    address: string;
    startDate: string;
    endDate: string;
    builder: string;
    supervisor: string;
    agentName: string;
    agentPhone: string;
    agentEmail: string;
    progressStatus: string;
    team: string;
    checkDate: string;
    eventType: string;
  };
}

// 실제 업무 체계에 맞춘 전용 컬러 팔레트
const TEAM_COLORS: Record<string, string> = {
  "1조": "#60A5FA",          // 파스텔 블루
  "2조": "#34D399",          // 파스텔 민트
  "3조": "#FBBF24",          // 파스텔 앰버
  "TF1조": "#A78BFA",        // 파스텔 퍼플
  "TF2조": "#F472B6",        // 파스텔 핑크
  "현장점검 결과회의": "#10B981",  // 에메랄드 그린
  "의견제출 검토회의": "#6366F1",  // 인디고 블루
  "벌점심의위원회": "#EF4444",    // 인텐스 레드
  "기타일정": "#64748B",          // 슬레이트 그레이
};

const parseCheckDate = (val: any): string => {
  if (!val) return "";
  const strVal = String(val).trim();

  const mmddMatch = strVal.match(/^(\d{1,2})[\.\/-](\d{1,2})[\.]?$/);
  if (mmddMatch) {
    const m = String(mmddMatch[1]).padStart(2, "0");
    const d = String(mmddMatch[2]).padStart(2, "0");
    return `2026-${m}-${d}`;
  }

  if (typeof val === "number") {
    const jsDate = XLSX.SSF.parse_date_code(val);
    if (jsDate) {
      return `${jsDate.y}-${String(jsDate.m).padStart(2, "0")}-${String(
        jsDate.d
      ).padStart(2, "0")}`;
    }
  }

  if (val instanceof Date) {
    return `${val.getFullYear()}-${String(val.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(val.getDate()).padStart(2, "0")}`;
  }

  if (/^\d{8}$/.test(strVal)) {
    return `${strVal.substring(0, 4)}-${strVal.substring(
      4,
      6
    )}-${strVal.substring(6, 8)}`;
  }

  const cleanStr = strVal.replace(/\./g, "-").replace(/\//g, "-");
  const dateObj = new Date(cleanStr);
  if (!isNaN(dateObj.getTime())) {
    return `${dateObj.getFullYear()}-${String(
      dateObj.getMonth() + 1
    ).padStart(2, "0")}-${String(dateObj.getDate()).padStart(2, "0")}`;
  }

  return "";
};

const formatDate = (val: any): string => {
  if (!val) return "-";
  if (typeof val === "number") {
    const jsDate = XLSX.SSF.parse_date_code(val);
    if (jsDate) {
      return `${jsDate.y}-${String(jsDate.m).padStart(2, "0")}-${String(
        jsDate.d
      ).padStart(2, "0")}`;
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
  const [deleteMonth, setDeleteMonth] = useState<string>("2026-05");
  const [isLoading, setIsLoading] = useState(false);

  // 일정 상세보기 / 수정 모달
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});

  // 새 일정 직접 추가 모달
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    category: "현장점검 결과회의",
    title: "",
    date: new Date().toISOString().split("T")[0],
    address: "",
    notes: "",
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchEvents = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.from("events").select("*");
      if (error) throw error;

      if (data && data.length > 0) {
        const dbEvents: CalendarEvent[] = data.map((item: any) => {
          const category = item.category || item.team || "1조";
          const color = TEAM_COLORS[category] || TEAM_COLORS[item.team] || "#60A5FA";
          return {
            id: String(item.id),
            title: item.title || "일정",
            start: item.start_date,
            backgroundColor: color,
            borderColor: color,
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
              team: item.team || "일반",
              checkDate: item.start_date || "",
              eventType: item.order_type || "meeting",
            },
          };
        });
        setEvents(dbEvents);
      } else {
        setEvents([]);
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

  // 직접 일정 추가 함수
  const handleAddCustomEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.title || !addForm.date) {
      alert("일정명과 날짜를 입력해 주세요.");
      return;
    }

    const color = TEAM_COLORS[addForm.category] || "#64748B";
    const title = `[${addForm.category}] ${addForm.title}`;

    const newEventItem: CalendarEvent = {
      id: String(Date.now()),
      title,
      start: addForm.date,
      backgroundColor: color,
      borderColor: color,
      extendedProps: {
        seq: "",
        orderType: "custom",
        category: addForm.category,
        client: "",
        projectName: addForm.title,
        address: addForm.address,
        startDate: addForm.date,
        endDate: addForm.date,
        builder: "",
        supervisor: "",
        agentName: "",
        agentPhone: "",
        agentEmail: "",
        progressStatus: addForm.notes,
        team: addForm.category,
        checkDate: addForm.date,
        eventType: "custom",
      },
    };

    setEvents((prev) => [...prev, newEventItem]);

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        await supabase.from("events").insert([
          {
            title,
            start_date: addForm.date,
            end_date: null,
            bg_color: color,
            border_color: color,
            team: addForm.category,
            category: addForm.category,
            location: addForm.title,
            address: addForm.address,
            notes: addForm.notes,
            order_type: "custom",
          },
        ]);
        await fetchEvents();
      } catch (err) {
        console.error("DB 저장 에러:", err);
      }
    }

    setIsAddModalOpen(false);
    setAddForm({
      category: "현장점검 결과회의",
      title: "",
      date: new Date().toISOString().split("T")[0],
      address: "",
      notes: "",
    });
    alert("새 회의/일정이 성공적으로 추가되었습니다!");
  };

  const handleClearDatabase = async () => {
    const supabase = getSupabaseClient();
    if (!confirm("정말로 등록된 전체 일정을 삭제하시겠습니까?")) return;

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

  const handleDeleteSpecificMonth = async () => {
    if (!deleteMonth) {
      alert("삭제할 월을 선택하세요.");
      return;
    }

    const yearMonthLabel = deleteMonth.replace("-", "년 ") + "월";
    if (!confirm(`정말로 ${yearMonthLabel}의 점검 데이터만 삭제하시겠습니까?`)) {
      return;
    }

    const supabase = getSupabaseClient();
    setIsLoading(true);

    try {
      if (supabase) {
        const { error } = await supabase
          .from("events")
          .delete()
          .like("start_date", `${deleteMonth}%`);

        if (error) {
          alert(`[DB 삭제 오류]\n내용: ${error.message}`);
          setIsLoading(false);
          return;
        }
      }

      setEvents((prev) =>
        prev.filter((evt) => !evt.start.startsWith(deleteMonth))
      );

      alert(`${yearMonthLabel} 데이터가 성공적으로 삭제되었습니다.`);
    } catch (err: any) {
      console.error("월별 삭제 에러:", err);
      alert(`삭제 중 오류 발생: ${err.message || err}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteSingleEvent = async () => {
    if (!selectedEvent) return;
    if (!confirm("해당 일정을 삭제하시겠습니까?")) return;

    const supabase = getSupabaseClient();
    if (supabase && !isNaN(Number(selectedEvent.id))) {
      try {
        await supabase.from("events").delete().eq("id", Number(selectedEvent.id));
      } catch (e) {
        console.error("삭제 실패:", e);
      }
    }

    setEvents((prev) => prev.filter((e) => e.id !== selectedEvent.id));
    setSelectedEvent(null);
    alert("일정이 삭제되었습니다.");
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

        const sheetData: any[][] = XLSX.utils.sheet_to_json(ws, {
          header: 1,
          defval: "",
        });

        if (sheetData.length < 4) {
          alert("엑셀 파일에 데이터가 부족합니다.");
          setIsLoading(false);
          return;
        }

        const newCalendarEvents: CalendarEvent[] = [];
        const dbRowsToInsert: any[] = [];

        for (let r = 0; r < sheetData.length; r++) {
          const row = sheetData[r];
          if (!row || row.length === 0) continue;

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

          if (teamRaw === "담당조" || String(rawCheckDate).includes("점검예정일")) continue;

          const checkDate = parseCheckDate(rawCheckDate);
          if (!checkDate) continue;

          const team = teamRaw || "1조";
          const color = TEAM_COLORS[team] || "#60A5FA";
          const title = `${team} - ${projectName.replace(/\n/g, " ") || "현장점검"}`;

          const eventItem: CalendarEvent = {
            id: String(Date.now() + Math.random() * 10000 + r),
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
              eventType: "inspection",
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
            seq,
            order_type: orderType,
            category,
            client,
            address,
            start_date_work: startDate,
            end_date_work: endDate,
            supervisor,
            agent_name: agentName,
            agent_phone: agentPhone,
            agent_email: agentEmail,
          });
        }

        setEvents((prev) => [...prev, ...newCalendarEvents]);

        const supabase = getSupabaseClient();
        if (supabase && dbRowsToInsert.length > 0) {
          try {
            await supabase.from("events").insert(dbRowsToInsert);
            await fetchEvents();
          } catch (e) {
            console.error("DB 동기화 에러:", e);
          }
        }

        alert(`총 ${newCalendarEvents.length}건의 일정이 추가되었습니다!`);
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

    const eventData: CalendarEvent = {
      id: evt.id,
      title: evt.title,
      start: evt.startStr,
      backgroundColor: evt.backgroundColor,
      borderColor: evt.borderColor,
      extendedProps: {
        seq: props.seq || "",
        orderType: props.orderType || "",
        category: props.category || "",
        client: props.client || "",
        projectName: props.projectName || "",
        address: props.address || "",
        startDate: props.startDate || "",
        endDate: props.endDate || "",
        builder: props.builder || "",
        supervisor: props.supervisor || "",
        agentName: props.agentName || "",
        agentPhone: props.agentPhone || "",
        agentEmail: props.agentEmail || "",
        progressStatus: props.progressStatus || "",
        team: props.team || "1조",
        checkDate: evt.startStr || "",
        eventType: props.eventType || "inspection",
      },
    };

    setSelectedEvent(eventData);
    setEditForm({ ...eventData.extendedProps });
    setIsEditing(false);
  };

  const handleSaveEdit = async () => {
    if (!selectedEvent) return;

    const updatedTeam = editForm.team || "1조";
    const updatedColor = TEAM_COLORS[updatedTeam] || "#60A5FA";
    const updatedTitle = `[${updatedTeam}] ${editForm.projectName || "일정"}`;

    const updatedEvent: CalendarEvent = {
      ...selectedEvent,
      title: updatedTitle,
      start: editForm.checkDate,
      backgroundColor: updatedColor,
      borderColor: updatedColor,
      extendedProps: {
        ...editForm,
      },
    };

    setEvents((prev) =>
      prev.map((e) => (e.id === selectedEvent.id ? updatedEvent : e))
    );
    setSelectedEvent(updatedEvent);
    setIsEditing(false);

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const isNumericId = !isNaN(Number(selectedEvent.id));
        if (isNumericId) {
          await supabase
            .from("events")
            .update({
              title: updatedTitle,
              start_date: editForm.checkDate,
              bg_color: updatedColor,
              border_color: updatedColor,
              team: updatedTeam,
              location: editForm.projectName,
              address: editForm.address,
              members: editForm.builder,
              supervisor: editForm.supervisor,
              agent_name: editForm.agentName,
              agent_phone: editForm.agentPhone,
              agent_email: editForm.agentEmail,
              notes: editForm.progressStatus,
            })
            .eq("id", Number(selectedEvent.id));
        }
      } catch (e) {
        console.error("DB 수정 실패:", e);
      }
    }

    alert("수정사항이 저장되었습니다.");
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
              현장점검 및 회의/심의 일정 캘린더
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
              현장점검 및 회의/심의 일정 캘린더
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              현장점검뿐만 아니라 결과회의, 검토회의, 벌점심의위원회 등 업무 일정을 총괄 관리합니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* 새 일정 직접 추가 버튼 */}
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2.5 rounded-xl font-semibold text-xs transition shadow-sm"
            >
              <PlusCircle size={15} />
              회의/일정 직접 추가
            </button>

            <button
              onClick={fetchEvents}
              disabled={isLoading}
              className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 px-3 py-2.5 rounded-xl font-medium text-sm transition"
              title="새로고침"
            >
              <RefreshCw
                size={16}
                className={isLoading ? "animate-spin" : ""}
              />
            </button>

            {/* 특정 월 선택 삭제 영역 */}
            <div className="flex items-center border border-slate-300 rounded-xl overflow-hidden bg-slate-50">
              <select
                value={deleteMonth}
                onChange={(e) => setDeleteMonth(e.target.value)}
                className="bg-transparent px-2.5 py-2 text-xs font-semibold text-slate-700 outline-none"
              >
                <option value="2026-05">2026년 5월</option>
                <option value="2026-06">2026년 6월</option>
                <option value="2026-07">2026년 7월</option>
                <option value="2026-08">2026년 8월</option>
                <option value="2026-09">2026년 9월</option>
                <option value="2026-10">2026년 10월</option>
                <option value="2026-11">2026년 11월</option>
                <option value="2026-12">2026년 12월</option>
              </select>
              <button
                onClick={handleDeleteSpecificMonth}
                disabled={isLoading}
                className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-2 text-xs font-semibold transition flex items-center gap-1"
                title="선택 월 삭제"
              >
                <Trash2 size={14} />
                월 삭제
              </button>
            </div>

            <button
              onClick={handleClearDatabase}
              disabled={isLoading}
              className="flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 px-3 py-2.5 rounded-xl font-medium text-xs transition"
              title="전체 일정 초기화"
            >
              <Trash2 size={14} />
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
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5 rounded-xl font-medium text-xs transition shadow-sm disabled:bg-slate-400"
            >
              <Upload size={14} />
              {isLoading ? "처리 중..." : "엑셀 파일 선택"}
            </button>
          </div>
        </div>

        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Filter size={18} className="text-slate-500" />
            <span className="text-sm font-semibold text-slate-700">
              구분 필터:
            </span>
            <select
              value={selectedTeam}
              onChange={(e) => setSelectedTeam(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-500 font-medium"
            >
              <option value="all">전체 보기</option>
              <option value="1조">1조 (현장점검)</option>
              <option value="2조">2조 (현장점검)</option>
              <option value="3조">3조 (현장점검)</option>
              <option value="TF1조">TF1조 (현장점검)</option>
              <option value="TF2조">TF2조 (현장점검)</option>
              <option value="현장점검 결과회의">현장점검 결과회의</option>
              <option value="의견제출 검토회의">의견제출 검토회의</option>
              <option value="벌점심의위원회">벌점심의위원회</option>
              <option value="기타일정">기타일정</option>
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {Object.entries(TEAM_COLORS).map(([team, color]) => (
              <span
                key={team}
                className="px-3 py-1 rounded-full text-xs font-bold text-white shadow-sm"
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

      {/* 회의 및 일정 직접 추가 팝업 모달 */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <PlusCircle className="text-emerald-600" size={20} />
                회의 및 업무 일정 추가
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleAddCustomEvent} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  회의 / 일정 구분 *
                </label>
                <select
                  value={addForm.category}
                  onChange={(e) =>
                    setAddForm({ ...addForm, category: e.target.value })
                  }
                  className="w-full border p-2.5 rounded-lg text-slate-800 font-semibold"
                >
                  <option value="현장점검 결과회의">현장점검 결과회의</option>
                  <option value="의견제출 검토회의">의견제출 검토회의</option>
                  <option value="벌점심의위원회">벌점심의위원회</option>
                  <option value="기타일정">기타일정</option>
                  <option value="1조">1조 현장점검</option>
                  <option value="2조">2조 현장점검</option>
                  <option value="3조">3조 현장점검</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  회의 안건 / 일정 제목 *
                </label>
                <input
                  type="text"
                  placeholder="예: 2026년 8월 현장점검 결과 총괄 검토회의"
                  value={addForm.title}
                  onChange={(e) =>
                    setAddForm({ ...addForm, title: e.target.value })
                  }
                  className="w-full border p-2.5 rounded-lg"
                  required
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  개최 날짜 *
                </label>
                <input
                  type="date"
                  value={addForm.date}
                  onChange={(e) =>
                    setAddForm({ ...addForm, date: e.target.value })
                  }
                  className="w-full border p-2.5 rounded-lg"
                  required
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  회의 장소 / 회의실
                </label>
                <input
                  type="text"
                  placeholder="예: 중회의실 / 세종청사 3동 201호"
                  value={addForm.address}
                  onChange={(e) =>
                    setAddForm({ ...addForm, address: e.target.value })
                  }
                  className="w-full border p-2.5 rounded-lg"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  주요 안건 및 참석 대상 / 비고
                </label>
                <textarea
                  rows={3}
                  placeholder="주요 검토 대상 현장, 참석 위원, 준비 서류 등 메모"
                  value={addForm.notes}
                  onChange={(e) =>
                    setAddForm({ ...addForm, notes: e.target.value })
                  }
                  className="w-full border p-2.5 rounded-lg"
                />
              </div>

              <div className="pt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="w-1/2 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl"
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl shadow"
                >
                  등록하기
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 상세보기 / 수정하기 모달 팝업 */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3 sticky top-0 bg-white z-10">
              <div className="flex items-center gap-2">
                <span
                  className="px-2.5 py-1 rounded-md text-xs font-bold text-white"
                  style={{
                    backgroundColor:
                      TEAM_COLORS[editForm.team] || selectedEvent.backgroundColor,
                  }}
                >
                  {editForm.team || selectedEvent.extendedProps.team}
                </span>
                <h3 className="text-lg font-bold text-slate-800">
                  {isEditing ? "일정 정보 수정" : "일정 상세정보"}
                </h3>
              </div>
              <button
                onClick={() => {
                  setSelectedEvent(null);
                  setIsEditing(false);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
              >
                <X size={18} />
              </button>
            </div>

            {isEditing ? (
              <div className="space-y-4 text-xs">
                <div>
                  <label className="font-semibold text-slate-600 block mb-1">
                    일정 구분
                  </label>
                  <select
                    value={editForm.team}
                    onChange={(e) =>
                      setEditForm({ ...editForm, team: e.target.value })
                    }
                    className="w-full border p-2 rounded-lg font-semibold"
                  >
                    <option value="1조">1조</option>
                    <option value="2조">2조</option>
                    <option value="3조">3조</option>
                    <option value="TF1조">TF1조</option>
                    <option value="TF2조">TF2조</option>
                    <option value="현장점검 결과회의">현장점검 결과회의</option>
                    <option value="의견제출 검토회의">의견제출 검토회의</option>
                    <option value="벌점심의위원회">벌점심의위원회</option>
                    <option value="기타일정">기타일정</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-600 block mb-1">
                    일정명 / 회의 제목
                  </label>
                  <input
                    type="text"
                    value={editForm.projectName}
                    onChange={(e) =>
                      setEditForm({ ...editForm, projectName: e.target.value })
                    }
                    className="w-full border p-2 rounded-lg"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-600 block mb-1">
                    개최 날짜
                  </label>
                  <input
                    type="date"
                    value={editForm.checkDate}
                    onChange={(e) =>
                      setEditForm({ ...editForm, checkDate: e.target.value })
                    }
                    className="w-full border p-2 rounded-lg"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-600 block mb-1">
                    장소 / 주소
                  </label>
                  <input
                    type="text"
                    value={editForm.address}
                    onChange={(e) =>
                      setEditForm({ ...editForm, address: e.target.value })
                    }
                    className="w-full border p-2 rounded-lg"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-600 block mb-1">
                    주요 안건 / 비고 메모
                  </label>
                  <textarea
                    rows={3}
                    value={editForm.progressStatus}
                    onChange={(e) =>
                      setEditForm({
                        ...editForm,
                        progressStatus: e.target.value,
                      })
                    }
                    className="w-full border p-2 rounded-lg"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-sm">
                <div className="flex items-start gap-3">
                  <Building
                    className="text-blue-500 shrink-0 mt-0.5"
                    size={18}
                  />
                  <div>
                    <span className="text-xs font-semibold text-slate-400 block">
                      일정명 / 회의 제목
                    </span>
                    <span className="font-bold text-slate-800 text-base">
                      {selectedEvent.extendedProps.projectName}
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Calendar
                    className="text-emerald-500 shrink-0 mt-0.5"
                    size={18}
                  />
                  <div>
                    <span className="text-xs font-semibold text-slate-400 block">
                      일정 날짜
                    </span>
                    <span className="font-bold text-emerald-600">
                      {selectedEvent.start}
                    </span>
                  </div>
                </div>

                {selectedEvent.extendedProps.address && (
                  <div className="flex items-start gap-3">
                    <MapPin
                      className="text-rose-500 shrink-0 mt-0.5"
                      size={18}
                    />
                    <div className="w-full">
                      <span className="text-xs font-semibold text-slate-400 block">
                        장소 / 주소
                      </span>
                      <span className="text-slate-700 block mt-0.5 mb-2 font-medium">
                        {selectedEvent.extendedProps.address}
                      </span>

                      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100">
                        <span className="text-[11px] font-semibold text-slate-400 mr-1">
                          길안내:
                        </span>
                        
                        <a
                          href={`https://map.kakao.com/link/search/${encodeURIComponent(
                            selectedEvent.extendedProps.address
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg hover:bg-amber-100 transition"
                        >
                          <Navigation size={11} />
                          카카오맵
                        </a>

                        <a
                          href={`https://map.naver.com/v5/search/${encodeURIComponent(
                            selectedEvent.extendedProps.address
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg hover:bg-emerald-100 transition"
                        >
                          <Navigation size={11} />
                          네이버 지도
                        </a>
                      </div>
                    </div>
                  </div>
                )}

                {(selectedEvent.extendedProps.builder ||
                  selectedEvent.extendedProps.supervisor) && (
                  <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                    {selectedEvent.extendedProps.builder && (
                      <div>
                        <span className="text-[11px] font-semibold text-slate-400 block">
                          시공사
                        </span>
                        <span className="text-xs font-semibold text-slate-800">
                          {selectedEvent.extendedProps.builder}
                        </span>
                      </div>
                    )}
                    {selectedEvent.extendedProps.supervisor && (
                      <div>
                        <span className="text-[11px] font-semibold text-slate-400 block">
                          감리사
                        </span>
                        <span className="text-xs font-semibold text-slate-800">
                          {selectedEvent.extendedProps.supervisor}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {(selectedEvent.extendedProps.agentName ||
                  selectedEvent.extendedProps.agentPhone) && (
                  <div className="space-y-1.5 bg-blue-50/60 p-3 rounded-xl border border-blue-100">
                    <span className="text-[11px] font-bold text-blue-700 block">
                      담당자 / 연락처
                    </span>
                    <div className="flex items-center gap-4 text-xs text-slate-700">
                      {selectedEvent.extendedProps.agentName && (
                        <span className="flex items-center gap-1 font-semibold">
                          <User size={14} className="text-blue-500" />
                          {selectedEvent.extendedProps.agentName}
                        </span>
                      )}
                      {selectedEvent.extendedProps.agentPhone && (
                        <a
                          href={`tel:${selectedEvent.extendedProps.agentPhone.replace(
                            /[^\d]/g,
                            ""
                          )}`}
                          className="flex items-center gap-1 font-bold text-blue-600 underline hover:text-blue-800 transition"
                          title="바로 전화걸기"
                        >
                          <Phone size={14} className="text-blue-500" />
                          {selectedEvent.extendedProps.agentPhone} (전화연결)
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {selectedEvent.extendedProps.progressStatus && (
                  <div className="flex items-start gap-3">
                    <FileText
                      className="text-amber-500 shrink-0 mt-0.5"
                      size={18}
                    />
                    <div className="w-full">
                      <span className="text-xs font-semibold text-slate-400 block">
                        주요 안건 / 비고 메모
                      </span>
                      <p className="text-slate-700 whitespace-pre-wrap bg-slate-50 p-3 rounded-lg border border-slate-200 mt-1 text-xs leading-relaxed">
                        {selectedEvent.extendedProps.progressStatus}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="pt-2 flex justify-between items-center border-t">
              {isEditing ? (
                <>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="text-xs text-slate-500 hover:text-slate-700"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition"
                  >
                    <Check size={14} />
                    저장하기
                  </button>
                </>
              ) : (
                <>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setIsEditing(true)}
                      className="flex items-center gap-1.5 text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg text-xs font-semibold transition"
                    >
                      <Edit2 size={14} />
                      수정하기
                    </button>
                    <button
                      onClick={handleDeleteSingleEvent}
                      className="flex items-center gap-1 text-rose-600 hover:text-rose-700 bg-rose-50 px-3 py-1.5 rounded-lg text-xs font-semibold transition"
                    >
                      <Trash2 size={14} />
                      삭제
                    </button>
                  </div>
                  <button
                    onClick={() => setSelectedEvent(null)}
                    className="bg-slate-800 hover:bg-slate-900 text-white text-xs font-medium px-4 py-2 rounded-lg transition"
                  >
                    닫기
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
