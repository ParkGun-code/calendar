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
  AlertTriangle,
  BarChart3,
  Search,
  Scale,
  CheckCircle2,
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
    
    hasFine: boolean;
    fineAmount: string;
    penaltyReason: string;

    hasDemerit: boolean;            
    demeritTarget: string;          
    demeritItem: string;            
    demeritScore: string;           
    demeritNoticeDate: string;      
    demeritOpinionDeadline: string; 
    hasOpinionSubmitted: boolean;
    opinionResult: string;          
    demeritReviewMeetingDate: string;
    demeritNoticeResultDate: string;
    demeritAppealDeadline: string;  
    hasAppealSubmitted: boolean;    
    demeritCommitteeDate: string;   
    demeritFinalResultDate: string; 

    hasLawsuit: boolean;            
    lawsuitCourt: string;           
    lawsuitCaseNumber: string;      
    lawsuitStatus: string;          
    lawsuitLawyer: string;          
    lawsuitResult: string;          
    lawsuitNotes: string;           
  };
}

const TEAM_COLORS: Record<string, string> = {
  "1조": "#60A5FA",          
  "2조": "#34D399",          
  "3조": "#FBBF24",          
  "TF1조": "#A78BFA",        
  "TF2조": "#F472B6",        
  "현장점검 결과회의": "#10B981",  
  "의견제출 검토회의": "#6366F1",  
  "벌점심의위원회": "#EF4444",    
  "기타일정": "#64748B",          
};

