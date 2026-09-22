import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const GEMINI_API_KEY = process.env.NEXT_PUBLIC_GEMINI_API_KEY || "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://hylizcltiyqtnclmwspo.supabase.co";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "sb_publishable_dD_I8Rbfc5qcOgbBRbL5qw_4yRK_EYs";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 마크다운 표 깨짐 방지용 정제 함수
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

    // =========================================================================
    // 1단계: 단 1회 통합 호출 (바운딩 박스, 실제 결함 분석, 구체적 KCS/KDS 조항 도출)
    // =========================================================================
    const promptText = `# [PE1: Persona]
당신은 대한민국 국토교통부 건설안전 최고 특급 감리기술인입니다.
현장 사진의 결함을 정밀 분석하고, 국토교통부 표준시방서(KCS) 또는 설계기준(KDS)의 구체적인 조항 번호(반드시 '3.X.X (X)항' 형식)를 명시하여 시정확인서를 작성합니다.

# [PE2: Instruction]
1. 사진 내 결함 부위의 2D 바운딩 박스([ymin, xmin, ymax, xmax], 0~1000 정규화 스케일)를 추출하세요.
2. 사진의 결함과 직결되는 실제 표준시방서 코드 번호('KCS XX XX XX' 또는 'KDS XX XX XX' 형식)와 정식 기준명을 명시하세요.
3. 해당 기준의 구체적 조항 번호(예: "3.2.1 (1)항", "3.3.2 (2)항")와 핵심 시공 규정 요건을 서술하세요.
4. 구체적인 현장 결함 현상, 구조적/안전 위험도 분석, 3단계 즉시 시정조치를 객관적으로 작성하세요.

반드시 다음 JSON 형식으로만 응답하십시오:
\`\`\`json
{
  "defects": [
    {
      "box_2d": [ymin, xmin, ymax, xmax],
      "label": "결함 명칭"
    }
  ],
  "code": "KCS XX XX XX",
  "name": "표준시방서 정식 명칭",
  "clause": "3.X.X (X)항",
  "clause_title": "조항 소제목",
  "clause_rule": "해당 조항의 시공·설치 수치 및 핵심 요건",
  "defect_detail": "사진에서 육안 확인된 구체적 결함 현상",
  "risk_analysis": "구조적 결함 및 안전사고 위험도 상세 분석",
  "action_required": "1. 첫번째 즉시 조치사항\\n2. 두번째 규정에 따른 보강 및 재시공 사항\\n3. 세번째 감리원 검측 완료 확인"
}
\`\`\``;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${GEMINI_API_KEY}`;

    // thinkingBudget: 0 설정으로 3~4초 내 고속 응답 유도 (Vercel 10초 타임아웃 방지)
    const geminiRes = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: promptText },
              { inlineData: { mimeType: mimeType || "image/jpeg", data: base64Data } }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 1000,
          thinkingConfig: {
            thinkingBudget: 0
          }
        }
      })
    });

    if (!geminiRes.ok) {
      const errDetail = await geminiRes.text();
      throw new Error(`[Gemini API] ${geminiRes.status}: ${errDetail}`);
    }

    const geminiData = await geminiRes.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

    const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/);
    if (!jsonMatch || !jsonMatch[1]) {
      throw new Error("AI가 표준 규격의 JSON 응답을 생성하지 못했습니다. 다시 시도해 주세요.");
    }

    let aiData: any;
    try {
      aiData = JSON.parse(jsonMatch[1]);
    } catch (parseErr: any) {
      throw new Error(`AI 분석 결과 파싱 실패: ${parseErr.message}`);
    }

    // AI가 판독한 실제 기준 정보 추출 (임의 기본값 일절 배제)
    const targetCode = (aiData.code || "").trim();
    const targetName = (aiData.name || "").trim();
    const clauseNo = (aiData.clause || "").trim();
    const clauseTitle = (aiData.clause_title || "").trim();
    const clauseRule = (aiData.clause_rule || "").trim();

    // =========================================================================
    // 2단계: Supabase 적재 데이터(1,304개)에서 실제 시방서 원문 즉시 대조 및 발췌
    // =========================================================================
    let originalExcerpt = "";
    if (targetCode) {
      try {
        const cleanCode = targetCode.replace(/\s+/g, " ");
        const { data: dbData } = await supabase
          .from("construction_standards")
          .select("title, content")
          .ilike("code_number", `%${cleanCode}%`)
          .limit(1);

        if (dbData && dbData.length > 0 && dbData[0].content) {
          const fullContent = dbData[0].content;
          // 서지정보(헤더) 스킵하고 본문 시작부(1. 일반사항 또는 3. 시공)부터 발췌
          const startPos = fullContent.search(/(1\.\s*일반사항|3\.\s*시공|2\.\s*재료)/i);
          const cleanContent = startPos !== -1 ? fullContent.substring(startPos) : fullContent;
          originalExcerpt = cleanContent.substring(0, 200).replace(/\r?\n+/g, " ").trim();
        }
      } catch (dbErr) {
        console.warn("Supabase 원문 조회 스킵:", dbErr);
      }
    }

    // =========================================================================
    // 3단계: KCSC 공식 직행 검색 링크 및 확인서 마크다운 표 생성
    // =========================================================================
    const encCode = encodeURIComponent(targetCode);
    const kcscUrl = `https://www.kcsc.re.kr/standardCode/search?searchType=0&kcsc_cd=${encCode}`;
    const standardLink = targetCode 
      ? `• 🔍 **[KCSC 공식 기준검색: '${targetCode}' 바로가기 ↗](${kcscUrl})**`
      : "";

    let standardSection = standardLink 
      ? `${standardLink}<br/><br/>• **적용 기준**: ${targetCode} ${targetName}<br/>• **세부 조항**: **${clauseNo} ${clauseTitle}**<br/>• **규정 요건**: ${clauseRule}`
      : `• **적용 기준**: ${targetName || "국토교통부 표준시방서"}<br/>• **세부 조항**: **${clauseNo} ${clauseTitle}**<br/>• **규정 요건**: ${clauseRule}`;

    if (originalExcerpt) {
      standardSection += `<br/>• **DB 원문 발췌**: "... ${originalExcerpt} ..."`;
    }

    const safeDefectDetail = sanitizeForTable(aiData.defect_detail || "현장 결함 식별 완료");
    const safeStandard = sanitizeForTable(standardSection);
    const safeRisk = sanitizeForTable(aiData.risk_analysis || "안전 및 품질 저하 위험 우려");
    const safeAction = sanitizeForTable(aiData.action_required || "현장 시공사 즉시 시정 요망");

    const formattedReport = `## 📄 건설공사 현장점검 확인서

| 구분 | 점검 내용 |
|---|---|
| **지적 사항 (현장 문제점)** | ${safeDefectDetail} |
| **관련 설계·시방 기준** | ${safeStandard} |
| **위험도 및 원인 분석** | ${safeRisk} |
| **시정 조치 지시사항** | ${safeAction} |`;

    return NextResponse.json({
      defects: aiData.defects || [],
      report: formattedReport
    });

  } catch (err: any) {
    console.error("분석 에러:", err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
