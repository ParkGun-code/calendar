import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://hylizcltiyqtnclmwspo.supabase.co";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_dD_I8Rbfc5qcOgbBRbL5qw_4yRK_EYs";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function sanitizeForTable(text: string): string {
  if (!text) return "-";
  return text
    .replace(/\r?\n+/g, "<br/>")
    .replace(/\|/g, "&#124;")
    .trim();
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { base64Data, mimeType } = body;

    if (!base64Data) {
      return NextResponse.json({ error: "이미지 데이터가 전달되지 않았습니다." }, { status: 400 });
    }

    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: "GEMINI_API_KEY 환경변수가 설정되지 않았습니다." }, { status: 500 });
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

    // =========================================================================
    // 1단계: 사진 분석 (결함 바운딩 박스 + DB 검색용 핵심 공종 키워드 추출)
    // =========================================================================
    const visionPrompt = `당신은 건설안전 감리전문가입니다.
사진의 위험 또는 시공상 미흡 부위를 감지하고, 국가건설기준 DB에서 검색할 핵심 단어를 추출하세요.
반드시 아래 JSON 형식으로만 응답하세요:
\`\`\`json
{
  "defects": [
    {
      "box_2d": [ymin, xmin, ymax, xmax],
      "label": "위험 요소 요약 (예: 바닥 개구부 덮개 미흡)"
    }
  ],
  "search_keyword": "개구부",
  "defect_detail": "사진에서 육안 확인된 구체적 결함 현상"
}
\`\`\``;

    const visionRes = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: visionPrompt },
              { inlineData: { mimeType: mimeType || "image/jpeg", data: base64Data } }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          thinkingConfig: { thinkingBudget: 0 }
        }
      })
    });

    if (!visionRes.ok) {
      const errText = await visionRes.text();
      throw new Error(`비전 AI 호출 실패: ${errText}`);
    }

    const visionJson = await visionRes.json();
    const visionRaw = visionJson.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const match = visionRaw.match(/```json\s*([\s\S]*?)\s*```/);
    const parsedVision = match ? JSON.parse(match[1]) : {};

    const defectLabel = parsedVision.defects?.[0]?.label || "현장 미흡 부위";
    const keyword = parsedVision.search_keyword || "개구부";
    const defectDetail = parsedVision.defect_detail || defectLabel;

    // =========================================================================
    // 2단계: Supabase 실제 1,304개 DB에서 키워드로 진짜 시방서 원문 검색
    // =========================================================================
    let matchedStandard: any = null;
    let standardExcerpt = "";

    try {
      // 1순위: 제목(title)에 키워드가 포함된 공인 기준 검색
      let { data: standards } = await supabase
        .from("construction_standards")
        .select("code_number, title, content")
        .ilike("title", `%${keyword}%`)
        .limit(2);

      // 제목 검색 결과가 없으면 본문(content) 검색
      if (!standards || standards.length === 0) {
        const { data: contentStandards } = await supabase
          .from("construction_standards")
          .select("code_number, title, content")
          .ilike("content", `%${keyword}%`)
          .limit(1);
        standards = contentStandards;
      }

      if (standards && standards.length > 0) {
        matchedStandard = standards[0];
        const fullTxt = matchedStandard.content || "";
        
        // 키워드가 위치한 본문 단락 앞뒤 1,000자 발췌
        const kwIdx = fullTxt.indexOf(keyword);
        if (kwIdx !== -1) {
          const start = Math.max(0, kwIdx - 200);
          standardExcerpt = fullTxt.substring(start, start + 1200);
        } else {
          standardExcerpt = fullTxt.substring(0, 1000);
        }
      }
    } catch (dbErr) {
      console.warn("DB 검색 에러:", dbErr);
    }

    // 만약 DB 검색이 전혀 안 잡힌 경우의 안전장치 (가설 추락방지시설)
    const validCode = matchedStandard?.code_number || "KCS 21 60 10";
    const validTitle = matchedStandard?.title || "추락재해방지시설공사";
    const referenceDoc = standardExcerpt || "바닥 개구부에는 덮개를 견고히 고정하고 위험 표시 및 하중한계를 명시하여야 한다.";

    // =========================================================================
    // 3단계: 제공된 '진짜 DB 원문'만을 기반으로 확인서 세부 항목 생성
    // =========================================================================
    const reportPrompt = `당신은 대한민국 국토교통부 수석 감리기술인입니다.
아래 제공된 [실제 국토교통부 시방서 원문]을 바탕으로 현장점검 확인서 항목을 작성하세요.
절대로 원문에 없는 가짜 코드나 조항을 만들지 마십시오.

[지적 사항]: ${defectDetail}
[적용 기준]: ${validCode}${validTitle}
[시방서 실제 원문 발췌]:
${referenceDoc}

반드시 아래 JSON 형식으로만 작성하세요:
\`\`\`json
{
  "clause": "3.X.X (X)항",
  "clause_title": "해당 조항 소제목",
  "clause_rule": "원문에서 발췌한 핵심 설치 규정 요건",
  "risk_analysis": "구조적 및 안전 추락 위험성 분석",
  "action_required": "1. 즉시 조치 내용\\n2. 규정에 따른 견고한 고정 및 표식 조치\\n3. 감리원 재점검 및 관리대장 기록"
}
\`\`\``;

    const reportRes = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: reportPrompt }] }],
        generationConfig: {
          temperature: 0.1,
          thinkingConfig: { thinkingBudget: 0 }
        }
      })
    });

    const reportJson = await reportRes.json();
    const reportRaw = reportJson.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const reportMatch = reportRaw.match(/```json\s*([\s\S]*?)\s*```/);
    const parsedReport = reportMatch ? JSON.parse(reportMatch[1]) : {};

    // =========================================================================
    // 4단계: KCSC 공식 직행 검색 링크 및 최종 확인서 마크다운 생성
    // =========================================================================
    const encCode = encodeURIComponent(validCode);
    const kcscUrl = `https://www.kcsc.re.kr/standardCode/search?searchType=0&kcsc_cd=${encCode}`;

    const standardSection = `• 🔍 **[KCSC 공식 기준검색: '${validCode}' 바로가기 ↗](${kcscUrl})**<br/><br/>• **적용 기준**: ${validCode} ${validTitle}<br/>• **세부 조항**: **${parsedReport.clause || "관련 조항"} ${parsedReport.clause_title || ""}**<br/>• **규정 요건**: ${parsedReport.clause_rule || "안전시설 설치 요건 준수"}`;

    const safeDefectDetail = sanitizeForTable(defectDetail);
    const safeStandard = sanitizeForTable(standardSection);
    const safeRisk = sanitizeForTable(parsedReport.risk_analysis || "추락 및 안전사고 발생 위험");
    const safeAction = sanitizeForTable(parsedReport.action_required || "1. 즉시 개구부 폐쇄 및 덮개 견고 설치\n2. 위험경고 표지 부착\n3. 감리원 검측 완료");

    const formattedReport = `## 📄 건설공사 현장점검 확인서

| 구분 | 점검 내용 |
|---|---|
| **지적 사항 (현장 문제점)** | ${safeDefectDetail} |
| **관련 설계·시방 기준** | ${safeStandard} |
| **위험도 및 원인 분석** | ${safeRisk} |
| **시정 조치 지시사항** | ${safeAction} |`;

    return NextResponse.json({
      defects: parsedVision.defects || [],
      report: formattedReport
    });

  } catch (err: any) {
    console.error("분석 에러:", err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