const parseCheckDate = (val: any): string => {
  if (!val) return "";
  const strVal = String(val).trim();

  const ymdMatch = strVal.match(/^(\d{4})[\.\/-](\d{1,2})[\.\/-](\d{1,2})[\.]?$/);
  if (ymdMatch) {
    const y = ymdMatch[1];
    const m = String(ymdMatch[2]).padStart(2, "0");
    const d = String(ymdMatch[3]).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  const mmddMatch = strVal.match(/^(\d{1,2})[\.\/-](\d{1,2})[\.]?$/);
  if (mmddMatch) {
    const m = String(mmddMatch[1]).padStart(2, "0");
    const d = String(mmddMatch[2]).padStart(2, "0");
    return `2024-${m}-${d}`;
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

const YEARS_LIST = Array.from({ length: 21 }, (_, i) => String(2010 + i));

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string>("all");
  const [deleteMonth, setDeleteMonth] = useState<string>("2024-01");
  const [isLoading, setIsLoading] = useState(false);

  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<any>({});

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    category: "기타일정",
    title: "",
    date: new Date().toISOString().split("T")[0],
    address: "",
    notes: "",
    hasFine: false,
    fineAmount: "",
    penaltyReason: "",

    hasDemerit: false,
    demeritTarget: "시공사",
    demeritItem: "",
    demeritScore: "",
    demeritNoticeDate: "",
    demeritOpinionDeadline: "",
    hasOpinionSubmitted: false,
    opinionResult: "미제출",
    demeritReviewMeetingDate: "",
    demeritNoticeResultDate: "",
    demeritAppealDeadline: "",
    hasAppealSubmitted: false,
    demeritCommitteeDate: "",
    demeritFinalResultDate: "",

    hasLawsuit: false,
    lawsuitCourt: "",
    lawsuitCaseNumber: "",
    lawsuitStatus: "소 제기(접수)",
    lawsuitLawyer: "",
    lawsuitResult: "",
    lawsuitNotes: "",
  });

  const [isStatsModalOpen, setIsStatsModalOpen] = useState(false);
  const [statsYearFilter, setStatsYearFilter] = useState("all");
  const [statsMonthFilter, setStatsMonthFilter] = useState("all");
  const [statsSearchQuery, setStatsSearchQuery] = useState("");

  const calendarRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchEvents = async () => {
    const supabase = getSupabaseClient();
    if (!supabase) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.from("events").select("*");
      if (error) {
        alert(`[Supabase DB 로딩 실패]\n${error.message}`);
        throw error;
      }

      if (data && data.length > 0) {
        const dbEvents: CalendarEvent[] = data.map((item: any) => {
          const category = item.category || item.team || "기타일정";
          const color = TEAM_COLORS[category] || TEAM_COLORS[item.team] || "#64748B";
          
          const isDemerit = item.has_demerit === true || item.has_demerit === "true" || item.has_demerit === 1;
          const isFine = item.has_fine === true || item.has_fine === "true" || item.has_fine === 1;
          const isLawsuit = item.has_lawsuit === true || item.has_lawsuit === "true" || item.has_lawsuit === 1;

          let displayTitle = item.title || item.location || "일정";
          if (isDemerit && !displayTitle.includes("⚠️")) displayTitle = `⚠️ ${displayTitle}`;
          if (isFine && !displayTitle.includes("💸")) displayTitle = `💸 ${displayTitle}`;
          if (isLawsuit && !displayTitle.includes("⚖️")) displayTitle = `⚖️ ${displayTitle}`;

          const validStartDate = parseCheckDate(item.start_date) || item.start_date;

          return {
            id: String(item.id),
            title: displayTitle,
            start: validStartDate,
            backgroundColor: color,
            borderColor: color,
            extendedProps: {
              seq: item.seq || "",
              orderType: item.order_type || "",
              category,
              client: item.client || "",
              projectName: item.location || item.title || "",
              address: item.address || "",
              startDate: item.start_date_work || "",
              endDate: item.end_date_work || "",
              builder: item.members || "",
              supervisor: item.supervisor || "",
              agentName: item.agent_name || "",
              agentPhone: item.agent_phone || "",
              agentEmail: item.agent_email || "",
              progressStatus: item.notes || "",
              team: item.team || "기타일정",
              checkDate: validStartDate,
              eventType: item.order_type || "meeting",
              
              hasFine: isFine,
              fineAmount: item.fine_amount || "",
              penaltyReason: item.penalty_reason || "",

              hasDemerit: isDemerit,
              demeritTarget: item.demerit_target || "시공사",
              demeritItem: item.demerit_item || "",
              demeritScore: item.demerit_score || "",
              demeritNoticeDate: item.demerit_notice_date || "",
              demeritOpinionDeadline: item.demerit_opinion_deadline || "",
              hasOpinionSubmitted: !!item.has_opinion_submitted,
              opinionResult: item.opinion_result || "미제출",
              demeritReviewMeetingDate: item.demerit_review_meeting_date || "",
              demeritNoticeResultDate: item.demerit_notice_result_date || "",
              demeritAppealDeadline: item.demerit_appeal_deadline || "",
              hasAppealSubmitted: !!item.has_appeal_submitted,
              demeritCommitteeDate: item.demerit_committee_date || "",
              demeritFinalResultDate: item.demerit_final_result_date || "",

              hasLawsuit: isLawsuit,
              lawsuitCourt: item.lawsuit_court || "",
              lawsuitCaseNumber: item.lawsuit_case_number || "",
              lawsuitStatus: item.lawsuit_status || "소 제기(접수)",
              lawsuitLawyer: item.lawsuit_lawyer || "",
              lawsuitResult: item.lawsuit_result || "",
              lawsuitNotes: item.lawsuit_notes || "",
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

  const handleAddCustomEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.title || !addForm.date) {
      alert("일정명과 날짜를 입력해 주세요.");
      return;
    }

    const color = TEAM_COLORS[addForm.category] || "#64748B";
    let baseTitle =
      addForm.category === "기타일정"
        ? addForm.title
        : `[${addForm.category}] ${addForm.title}`;

    if (addForm.hasDemerit) baseTitle = `⚠️ ${baseTitle}`;
    if (addForm.hasFine) baseTitle = `💸 ${baseTitle}`;
    if (addForm.hasLawsuit) baseTitle = `⚖️ ${baseTitle}`;

    const newEventItem: CalendarEvent = {
      id: String(Date.now()),
      title: baseTitle,
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
        hasFine: addForm.hasFine,
        fineAmount: addForm.fineAmount,
        penaltyReason: addForm.penaltyReason,

        hasDemerit: addForm.hasDemerit,
        demeritTarget: addForm.demeritTarget,
        demeritItem: addForm.demeritItem,
        demeritScore: addForm.demeritScore,
        demeritNoticeDate: addForm.demeritNoticeDate,
        demeritOpinionDeadline: addForm.demeritOpinionDeadline,
        hasOpinionSubmitted: addForm.hasOpinionSubmitted,
        opinionResult: addForm.opinionResult,
        demeritReviewMeetingDate: addForm.demeritReviewMeetingDate,
        demeritNoticeResultDate: addForm.demeritNoticeResultDate,
        demeritAppealDeadline: addForm.demeritAppealDeadline,
        hasAppealSubmitted: addForm.hasAppealSubmitted,
        demeritCommitteeDate: addForm.demeritCommitteeDate,
        demeritFinalResultDate: addForm.demeritFinalResultDate,

        hasLawsuit: addForm.hasLawsuit,
        lawsuitCourt: addForm.lawsuitCourt,
        lawsuitCaseNumber: addForm.lawsuitCaseNumber,
        lawsuitStatus: addForm.lawsuitStatus,
        lawsuitLawyer: addForm.lawsuitLawyer,
        lawsuitResult: addForm.lawsuitResult,
        lawsuitNotes: addForm.lawsuitNotes,
      },
    };

    setEvents((prev) => [...prev, newEventItem]);

    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { error } = await supabase.from("events").insert([
          {
            title: baseTitle,
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
            has_fine: addForm.hasFine,
            fine_amount: addForm.fineAmount,
            penalty_reason: addForm.penaltyReason,

            has_demerit: addForm.hasDemerit,
            demerit_target: addForm.demeritTarget,
            demerit_item: addForm.demeritItem,
            demerit_score: addForm.demeritScore,
            demerit_notice_date: addForm.demeritNoticeDate,
            demerit_opinion_deadline: addForm.demeritOpinionDeadline,
            has_opinion_submitted: addForm.hasOpinionSubmitted,
            opinion_result: addForm.opinionResult,
            demerit_review_meeting_date: addForm.demeritReviewMeetingDate,
            demerit_notice_result_date: addForm.demeritNoticeResultDate,
            demerit_appeal_deadline: addForm.demeritAppealDeadline,
            has_appeal_submitted: addForm.hasAppealSubmitted,
            demerit_committee_date: addForm.demeritCommitteeDate,
            demerit_final_result_date: addForm.demeritFinalResultDate,

            has_lawsuit: addForm.hasLawsuit,
            lawsuit_court: addForm.lawsuitCourt,
            lawsuit_case_number: addForm.lawsuitCaseNumber,
            lawsuit_status: addForm.lawsuitStatus,
            lawsuit_lawyer: addForm.lawsuitLawyer,
            lawsuit_result: addForm.lawsuitResult,
            lawsuit_notes: addForm.lawsuitNotes,
          },
        ]);

        if (error) {
          alert(`[DB 저장 실패 원인]\n${error.message}\n\n1단계의 SQL 쿼리를 실행하여 DB 테이블 권한을 수정해 주세요.`);
        } else {
          await fetchEvents();
        }
      } catch (err: any) {
        alert(`[DB 연결 오류] ${err.message || err}`);
      }
    }

    if (calendarRef.current) {
      calendarRef.current.getApi().gotoDate(addForm.date);
    }

    setIsAddModalOpen(false);
    alert(`[${addForm.date}] 날짜로 새 일정이 추가되었습니다! 해당 연/월 달력 위치로 이동합니다.`);
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
    alert("모든 업무 일정이 초기화되었습니다.");
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

      await fetchEvents();
      alert(`${yearMonthLabel} 데이터가 삭제되었습니다.`);
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
              hasFine: false,
              fineAmount: "",
              penaltyReason: "",
              hasDemerit: false,
              demeritTarget: "시공사",
              demeritItem: "",
              demeritScore: "",
              demeritNoticeDate: "",
              demeritOpinionDeadline: "",
              hasOpinionSubmitted: false,
              opinionResult: "미제출",
              demeritReviewMeetingDate: "",
              demeritNoticeResultDate: "",
              demeritAppealDeadline: "",
              hasAppealSubmitted: false,
              demeritCommitteeDate: "",
              demeritFinalResultDate: "",
              hasLawsuit: false,
              lawsuitCourt: "",
              lawsuitCaseNumber: "",
              lawsuitStatus: "소 제기(접수)",
              lawsuitLawyer: "",
              lawsuitResult: "",
              lawsuitNotes: "",
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
            has_demerit: false,
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
        team: props.team || "기타일정",
        checkDate: evt.startStr || "",
        eventType: props.eventType || "inspection",
        
        hasFine: !!props.hasFine,
        fineAmount: props.fineAmount || "",
        penaltyReason: props.penaltyReason || "",

        hasDemerit: !!props.hasDemerit,
        demeritTarget: props.demeritTarget || "시공사",
        demeritItem: props.demeritItem || "",
        demeritScore: props.demeritScore || "",
        demeritNoticeDate: props.demeritNoticeDate || "",
        demeritOpinionDeadline: props.demeritOpinionDeadline || "",
        hasOpinionSubmitted: !!props.hasOpinionSubmitted,
        opinionResult: props.opinionResult || "미제출",
        demeritReviewMeetingDate: props.demeritReviewMeetingDate || "",
        demeritNoticeResultDate: props.demeritNoticeResultDate || "",
        demeritAppealDeadline: props.demeritAppealDeadline || "",
        hasAppealSubmitted: !!props.hasAppealSubmitted,
        demeritCommitteeDate: props.demeritCommitteeDate || "",
        demeritFinalResultDate: props.demeritFinalResultDate || "",

        hasLawsuit: !!props.hasLawsuit,
        lawsuitCourt: props.lawsuitCourt || "",
        lawsuitCaseNumber: props.lawsuitCaseNumber || "",
        lawsuitStatus: props.lawsuitStatus || "소 제기(접수)",
        lawsuitLawyer: props.lawsuitLawyer || "",
        lawsuitResult: props.lawsuitResult || "",
        lawsuitNotes: props.lawsuitNotes || "",
      },
    };

    setSelectedEvent(eventData);
    setEditForm({ ...eventData.extendedProps });
    setIsEditing(false);
  };

  const handleSaveEdit = async () => {
    if (!selectedEvent) return;

    const updatedTeam = editForm.team || "기타일정";
    const updatedColor = TEAM_COLORS[updatedTeam] || "#64748B";
    
    let baseTitle =
      updatedTeam === "기타일정"
        ? editForm.projectName
        : `[${updatedTeam}] ${editForm.projectName || "일정"}`;

    if (editForm.hasDemerit) baseTitle = `⚠️ ${baseTitle}`;
    if (editForm.hasFine) baseTitle = `💸 ${baseTitle}`;
    if (editForm.hasLawsuit) baseTitle = `⚖️ ${baseTitle}`;

    const updatedEvent: CalendarEvent = {
      ...selectedEvent,
      title: baseTitle,
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
              title: baseTitle,
              start_date: editForm.checkDate,
              bg_color: updatedColor,
              border_color: updatedColor,
              team: updatedTeam,
              category: updatedTeam,
              location: editForm.projectName,
              address: editForm.address,
              members: editForm.builder,
              supervisor: editForm.supervisor,
              agent_name: editForm.agentName,
              agent_phone: editForm.agentPhone,
              agent_email: editForm.agentEmail,
              notes: editForm.progressStatus,
              has_fine: editForm.hasFine,
              fine_amount: editForm.fineAmount,
              penalty_reason: editForm.penaltyReason,

              has_demerit: editForm.hasDemerit,
              demerit_target: editForm.demeritTarget,
              demerit_item: editForm.demeritItem,
              demerit_score: editForm.demeritScore,
              demerit_notice_date: editForm.demeritNoticeDate,
              demerit_opinion_deadline: editForm.demeritOpinionDeadline,
              has_opinion_submitted: editForm.hasOpinionSubmitted,
              opinion_result: editForm.opinionResult,
              demerit_review_meeting_date: editForm.demeritReviewMeetingDate,
              demerit_notice_result_date: editForm.demeritNoticeResultDate,
              demerit_appeal_deadline: editForm.demeritAppealDeadline,
              has_appeal_submitted: editForm.hasAppealSubmitted,
              demerit_committee_date: editForm.demeritCommitteeDate,
              demerit_final_result_date: editForm.demeritFinalResultDate,

              has_lawsuit: editForm.hasLawsuit,
              lawsuit_court: editForm.lawsuitCourt,
              lawsuit_case_number: editForm.lawsuitCaseNumber,
              lawsuit_status: editForm.lawsuitStatus,
              lawsuit_lawyer: editForm.lawsuitLawyer,
              lawsuit_result: editForm.lawsuitResult,
              lawsuit_notes: editForm.lawsuitNotes,
            })
            .eq("id", Number(selectedEvent.id));
        }
      } catch (e) {
        console.error("DB 수정 실패:", e);
      }
    }

    alert("수정사항이 저장되었습니다.");
  };

  const penaltyEvents = events.filter(
    (e) => e.extendedProps.hasDemerit || e.extendedProps.hasFine
  );

  const periodFilteredPenaltyEvents = penaltyEvents.filter((e) => {
    if (!e.start) return false;
    const [y, m] = e.start.split("-");
    if (statsYearFilter !== "all" && y !== statsYearFilter) return false;
    if (statsMonthFilter !== "all" && m !== statsMonthFilter) return false;
    return true;
  });

  const finalTableEvents = periodFilteredPenaltyEvents.filter((e) => {
    const q = statsSearchQuery.toLowerCase();
    return (
      e.extendedProps.projectName.toLowerCase().includes(q) ||
      e.extendedProps.builder.toLowerCase().includes(q) ||
      e.extendedProps.penaltyReason.toLowerCase().includes(q) ||
      e.extendedProps.demeritItem.toLowerCase().includes(q) ||
      e.extendedProps.lawsuitCaseNumber.toLowerCase().includes(q)
    );
  });

  const totalDemeritSitesCount = periodFilteredPenaltyEvents.filter(
    (e) => e.extendedProps.hasDemerit
  ).length;

  const totalFineSitesCount = periodFilteredPenaltyEvents.filter(
    (e) => e.extendedProps.hasFine
  ).length;

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
              건설안전과 일정 캘린더
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
              건설안전과 일정 캘린더
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              2010년 이후 점검 및 회의 일정과 벌점/과태료 부과 및 소송 진행 현황 통합 관리
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsStatsModalOpen(true)}
              className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white px-3.5 py-2.5 rounded-xl font-semibold text-xs transition shadow-sm"
            >
              <BarChart3 size={15} />
              📊 처분 현황 & 통계
            </button>

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

            <div className="flex items-center border border-slate-300 rounded-xl overflow-hidden bg-slate-50">
              <select
                value={deleteMonth}
                onChange={(e) => setDeleteMonth(e.target.value)}
                className="bg-transparent px-2.5 py-2 text-xs font-semibold text-slate-700 outline-none"
              >
                {YEARS_LIST.flatMap((y) =>
                  ["01", "03", "05", "06", "08", "09", "11", "12"].map((m) => (
                    <option key={`${y}-${m}`} value={`${y}-${m}`}>
                      {y}년 {parseInt(m)}월
                    </option>
                  ))
                )}
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
            ref={calendarRef}
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

      {/* 📊 벌점·과태료 부과 현황 통계 대시보드 모달 */}
      {isStatsModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-100 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <BarChart3 className="text-rose-600" size={22} />
                벌점 & 과태료 부과 현황 통계
              </h3>
              <button
                onClick={() => setIsStatsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-bold text-slate-700">통계 기간 선택:</span>
              <div className="flex items-center gap-2 text-xs">
                <select
                  value={statsYearFilter}
                  onChange={(e) => setStatsYearFilter(e.target.value)}
                  className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 font-semibold text-slate-800 outline-none focus:border-rose-500"
                >
                  <option value="all">전체 연도</option>
                  {YEARS_LIST.map((y) => (
                    <option key={y} value={y}>
                      {y}년
                    </option>
                  ))}
                </select>

                <select
                  value={statsMonthFilter}
                  onChange={(e) => setStatsMonthFilter(e.target.value)}
                  className="bg-white border border-slate-300 rounded-lg px-3 py-1.5 font-semibold text-slate-800 outline-none focus:border-rose-500"
                >
                  <option value="all">전체 월</option>
                  <option value="01">1월</option>
                  <option value="02">2월</option>
                  <option value="03">3월</option>
                  <option value="04">4월</option>
                  <option value="05">5월</option>
                  <option value="06">6월</option>
                  <option value="07">7월</option>
                  <option value="08">8월</option>
                  <option value="09">9월</option>
                  <option value="10">10월</option>
                  <option value="11">11월</option>
                  <option value="12">12월</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl text-center">
                <span className="text-xs font-bold text-rose-700 block">총 벌점 부과 현장</span>
                <span className="text-2xl font-black text-rose-800 mt-1 block">
                  {totalDemeritSitesCount} <span className="text-xs font-medium">개소</span>
                </span>
              </div>
              <div className="bg-purple-50 border border-purple-200 p-4 rounded-xl text-center">
                <span className="text-xs font-bold text-purple-700 block">총 과태료 부과 현장</span>
                <span className="text-2xl font-black text-purple-900 mt-1 block">
                  {totalFineSitesCount} <span className="text-xs font-medium">개소</span>
                </span>
              </div>
            </div>

            <div className="relative">
              <Search size={16} className="absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="공사명, 시공사, 처분사유, 사건번호 검색..."
                value={statsSearchQuery}
                onChange={(e) => setStatsSearchQuery(e.target.value)}
                className="w-full border border-slate-300 rounded-xl pl-9 pr-3 py-2 text-xs outline-none focus:border-rose-500"
              />
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-100 border-b border-slate-200 text-slate-700 font-semibold">
                  <tr>
                    <th className="p-2.5">점검일자</th>
                    <th className="p-2.5">공사명 / 현장</th>
                    <th className="p-2.5">대상 / 항목</th>
                    <th className="p-2.5 text-center">처분구분</th>
                    <th className="p-2.5 text-right">벌점/소송</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {finalTableEvents.length > 0 ? (
                    finalTableEvents.map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50">
                        <td className="p-2.5 text-slate-500 whitespace-nowrap">{e.start}</td>
                        <td className="p-2.5 font-bold text-slate-800">{e.extendedProps.projectName}</td>
                        <td className="p-2.5 text-slate-600">
                          {e.extendedProps.demeritTarget ? `[${e.extendedProps.demeritTarget}] ` : ""}
                          {e.extendedProps.demeritItem || e.extendedProps.builder || "-"}
                        </td>
                        <td className="p-2.5 text-center whitespace-nowrap">
                          {e.extendedProps.hasDemerit && (
                            <span className="bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-bold mr-1">
                              벌점
                            </span>
                          )}
                          {e.extendedProps.hasFine && (
                            <span className="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-bold mr-1">
                              과태료
                            </span>
                          )}
                          {e.extendedProps.hasLawsuit && (
                            <span className="bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-bold">
                              소송중
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 text-right font-semibold text-rose-600 whitespace-nowrap">
                          {e.extendedProps.hasDemerit && `${e.extendedProps.demeritScore}점 `}
                          {e.extendedProps.hasLawsuit && (
                            <span className="text-indigo-600 font-bold block text-[11px]">
                              ⚖️ {e.extendedProps.lawsuitStatus}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-slate-400">
                        해당 기간에 등록된 벌점 및 과태료 부과 현장이 없습니다.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <button
              onClick={() => setIsStatsModalOpen(false)}
              className="w-full bg-slate-800 hover:bg-slate-900 text-white font-medium py-2.5 rounded-xl text-xs transition"
            >
              닫기
            </button>
          </div>
        </div>
      )}

      {/* 회의 및 기타일정 추가 팝업 모달 */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto">
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
                  <option value="기타일정">기타일정</option>
                  <option value="현장점검 결과회의">현장점검 결과회의</option>
                  <option value="의견제출 검토회의">의견제출 검토회의</option>
                  <option value="벌점심의위원회">벌점심의위원회</option>
                  <option value="1조">1조 현장점검</option>
                  <option value="2조">2조 현장점검</option>
                  <option value="3조">3조 현장점검</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  {addForm.category === "기타일정" ? "일정 제목 *" : "회의 안건 / 일정 제목 *"}
                </label>
                <input
                  type="text"
                  placeholder="제목 입력"
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
                  점검일 / 개최 날짜 *
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
                  장소 / 주소
                </label>
                <input
                  type="text"
                  value={addForm.address}
                  onChange={(e) =>
                    setAddForm({ ...addForm, address: e.target.value })
                  }
                  className="w-full border p-2.5 rounded-lg"
                />
              </div>

              <div className="bg-rose-50/80 border border-rose-200 p-3.5 rounded-xl space-y-3">
                <div className="flex items-center justify-between border-b border-rose-200 pb-2">
                  <span className="font-bold text-rose-900 flex items-center gap-1">
                    <AlertTriangle size={15} />
                    벌점 부과 상세 프로세스
                  </span>
                  <label className="flex items-center gap-1.5 font-bold text-rose-700">
                    <input
                      type="checkbox"
                      checked={addForm.hasDemerit}
                      onChange={(e) =>
                        setAddForm({ ...addForm, hasDemerit: e.target.checked })
                      }
                      className="rounded text-rose-600 focus:ring-rose-500"
                    />
                    벌점부과 현장 설정
                  </label>
                </div>

                {addForm.hasDemerit && (
                  <div className="space-y-2.5 pt-1">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="font-semibold text-slate-700 block mb-0.5">벌점 대상</label>
                        <select
                          value={addForm.demeritTarget}
                          onChange={(e) => setAddForm({ ...addForm, demeritTarget: e.target.value })}
                          className="w-full border p-2 rounded-lg bg-white"
                        >
                          <option value="시공사">시공사</option>
                          <option value="감리사">감리사</option>
                          <option value="시공사 및 감리사">시공사 및 감리사</option>
                        </select>
                      </div>
                      <div>
                        <label className="font-semibold text-slate-700 block mb-0.5">벌점 점수 (점)</label>
                        <input
                          type="text"
                          placeholder="예: 1.5"
                          value={addForm.demeritScore}
                          onChange={(e) => setAddForm({ ...addForm, demeritScore: e.target.value })}
                          className="w-full border p-2 rounded-lg bg-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="font-semibold text-slate-700 block mb-0.5">벌점 항목 (지적 분야)</label>
                      <input
                        type="text"
                        placeholder="예: 안전관리비 정산 부적정"
                        value={addForm.demeritItem}
                        onChange={(e) => setAddForm({ ...addForm, demeritItem: e.target.value })}
                        className="w-full border p-2 rounded-lg bg-white"
                      />
                    </div>

                    <div className="space-y-2 pt-1 border-t border-rose-200/60">
                      <span className="font-bold text-rose-800 text-[11px] block">1단계: 사전통지 및 의견제출 결과</span>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] text-slate-600 block">사전통지일</label>
                          <input
                            type="date"
                            value={addForm.demeritNoticeDate}
                            onChange={(e) => setAddForm({ ...addForm, demeritNoticeDate: e.target.value })}
                            className="w-full border p-1.5 rounded-lg bg-white"
                          />
                        </div>
                        <div>
                          <label className="text-[11px] text-slate-600 block">의견제출 마감일</label>
                          <input
                            type="date"
                            value={addForm.demeritOpinionDeadline}
                            onChange={(e) => setAddForm({ ...addForm, demeritOpinionDeadline: e.target.value })}
                            className="w-full border p-1.5 rounded-lg bg-white"
                          />
                        </div>
                      </div>

                      <div className="bg-white p-2.5 rounded-lg border border-rose-200 space-y-1.5">
                        <label className="font-bold text-rose-900 block text-[11px]">의견제출 검토 결과 선택 *</label>
                        <select
                          value={addForm.opinionResult}
                          onChange={(e) => setAddForm({ ...addForm, opinionResult: e.target.value })}
                          className="w-full border p-1.5 rounded-lg bg-slate-50 font-semibold"
                        >
                          <option value="미제출">의견 미제출 (진행 계속)</option>
                          <option value="불수용">의견 제출 - 불수용 (진행 계속)</option>
                          <option value="수용(종결)">의견 제출 - 수용 (벌점부과 철회/종결)</option>
                        </select>
                      </div>

                      {addForm.opinionResult === "수용(종결)" ? (
                        <div className="bg-emerald-50 text-emerald-800 p-2.5 rounded-lg border border-emerald-200 text-[11px] font-bold flex items-center gap-1.5">
                          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                          의견이 수용되어 절차가 종결되었습니다.
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-2 gap-2 pt-1">
                            <div>
                              <label className="text-[11px] text-slate-600 block">의견검토회의일</label>
                              <input
                                type="date"
                                value={addForm.demeritReviewMeetingDate}
                                onChange={(e) => setAddForm({ ...addForm, demeritReviewMeetingDate: e.target.value })}
                                className="w-full border p-1.5 rounded-lg bg-white"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] text-slate-600 block">검토결과 통보일</label>
                              <input
                                type="date"
                                value={addForm.demeritNoticeResultDate}
                                onChange={(e) => setAddForm({ ...addForm, demeritNoticeResultDate: e.target.value })}
                                className="w-full border p-1.5 rounded-lg bg-white"
                              />
                            </div>
                          </div>

                          <div className="space-y-2 pt-2 border-t border-rose-200/60">
                            <span className="font-bold text-rose-800 text-[11px] block">2단계: 이의제기 및 외부심의회</span>
                            
                            <div>
                              <label className="text-[11px] text-slate-600 block mb-0.5">이의제기 마감일</label>
                              <input
                                type="date"
                                value={addForm.demeritAppealDeadline}
                                onChange={(e) => setAddForm({ ...addForm, demeritAppealDeadline: e.target.value })}
                                className="w-full border p-1.5 rounded-lg bg-white"
                              />
                            </div>

                            <div className="bg-white p-2.5 rounded-lg border border-rose-200 space-y-1.5">
                              <label className="font-bold text-rose-900 block text-[11px]">이의제기 제출 여부 *</label>
                              <div className="flex gap-4">
                                <label className="flex items-center gap-1 font-semibold text-slate-700">
                                  <input
                                    type="radio"
                                    name="appeal"
                                    checked={!addForm.hasAppealSubmitted}
                                    onChange={() => setAddForm({ ...addForm, hasAppealSubmitted: false })}
                                  />
                                  미제출 (벌점 확정 종결)
                                </label>
                                <label className="flex items-center gap-1 font-semibold text-purple-800">
                                  <input
                                    type="radio"
                                    name="appeal"
                                    checked={addForm.hasAppealSubmitted}
                                    onChange={() => setAddForm({ ...addForm, hasAppealSubmitted: true })}
                                  />
                                  이의제기 제출 (외부심의 진행)
                                </label>
                              </div>
                            </div>

                            {addForm.hasAppealSubmitted && (
                              <div className="grid grid-cols-2 gap-2 bg-purple-50/60 p-2 rounded-lg border border-purple-100">
                                <div>
                                  <label className="text-[11px] text-slate-600 block">외부심의회 개최일</label>
                                  <input
                                    type="date"
                                    value={addForm.demeritCommitteeDate}
                                    onChange={(e) => setAddForm({ ...addForm, demeritCommitteeDate: e.target.value })}
                                    className="w-full border p-1.5 rounded-lg bg-white"
                                  />
                                </div>
                                <div>
                                  <label className="text-[11px] text-slate-600 block">최종결과 통보일</label>
                                  <input
                                    type="date"
                                    value={addForm.demeritFinalResultDate}
                                    onChange={(e) => setAddForm({ ...addForm, demeritFinalResultDate: e.target.value })}
                                    className="w-full border p-1.5 rounded-lg bg-white"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>

                    <div className="bg-indigo-50/90 border border-indigo-200 p-3 rounded-xl space-y-2 mt-2">
                      <div className="flex items-center justify-between border-b border-indigo-200 pb-1.5">
                        <span className="font-bold text-indigo-950 flex items-center gap-1">
                          <Scale size={15} />
                          행정소송 진행 관리
                        </span>
                        <label className="flex items-center gap-1.5 font-bold text-indigo-800">
                          <input
                            type="checkbox"
                            checked={addForm.hasLawsuit}
                            onChange={(e) => setAddForm({ ...addForm, hasLawsuit: e.target.checked })}
                            className="rounded text-indigo-600 focus:ring-indigo-500"
                          />
                          소송 제기됨
                        </label>
                      </div>

                      {addForm.hasLawsuit && (
                        <div className="space-y-2 pt-1">
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="font-semibold text-slate-700 block mb-0.5">관할 법원</label>
                              <input
                                type="text"
                                placeholder="예: 서울행정법원"
                                value={addForm.lawsuitCourt}
                                onChange={(e) => setAddForm({ ...addForm, lawsuitCourt: e.target.value })}
                                className="w-full border p-1.5 rounded-lg bg-white"
                              />
                            </div>
                            <div>
                              <label className="font-semibold text-slate-700 block mb-0.5">사건 번호</label>
                              <input
                                type="text"
                                placeholder="예: 2026구합12345"
                                value={addForm.lawsuitCaseNumber}
                                onChange={(e) => setAddForm({ ...addForm, lawsuitCaseNumber: e.target.value })}
                                className="w-full border p-1.5 rounded-lg bg-white"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="font-semibold text-slate-700 block mb-0.5">진행 단계</label>
                              <select
                                value={addForm.lawsuitStatus}
                                onChange={(e) => setAddForm({ ...addForm, lawsuitStatus: e.target.value })}
                                className="w-full border p-1.5 rounded-lg bg-white"
                              >
                                <option value="소 제기(접수)">소 제기(접수)</option>
                                <option value="변론 진행 중">변론 진행 중</option>
                                <option value="집행정지 신청/결정">집행정지 신청/결정</option>
                                <option value="판결 선고">판결 선고</option>
                                <option value="항소/상고 진행">항소/상고 진행</option>
                                <option value="종결">종결</option>
                              </select>
                            </div>
                            <div>
                              <label className="font-semibold text-slate-700 block mb-0.5">담당 변호사/법인</label>
                              <input
                                type="text"
                                placeholder="예: 정부법무공단"
                                value={addForm.lawsuitLawyer}
                                onChange={(e) => setAddForm({ ...addForm, lawsuitLawyer: e.target.value })}
                                className="w-full border p-1.5 rounded-lg bg-white"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="font-semibold text-slate-700 block mb-0.5">소송 결과</label>
                            <input
                              type="text"
                              placeholder="예: 승소 (원고청구기각)"
                              value={addForm.lawsuitResult}
                              onChange={(e) => setAddForm({ ...addForm, lawsuitResult: e.target.value })}
                              className="w-full border p-1.5 rounded-lg bg-white"
                            />
                          </div>

                          <div>
                            <label className="font-semibold text-slate-700 block mb-0.5">소송 주요 내용 메모</label>
                            <input
                              type="text"
                              placeholder="변론 기일, 집행정지 가부, 주요 공방 내용"
                              value={addForm.lawsuitNotes}
                              onChange={(e) => setAddForm({ ...addForm, lawsuitNotes: e.target.value })}
                              className="w-full border p-1.5 rounded-lg bg-white"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="bg-purple-50/80 border border-purple-200 p-3 rounded-xl space-y-2">
                <label className="flex items-center gap-1.5 font-bold text-purple-900">
                  <input
                    type="checkbox"
                    checked={addForm.hasFine}
                    onChange={(e) =>
                      setAddForm({ ...addForm, hasFine: e.target.checked })
                    }
                    className="rounded text-purple-600 focus:ring-purple-500"
                  />
                  과태료 부과 설정
                </label>

                {addForm.hasFine && (
                  <div className="space-y-2 pt-1">
                    <div>
                      <label className="font-semibold text-slate-600 block mb-0.5">
                        과태료 금액 (만원)
                      </label>
                      <input
                        type="text"
                        placeholder="예: 300"
                        value={addForm.fineAmount}
                        onChange={(e) =>
                          setAddForm({ ...addForm, fineAmount: e.target.value })
                        }
                        className="w-full border p-2 rounded-lg bg-white"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-slate-600 block mb-0.5">
                        과태료 처분 사유
                      </label>
                      <input
                        type="text"
                        placeholder="예: 건설기계 조종사 면허 미확인"
                        value={addForm.penaltyReason}
                        onChange={(e) =>
                          setAddForm({ ...addForm, penaltyReason: e.target.value })
                        }
                        className="w-full border p-2 rounded-lg bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="font-semibold text-slate-700 block mb-1">
                  주요 안건 및 비고 메모
                </label>
                <textarea
                  rows={2}
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
                  {isEditing ? "일정 및 처분정보 수정" : "일정 상세정보"}
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
                  <label className="font-semibold text-slate-600 block mb-1">일정 구분</label>
                  <select
                    value={editForm.team}
                    onChange={(e) => setEditForm({ ...editForm, team: e.target.value })}
                    className="w-full border p-2 rounded-lg font-semibold"
                  >
                    <option value="기타일정">기타일정</option>
                    <option value="1조">1조</option>
                    <option value="2조">2조</option>
                    <option value="3조">3조</option>
                    <option value="TF1조">TF1조</option>
                    <option value="TF2조">TF2조</option>
                    <option value="현장점검 결과회의">현장점검 결과회의</option>
                    <option value="의견제출 검토회의">의견제출 검토회의</option>
                    <option value="벌점심의위원회">벌점심의위원회</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-slate-600 block mb-1">일정명 / 회의 제목</label>
                  <input
                    type="text"
                    value={editForm.projectName}
                    onChange={(e) => setEditForm({ ...editForm, projectName: e.target.value })}
                    className="w-full border p-2 rounded-lg"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-600 block mb-1">점검일 / 날짜</label>
                  <input
                    type="date"
                    value={editForm.checkDate}
                    onChange={(e) => setEditForm({ ...editForm, checkDate: e.target.value })}
                    className="w-full border p-2 rounded-lg"
                  />
                </div>

                <div>
                  <label className="font-semibold text-slate-600 block mb-1">장소 / 주소</label>
                  <input
                    type="text"
                    value={editForm.address}
                    onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                    className="w-full border p-2 rounded-lg"
                  />
                </div>

                <div className="bg-rose-50/80 border border-rose-200 p-3.5 rounded-xl space-y-3">
                  <div className="flex items-center justify-between border-b border-rose-200 pb-2">
                    <span className="font-bold text-rose-900 flex items-center gap-1">
                      <AlertTriangle size={15} />
                      벌점 부과 상세 프로세스
                    </span>
                    <label className="flex items-center gap-1.5 font-bold text-rose-700">
                      <input
                        type="checkbox"
                        checked={editForm.hasDemerit}
                        onChange={(e) => setEditForm({ ...editForm, hasDemerit: e.target.checked })}
                        className="rounded text-rose-600 focus:ring-rose-500"
                      />
                      벌점부과 현장
                    </label>
                  </div>

                  {editForm.hasDemerit && (
                    <div className="space-y-2.5 pt-1">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="font-semibold text-slate-700 block mb-0.5">벌점 대상</label>
                          <select
                            value={editForm.demeritTarget || "시공사"}
                            onChange={(e) => setEditForm({ ...editForm, demeritTarget: e.target.value })}
                            className="w-full border p-2 rounded-lg bg-white"
                          >
                            <option value="시공사">시공사</option>
                            <option value="감리사">감리사</option>
                            <option value="시공사 및 감리사">시공사 및 감리사</option>
                          </select>
                        </div>
                        <div>
                          <label className="font-semibold text-slate-700 block mb-0.5">벌점 점수 (점)</label>
                          <input
                            type="text"
                            value={editForm.demeritScore || ""}
                            onChange={(e) => setEditForm({ ...editForm, demeritScore: e.target.value })}
                            className="w-full border p-2 rounded-lg bg-white"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="font-semibold text-slate-700 block mb-0.5">벌점 항목 (지적 분야)</label>
                        <input
                          type="text"
                          value={editForm.demeritItem || ""}
                          onChange={(e) => setEditForm({ ...editForm, demeritItem: e.target.value })}
                          className="w-full border p-2 rounded-lg bg-white"
                        />
                      </div>

                      <div className="space-y-2 pt-1 border-t border-rose-200/60">
                        <span className="font-bold text-rose-800 text-[11px] block">1단계: 사전통지 및 의견제출 결과</span>
                        
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[11px] text-slate-600 block">사전통지일</label>
                            <input
                              type="date"
                              value={editForm.demeritNoticeDate || ""}
                              onChange={(e) => setEditForm({ ...editForm, demeritNoticeDate: e.target.value })}
                              className="w-full border p-1.5 rounded-lg bg-white"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] text-slate-600 block">의견제출 마감일</label>
                            <input
                              type="date"
                              value={editForm.demeritOpinionDeadline || ""}
                              onChange={(e) => setEditForm({ ...editForm, demeritOpinionDeadline: e.target.value })}
                              className="w-full border p-1.5 rounded-lg bg-white"
                            />
                          </div>
                        </div>

                        <div className="bg-white p-2.5 rounded-lg border border-rose-200 space-y-1.5">
                          <label className="font-bold text-rose-900 block text-[11px]">의견제출 검토 결과 선택 *</label>
                          <select
                            value={editForm.opinionResult || "미제출"}
                            onChange={(e) => setEditForm({ ...editForm, opinionResult: e.target.value })}
                            className="w-full border p-1.5 rounded-lg bg-slate-50 font-semibold"
                          >
                            <option value="미제출">의견 미제출 (진행 계속)</option>
                            <option value="불수용">의견 제출 - 불수용 (진행 계속)</option>
                            <option value="수용(종결)">의견 제출 - 수용 (벌점부과 철회/종결)</option>
                          </select>
                        </div>

                        {editForm.opinionResult === "수용(종결)" ? (
                          <div className="bg-emerald-50 text-emerald-800 p-2.5 rounded-lg border border-emerald-200 text-[11px] font-bold flex items-center gap-1.5">
                            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                            의견이 수용되어 절차가 종결되었습니다.
                          </div>
                        ) : (
                          <>
                            <div className="grid grid-cols-2 gap-2 pt-1">
                              <div>
                                <label className="text-[11px] text-slate-600 block">의견검토회의일</label>
                                <input
                                  type="date"
                                  value={editForm.demeritReviewMeetingDate || ""}
                                  onChange={(e) => setEditForm({ ...editForm, demeritReviewMeetingDate: e.target.value })}
                                  className="w-full border p-1.5 rounded-lg bg-white"
                                />
                              </div>
                              <div>
                                <label className="text-[11px] text-slate-600 block">검토결과 통보일</label>
                                <input
                                  type="date"
                                  value={editForm.demeritNoticeResultDate || ""}
                                  onChange={(e) => setEditForm({ ...editForm, demeritNoticeResultDate: e.target.value })}
                                  className="w-full border p-1.5 rounded-lg bg-white"
                                />
                              </div>
                            </div>

                            <div className="space-y-2 pt-2 border-t border-rose-200/60">
                              <span className="font-bold text-rose-800 text-[11px] block">2단계: 이의제기 및 외부심의회</span>
                              
                              <div>
                                <label className="text-[11px] text-slate-600 block mb-0.5">이의제기 마감일</label>
                                <input
                                  type="date"
                                  value={editForm.demeritAppealDeadline || ""}
                                  onChange={(e) => setEditForm({ ...editForm, demeritAppealDeadline: e.target.value })}
                                  className="w-full border p-1.5 rounded-lg bg-white"
                                />
                              </div>

                              <div className="bg-white p-2.5 rounded-lg border border-rose-200 space-y-1.5">
                                <label className="font-bold text-rose-900 block text-[11px]">이의제기 제출 여부 *</label>
                                <div className="flex gap-4">
                                  <label className="flex items-center gap-1 font-semibold text-slate-700">
                                    <input
                                      type="radio"
                                      name="editAppeal"
                                      checked={!editForm.hasAppealSubmitted}
                                      onChange={() => setEditForm({ ...editForm, hasAppealSubmitted: false })}
                                    />
                                    미제출 (벌점 확정 종결)
                                  </label>
                                  <label className="flex items-center gap-1 font-semibold text-purple-800">
                                    <input
                                      type="radio"
                                      name="editAppeal"
                                      checked={editForm.hasAppealSubmitted}
                                      onChange={() => setEditForm({ ...editForm, hasAppealSubmitted: true })}
                                    />
                                    이의제기 제출 (외부심의 진행)
                                  </label>
                                </div>
                              </div>

                              {editForm.hasAppealSubmitted && (
                                <div className="grid grid-cols-2 gap-2 bg-purple-50/60 p-2 rounded-lg border border-purple-100">
                                  <div>
                                    <label className="text-[11px] text-slate-600 block">외부심의회 개최일</label>
                                    <input
                                      type="date"
                                      value={editForm.demeritCommitteeDate || ""}
                                      onChange={(e) => setEditForm({ ...editForm, demeritCommitteeDate: e.target.value })}
                                      className="w-full border p-1.5 rounded-lg bg-white"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[11px] text-slate-600 block">최종결과 통보일</label>
                                    <input
                                      type="date"
                                      value={editForm.demeritFinalResultDate || ""}
                                      onChange={(e) => setEditForm({ ...editForm, demeritFinalResultDate: e.target.value })}
                                      className="w-full border p-1.5 rounded-lg bg-white"
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>

                      <div className="bg-indigo-50/90 border border-indigo-200 p-3 rounded-xl space-y-2 mt-2">
                        <div className="flex items-center justify-between border-b border-indigo-200 pb-1.5">
                          <span className="font-bold text-indigo-950 flex items-center gap-1">
                            <Scale size={15} />
                            행정소송 진행 관리
                          </span>
                          <label className="flex items-center gap-1.5 font-bold text-indigo-800">
                            <input
                              type="checkbox"
                              checked={editForm.hasLawsuit}
                              onChange={(e) => setEditForm({ ...editForm, hasLawsuit: e.target.checked })}
                              className="rounded text-indigo-600 focus:ring-indigo-500"
                            />
                            소송 제기됨
                          </label>
                        </div>

                        {editForm.hasLawsuit && (
                          <div className="space-y-2 pt-1">
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="font-semibold text-slate-700 block mb-0.5">관할 법원</label>
                                <input
                                  type="text"
                                  value={editForm.lawsuitCourt || ""}
                                  onChange={(e) => setEditForm({ ...editForm, lawsuitCourt: e.target.value })}
                                  className="w-full border p-1.5 rounded-lg bg-white"
                                />
                              </div>
                              <div>
                                <label className="font-semibold text-slate-700 block mb-0.5">사건 번호</label>
                                <input
                                  type="text"
                                  value={editForm.lawsuitCaseNumber || ""}
                                  onChange={(e) => setEditForm({ ...editForm, lawsuitCaseNumber: e.target.value })}
                                  className="w-full border p-1.5 rounded-lg bg-white"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="font-semibold text-slate-700 block mb-0.5">진행 단계</label>
                                <select
                                  value={editForm.lawsuitStatus || "소 제기(접수)"}
                                  onChange={(e) => setEditForm({ ...editForm, lawsuitStatus: e.target.value })}
                                  className="w-full border p-1.5 rounded-lg bg-white"
                                >
                                  <option value="소 제기(접수)">소 제기(접수)</option>
                                  <option value="변론 진행 중">변론 진행 중</option>
                                  <option value="집행정지 신청/결정">집행정지 신청/결정</option>
                                  <option value="판결 선고">판결 선고</option>
                                  <option value="항소/상고 진행">항소/상고 진행</option>
                                  <option value="종결">종결</option>
                                </select>
                              </div>
                              <div>
                                <label className="font-semibold text-slate-700 block mb-0.5">담당 변호사/법인</label>
                                <input
                                  type="text"
                                  value={editForm.lawsuitLawyer || ""}
                                  onChange={(e) => setEditForm({ ...editForm, lawsuitLawyer: e.target.value })}
                                  className="w-full border p-1.5 rounded-lg bg-white"
                                />
                              </div>
                            </div>

                            <div>
                              <label className="font-semibold text-slate-700 block mb-0.5">소송 결과</label>
                              <input
                                type="text"
                                value={editForm.lawsuitResult || ""}
                                onChange={(e) => setEditForm({ ...editForm, lawsuitResult: e.target.value })}
                                className="w-full border p-1.5 rounded-lg bg-white"
                              />
                            </div>

                            <div>
                              <label className="font-semibold text-slate-700 block mb-0.5">소송 주요 내용 메모</label>
                              <input
                                type="text"
                                value={editForm.lawsuitNotes || ""}
                                onChange={(e) => setEditForm({ ...editForm, lawsuitNotes: e.target.value })}
                                className="w-full border p-1.5 rounded-lg bg-white"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="bg-purple-50/80 border border-purple-200 p-3 rounded-xl space-y-2">
                  <label className="flex items-center gap-1.5 font-bold text-purple-900">
                    <input
                      type="checkbox"
                      checked={editForm.hasFine}
                      onChange={(e) => setEditForm({ ...editForm, hasFine: e.target.checked })}
                      className="rounded text-purple-600 focus:ring-purple-500"
                    />
                    과태료 부과 설정
                  </label>

                  {editForm.hasFine && (
                    <div className="space-y-2 pt-1">
                      <div>
                        <label className="font-semibold text-slate-600 block mb-0.5">과태료 금액 (만원)</label>
                        <input
                          type="text"
                          value={editForm.fineAmount || ""}
                          onChange={(e) => setEditForm({ ...editForm, fineAmount: e.target.value })}
                          className="w-full border p-2 rounded-lg bg-white"
                        />
                      </div>
                      <div>
                        <label className="font-semibold text-slate-600 block mb-0.5">과태료 처분 사유</label>
                        <input
                          type="text"
                          value={editForm.penaltyReason || ""}
                          onChange={(e) => setEditForm({ ...editForm, penaltyReason: e.target.value })}
                          className="w-full border p-2 rounded-lg bg-white"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="font-semibold text-slate-600 block mb-1">주요 안건 / 비고 메모</label>
                  <textarea
                    rows={3}
                    value={editForm.progressStatus}
                    onChange={(e) => setEditForm({ ...editForm, progressStatus: e.target.value })}
                    className="w-full border p-2 rounded-lg"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4 text-sm">
                {selectedEvent.extendedProps.hasDemerit && (
                  <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl space-y-3">
                    <div className="flex items-center justify-between border-b border-rose-200 pb-2">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="text-rose-600 shrink-0" size={18} />
                        <span className="font-bold text-rose-950 text-xs">벌점 행정 처분 현장</span>
                      </div>
                      <span className="bg-rose-600 text-white text-xs font-black px-2.5 py-0.5 rounded-full">
                        [{selectedEvent.extendedProps.demeritTarget}] {selectedEvent.extendedProps.demeritScore}점
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {selectedEvent.extendedProps.opinionResult === "수용(종결)" ? (
                        <span className="bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2 py-0.5 rounded border border-emerald-200">
                          🟢 의견제출 수용 (벌점부과 철회/종결)
                        </span>
                      ) : !selectedEvent.extendedProps.hasAppealSubmitted ? (
                        <span className="bg-amber-100 text-amber-800 text-[11px] font-bold px-2 py-0.5 rounded border border-amber-200">
                          🟠 이의제기 미제출 (벌점 처분 확정)
                        </span>
                      ) : (
                        <span className="bg-purple-100 text-purple-800 text-[11px] font-bold px-2 py-0.5 rounded border border-purple-200">
                          🟣 외부심의 진행 중
                        </span>
                      )}
                    </div>

                    {selectedEvent.extendedProps.demeritItem && (
                      <div className="text-xs">
                        <span className="font-semibold text-rose-900 block">지적 및 벌점 항목:</span>
                        <p className="text-slate-800 font-medium mt-0.5">{selectedEvent.extendedProps.demeritItem}</p>
                      </div>
                    )}

                    <div className="bg-white/80 p-3 rounded-lg border border-rose-100 text-xs space-y-1.5">
                      <span className="font-bold text-rose-900 block text-[11px] mb-1">📌 행정 처리 단계별 진행 일정:</span>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-slate-700">
                        <div>• 점검일: <span className="font-semibold">{selectedEvent.start}</span></div>
                        <div>• 사전통지일: <span className="font-semibold">{selectedEvent.extendedProps.demeritNoticeDate || "-"}</span></div>
                        <div>• 의견제출 마감일: <span className="font-semibold text-rose-700">{selectedEvent.extendedProps.demeritOpinionDeadline || "-"}</span></div>
                        <div>• 의견검토 결과: <span className="font-bold text-rose-800">{selectedEvent.extendedProps.opinionResult || "미제출"}</span></div>
                        
                        {selectedEvent.extendedProps.opinionResult !== "수용(종결)" && (
                          <>
                            <div>• 검토회의일: <span className="font-semibold">{selectedEvent.extendedProps.demeritReviewMeetingDate || "-"}</span></div>
                            <div>• 검토결과 통보일: <span className="font-semibold">{selectedEvent.extendedProps.demeritNoticeResultDate || "-"}</span></div>
                            <div>• 이의제기 마감일: <span className="font-semibold text-rose-700">{selectedEvent.extendedProps.demeritAppealDeadline || "-"}</span></div>
                            <div>• 이의제기 제출: <span className="font-semibold">{selectedEvent.extendedProps.hasAppealSubmitted ? "제출됨" : "미제출"}</span></div>
                            
                            {selectedEvent.extendedProps.hasAppealSubmitted && (
                              <>
                                <div>• 외부심의회 개최일: <span className="font-semibold text-purple-700">{selectedEvent.extendedProps.demeritCommitteeDate || "-"}</span></div>
                                <div>• 최종결과 통보일: <span className="font-semibold">{selectedEvent.extendedProps.demeritFinalResultDate || "-"}</span></div>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {selectedEvent.extendedProps.hasLawsuit && (
                  <div className="bg-indigo-50 border border-indigo-200 p-4 rounded-xl space-y-2.5">
                    <div className="flex items-center justify-between border-b border-indigo-200 pb-2">
                      <div className="flex items-center gap-2">
                        <Scale className="text-indigo-700 shrink-0" size={18} />
                        <span className="font-bold text-indigo-950 text-xs">행정 소송 진행 현장</span>
                      </div>
                      <span className="bg-indigo-700 text-white text-xs font-bold px-2.5 py-0.5 rounded-full">
                        {selectedEvent.extendedProps.lawsuitStatus}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-800 font-medium">
                      <div>• 관할 법원: <span className="font-bold">{selectedEvent.extendedProps.lawsuitCourt || "-"}</span></div>
                      <div>• 사건 번호: <span className="font-bold text-indigo-700">{selectedEvent.extendedProps.lawsuitCaseNumber || "-"}</span></div>
                      {selectedEvent.extendedProps.lawsuitLawyer && (
                        <div>• 담당 변호인: <span className="font-semibold">{selectedEvent.extendedProps.lawsuitLawyer}</span></div>
                      )}
                      {selectedEvent.extendedProps.lawsuitResult && (
                        <div>• 판결 결과: <span className="font-bold text-rose-600">{selectedEvent.extendedProps.lawsuitResult}</span></div>
                      )}
                    </div>

                    {selectedEvent.extendedProps.lawsuitNotes && (
                      <div className="bg-white/80 p-2.5 rounded-lg border border-indigo-100 text-xs text-slate-700">
                        <span className="font-bold text-indigo-900 block mb-0.5">소송 기일 및 주요 내용:</span>
                        <p className="whitespace-pre-wrap">{selectedEvent.extendedProps.lawsuitNotes}</p>
                      </div>
                    )}
                  </div>
                )}

                {selectedEvent.extendedProps.hasFine && (
                  <div className="bg-purple-50 border border-purple-200 p-3.5 rounded-xl flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-purple-950 block">과태료 부과 현장</span>
                      <span className="text-slate-600 mt-0.5 block">{selectedEvent.extendedProps.penaltyReason || "과태료 부과 대상"}</span>
                    </div>
                    <span className="bg-purple-600 text-white font-black text-xs px-2.5 py-1 rounded-full">
                      {selectedEvent.extendedProps.fineAmount}만원
                    </span>
                  </div>
                )}

                <div className="flex items-start gap-3">
                  <Building className="text-blue-500 shrink-0 mt-0.5" size={18} />
                  <div>
                    <span className="text-xs font-semibold text-slate-400 block">일정명 / 명칭</span>
                    <span className="font-bold text-slate-800 text-base">{selectedEvent.extendedProps.projectName}</span>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Calendar className="text-emerald-500 shrink-0 mt-0.5" size={18} />
                  <div>
                    <span className="text-xs font-semibold text-slate-400 block">날짜</span>
                    <span className="font-bold text-emerald-600">{selectedEvent.start}</span>
                  </div>
                </div>

                {selectedEvent.extendedProps.penaltyReason && (
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                    <span className="font-bold text-slate-700 block mb-1">처분 사유 / 지적 내용</span>
                    <p className="text-rose-700 font-semibold">{selectedEvent.extendedProps.penaltyReason}</p>
                  </div>
                )}

                {selectedEvent.extendedProps.address && (
                  <div className="flex items-start gap-3">
                    <MapPin className="text-rose-500 shrink-0 mt-0.5" size={18} />
                    <div className="w-full">
                      <span className="text-xs font-semibold text-slate-400 block">장소 / 주소</span>
                      <span className="text-slate-700 block mt-0.5 mb-2 font-medium">{selectedEvent.extendedProps.address}</span>

                      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100">
                        <span className="text-[11px] font-semibold text-slate-400 mr-1">길안내:</span>
                        <a
                          href={`https://map.kakao.com/link/search/${encodeURIComponent(selectedEvent.extendedProps.address)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg hover:bg-amber-100 transition"
                        >
                          <Navigation size={11} />
                          카카오맵
                        </a>
                        <a
                          href={`https://map.naver.com/v5/search/${encodeURIComponent(selectedEvent.extendedProps.address)}`}
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

                {(selectedEvent.extendedProps.agentName || selectedEvent.extendedProps.agentPhone) && (
                  <div className="space-y-1.5 bg-blue-50/60 p-3 rounded-xl border border-blue-100">
                    <span className="text-[11px] font-bold text-blue-700 block">담당자 / 연락처</span>
                    <div className="flex items-center gap-4 text-xs text-slate-700">
                      {selectedEvent.extendedProps.agentName && (
                        <span className="flex items-center gap-1 font-semibold">
                          <User size={14} className="text-blue-500" />
                          {selectedEvent.extendedProps.agentName}
                        </span>
                      )}
                      {selectedEvent.extendedProps.agentPhone && (
                        <a
                          href={`tel:${selectedEvent.extendedProps.agentPhone.replace(/[^\d]/g, "")}`}
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
                    <FileText className="text-amber-500 shrink-0 mt-0.5" size={18} />
                    <div className="w-full">
                      <span className="text-xs font-semibold text-slate-400 block">주요 내용 / 비고 메모</span>
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
