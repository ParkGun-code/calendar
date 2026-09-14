"use client";

import React, { useState, useEffect } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import { createClient } from "@supabase/supabase-js";
import { marked } from "marked";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://hylizcltiyqtnclmwspo.supabase.co";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_dD_I8Rbfc5qcOgbBRbL5qw_4yRK_EYs";
const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const GROUP_COLORS: { [key: string]: string } = {
  "1조": "#60A5FA",
  "2조": "#34D399",
  "3조": "#FBBF24",
  "TF1조": "#A78BFA",
  "TF2조": "#F472B6"
};

export default function Page() {
  const [events, setEvents] = useState<any[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<"detail" | "ai_check">("detail");

  // AI 분석 관련 상태
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [base64Data, setBase64Data] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState("");

  const fetchEvents = async () => {
    try {
      const { data, error } = await supabase.from("events").select("*");
      if (error) throw error;
      if (data) {
        const formatted = data.map((item: any) => ({
          id: String(item.id),
          title: item.title || `[${item.team || '1조'}] ${item.location || '현장점검'}`,
          start: item.start_date,
          backgroundColor: item.bg_color || GROUP_COLORS[item.team] || "#60A5FA",
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

  const handleEventClick = (info: any) => {
    setSelectedEvent(info.event.extendedProps);
    setActiveTab("detail");
    setPreviewUrl(null);
    setBase64Data(null);
    setMimeType(null);
    setAiResult("");
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setMimeType(file.type);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const res = evt.target?.result as string;
      setBase64Data(res.split(",")[1]);
      setPreviewUrl(res);
      setAiResult("");
    };
    reader.readAsDataURL(file);
  };

  const runAiAnalysis = async () => {
    if (!base64Data || !mimeType) {
      alert("분석할 현장 점검 사진을 먼저 선택해 주세요.");
      return;
    }

    if (!GEMINI_API_KEY) {
      alert("NEXT_PUBLIC_GEMINI_API_KEY 환경변수가 확인되지 않습니다.");
      return;
    }

    setAiAnalyzing(true);
    setAiResult("");

    const promptText = `당신은 대한민국 국토교통부 건설안전·품질 점검관입니다.
첨부된 현장 점검 사진을 분석하여 발견되는 시공 불량, 안전 취약 부위를 지적하고 관련 공식 기준을 제시하십시오.

[절대 준수 지침 - 원문 인용 및 환각 방지]
1. 적용 기준 엄격 제한:
   - 오직 대한민국 '국토교통부' 소관 법령 및 기준만 적용하십시오.
   - 대상: 표준시방서(KCS), 설계기준(KDS), 건설기술 진흥법(법률, 시행령, 시행규칙).
   - 타 부처 소관 법령(고용노동부 '산업안전보건법', '산업안전보건기준에 관한 규칙' 등)은 일절 인용하거나 언급하지 마십시오.
2. 조항 번호 및 원문 직인용 원칙:
   - 관련 기준은 반드시 공식 코드 번호, 장·절 번호, 조항 번호(예: KCS 14 31 25 제3장 3.4.2 등)를 명기하십시오.
   - 기준 내용은 요약하거나 추상화하지 말고, 고시된 공식 원문 문장 형태를 인용구(>) 안에 있는 그대로 제시하십시오.
3. 허위/추측 작성 금지 (Zero Hallucination):
   - 실제 존재하지 않는 코드 번호나 임의로 꾸며낸 규정 문장을 절대로 작성하지 마십시오.
   - 코드 번호나 정확한 원문 문구가 완벽히 확실하지 않은 경우에는 "추가 확인 필요"라고 기재하고 억지로 조항 번호를 지어내지 마십시오.

[작성 양식]
아래 순서와 형식에 맞추어 명확하게 작성하십시오:
1. 현장 사진 결함 및 문제점 분석
   - 시공 불량 상태, 부재 접합 상태, 규격 미달 사항 등을 항목별로 구체적으로 기술
2. 국토교통부 소관 관련 기준 및 법령 원문
   - **표준시방서(KCS)**: 코드 번호, 조항 명칭 및 공식 규정 원문 인용
   - **설계기준(KDS)**: 코드 번호, 조항 명칭 및 공식 규정 원문 인용
   - **건설기술 진흥법령**: 조항 번호(법·영·규칙 구분) 및 규정 원문 인용
3. 현장 시정 조치 지시사항
   - 시공사(현장대리인) 및 감리원에게 요구할 보수·보강·재시공 등의 기술적 조치사항`;

    const payload = {
      contents: [{
        role: "user",
        parts: [
          { text: promptText },
          { inlineData: { mimeType, data: base64Data } }
        ]
      }],
      generationConfig: {
        temperature: 0.0
      }
    };

    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errDetail = await response.text();
        throw new Error(`API 에러 (${response.status}): ${errDetail}`);
      }

      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text || "분석 결과를 가져올 수 없습니다.";
      setAiResult(text);
    } catch (err: any) {
      console.error(err);
      alert(`분석 실패: ${err.message}`);
    } finally {
      setAiAnalyzing(false);
    }
  };

  const handleDelete = async (id: any) => {
    if (!confirm("이 일정을 삭제하시겠습니까?")) return;
    try {
      await supabase.from("events").delete().eq("id", id);
      setSelectedEvent(null);
      fetchEvents();
      alert("삭제되었습니다.");
    } catch (e: any) {
      alert("삭제 실패: " + e.message);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 p-2 md:p-6 font-sans">
      <div className="max-w-7xl mx-auto bg-white rounded-xl shadow p-4 border border-slate-200">
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

      {/* 일정 상세 & AI 대조 모달 */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-slate-200 flex flex-col">
            
            {/* Header */}
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
              <div className="flex items-center gap-2">
                <span className="bg-amber-400 text-slate-900 text-xs font-bold px-2.5 py-0.5 rounded-full">
                  {selectedEvent.team || "3조"}
                </span>
                <h3 className="font-bold text-slate-800 text-base">일정 상세정보</h3>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
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
                <span className="bg-amber-400 text-slate-900 text-[10px] px-1 py-0.2 rounded font-extrabold">국토부 기준</span>
              </button>
            </div>

            {/* Body */}
            <div className="p-5 flex-1">
              {activeTab === "detail" ? (
                /* 기존 상세정보 레이아웃 100% 동일 */
                <div className="space-y-4 text-xs text-slate-700">
                  <div>
                    <div className="text-slate-400 font-semibold mb-0.5 flex items-center gap-1">
                      🏢 일정명 / 명칭
                    </div>
                    <div className="text-sm font-bold text-slate-800">
                      {selectedEvent.location || selectedEvent.title || "갑산소하천 정비사업"}
                    </div>
                  </div>

                  <div>
                    <div className="text-slate-400 font-semibold mb-0.5 flex items-center gap-1">
                      📅 날짜
                    </div>
                    <div className="font-bold text-emerald-600">
                      {selectedEvent.start_date || "-"}
                    </div>
                  </div>

                  <div>
                    <div className="text-slate-400 font-semibold mb-0.5 flex items-center gap-1">
                      📍 장소 / 주소
                    </div>
                    <div className="font-medium text-slate-800 leading-relaxed mb-2">
                      {selectedEvent.address || "주소 정보 없음"}
                    </div>
                    {selectedEvent.address && (
                      <div className="flex items-center gap-1.5">
                        <span className="text-slate-400 text-[11px]">길안내:</span>
                        <a
                          href={`https://map.kakao.com/link/search/${encodeURIComponent(selectedEvent.address)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded text-[11px] font-bold hover:bg-amber-100"
                        >
                          카카오맵
                        </a>
                        <a
                          href={`https://map.naver.com/v5/search/${encodeURIComponent(selectedEvent.address)}`}
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
                      <div className="font-bold text-slate-800">{selectedEvent.members || "효인주식회사"}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 font-semibold mb-0.5">감리사</div>
                      <div className="font-bold text-slate-800">{selectedEvent.supervisor || selectedEvent.client || "음성군청"}</div>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <div className="text-slate-400 font-semibold mb-0.5">담당자 / 연락처</div>
                    <div className="text-slate-800 font-medium flex items-center gap-2">
                      <span>👤 {selectedEvent.agent_name || "담당자"}</span>
                      {selectedEvent.agent_phone && (
                        <a href={`tel:${selectedEvent.agent_phone}`} className="text-blue-600 font-semibold hover:underline">
                          📞 {selectedEvent.agent_phone} (전화연결)
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <div className="text-slate-400 font-semibold mb-1 flex items-center gap-1">
                      📄 주요 내용 / 비고 메모
                    </div>
                    <p className="text-slate-700 whitespace-pre-line leading-relaxed">
                      {selectedEvent.notes || "등록된 메모가 없습니다."}
                    </p>
                  </div>
                </div>
              ) : (
                /* AI 사진 정밀 대조 뷰 */
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

                    <div className="flex items-center justify-center border-2 border-dashed border-slate-300 rounded-lg p-2 bg-white min-h-[140px]">
                      {previewUrl ? (
                        <img src={previewUrl} alt="현장사진" className="max-h-44 object-contain rounded" />
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
                      {aiAnalyzing ? "국토부 기준 조항 대조 중..." : "국토부 기준 원문 대조 분석 실행"}
                    </button>
                  </div>

                  <div className="border border-slate-200 rounded-xl p-4 bg-white shadow-sm min-h-[200px]">
                    <div className="border-b border-slate-100 pb-2 mb-2.5 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">📋 국토교통부 공식 기준 대조 결과</span>
                      {aiAnalyzing && (
                        <span className="text-[10px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded animate-pulse">
                          KCS·KDS·건진법 검색 중...
                        </span>
                      )}
                    </div>
                    {aiResult ? (
                      <div
                        className="text-xs text-slate-800 leading-relaxed space-y-2 [&>h1]:text-sm [&>h1]:font-bold [&>h1]:text-blue-900 [&>h2]:text-xs [&>h2]:font-bold [&>h2]:text-blue-800 [&>ul]:list-disc [&>ul]:pl-4 [&>ol]:list-decimal [&>ol]:pl-4 [&>blockquote]:border-l-4 [&>blockquote]:border-blue-500 [&>blockquote]:pl-2 [&>blockquote]:bg-slate-50 [&>blockquote]:py-1 [&>strong]:text-blue-900"
                        dangerouslySetInnerHTML={{ __html: marked.parse(aiResult) }}
                      />
                    ) : (
                      <p className="text-xs text-slate-400 text-center py-8">
                        현장 사진을 올린 후 분석 실행 버튼을 누르면<br />
                        KCS, KDS, 건설기술 진흥법 조항 번호와 원문이 출력됩니다.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
              {activeTab === "detail" ? (
                <>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => alert("수정 모드는 캘린더 컴포넌트에서 지원됩니다.")}
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
                  onClick={() => setSelectedEvent(null)}
                  className="w-full py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold"
                >
                  닫기
                </button>
              )}
            </div>

          </div>
        </div>
      )}
    </main>
  );
}
