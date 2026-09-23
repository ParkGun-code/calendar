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

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${GEMINI_API_KEY}`;

    // =========================================================================
    // 1단계: 사진 분석 (결함 위치 감지 + 공인 기준 코드 매칭)
    // =========================================================================
    const step1Prompt = `당신은 대한민국 국토교통부 최고 특급 감리기술인입니다.
현장 사진의 안전 위험 및 시공 결함을 정밀 분석하고, 반드시 공인 건설기준 목록에서 일치하는 코드와 명칭을 1개 지정하세요.

[필수 분류 규칙]:
- 바닥 개구부 덮개 미흡 / 안전난간 / 추락방호망 -> "KCS 21 70 10" (추락재해 방지시설)
- 시스템 비계 / 강관 비계 / 비계 연결부 -> "KCS 21 60 10" (비계)
- 작업발판 / 통로 -> "KCS 21 60 15" (작업발판 및 통로)
- 동바리 / 거푸집 -> "KCS 21 50 05" (거푸집 및 동바리공사 일반사항)
- 콘크리트 타설 / 균열 -> "KCS 14 20 10" (일반콘크리트)
- 철근 배근 / 피복두께 -> "KCS 14 20 11" (철근공사)

반드시 아래 JSON 형식으로만 응답하십시오:
\`\`\`json
{
  "defects": [
    {
      "box_2d": [ymin, xmin, ymax, xmax],
      "label": "결함 명칭 (예: 바닥 개구부 덮개 시공 미흡 및 추락 위험)"
    }
  ],
  "code": "KCS 21 70 10",
  "name": "추락재해 방지시설",
  "defect_detail": "사진에서 육안 확인된 구체적 결함 현상"
}
\`\`\``;

    const res1 = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: step1Prompt },
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

    if (!res1.ok) {
      throw new Error(`[Step 1 AI] ${res1.status}: ${await res1.text()}`);
    }

    const data1 = await res1.json();
    const rawText1 = data1.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const match1 = rawText1.match(/```json\s*([\s\S]*?)\s*```/);
    const parsed1 = match1 ? JSON.parse(match1[1]) : {};

    const targetCode = (parsed1.code || "KCS 21 70 10").trim();
    const targetName = (parsed1.name || "추락재해 방지시설").trim();
    const defectDetail = parsed1.defect_detail || "현장 안전조치 미흡";

    // =========================================================================
    // 2단계: ★ 핵심! AI가 조항을 상상하기 전에 Supabase DB에서 실제 '3. 시공' 원문 추출
    // =========================================================================
    let standardExcerpt = "";
    try {
      const cleanCode = targetCode.replace(/\s+/g, " ");
      const { data: dbData } = await supabase
        .from("construction_standards")
        .select("content")
        .ilike("code_number", `%${cleanCode}%`)
        .limit(1);

      if (dbData && dbData.length > 0 && dbData[0].content) {
        const fullContent = dbData[0].content;
        const pos = fullContent.indexOf("3. 시공");
        standardExcerpt = pos !== -1 ? fullContent.substring(pos, pos + 4000) : fullContent.substring(0, 4000);
      }
    } catch (dbErr) {
      console.warn("DB 원문 조회 오류:", dbErr);
    }

    // =========================================================================
    // 3단계: 제공된 '진짜 DB 시공 본문'을 읽고 실제 조항 번호와 내용 발췌
    // =========================================================================
    const step2Prompt = `당신은 국토교통부 수석 감리기술인입니다.
아래 제공된 [국토교통부 표준시방서 실제 원문]을 바탕으로, 해당 결함과 일치하는 실제 조항 번호와 제목, 규정 요건을 정확히 추출하여 시정확인서를 작성하세요.
절대로 원문에 없는 가짜 조항 번호(예: 3.2.1 등)를 지어내지 마십시오! 반드시 제공된 원문 본문에 존재하는 실제 번호(예: 3.3, 3.3.1 등)를 기재해야 합니다.

[현장 결함]: ${defectDetail}
[적용 기준]: ${targetCode}${targetName}

[국토교통부 표준시방서 실제 원문]:
${standardExcerpt || "3. 시공 본문 참조"}

반드시 다음 JSON 형식으로만 응답하십시오:
\`\`\`json
{
  "clause": "원문에 적힌 정확한 조항 번호 (예: 3.3 또는 3.3.1)",
  "clause_title": "원문에 적힌 실제 조항 소제목",
  "clause_rule": "원문에서 발췌한 핵심 설치 및 고정 규정 요건",
  "risk_analysis": "구조적 및 안전 추락 위험성 분석",
  "action_required": "1. 첫번째 즉시 조치사항\\n2. 두번째 규정에 따른 보강 및 재시공 사항\\n3. 세번째 감리원 검측 완료 확인"
}
\`\`\``;

    const res2 = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: step2Prompt }] }],
        generationConfig: {
          temperature: 0.1,
          thinkingConfig: { thinkingBudget: 0 }
        }
      })
    });

    const data2 = await res2.json();
    const rawText2 = data2.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const match2 = rawText2.match(/```json\s*([\s\S]*?)\s*```/);
    const parsed2 = match2 ? JSON.parse(match2[1]) : {};

    // =========================================================================
    // 4단계: KCSC 공식 직행 검색 링크 및 확인서 마크다운 생성
    // =========================================================================
    const encCode = encodeURIComponent(targetCode);
    const kcscUrl = `https://www.kcsc.re.kr/standardCode/search?searchType=0&kcsc_cd=${encCode}`;

    const clauseDisplay = parsed2.clause ? `${parsed2.clause} ${parsed2.clause_title || ""}` : "관련 시공 조항";
    const standardSection = `• 🔍 **[KCSC 공식 기준검색: '${targetCode}' 바로가기 ↗](${kcscUrl})**<br/><br/>• **적용 기준**: ${targetCode} ${targetName}<br/>• **세부 조항**: **${clauseDisplay}**<br/>• **규정 요건**: ${parsed2.clause_rule || "시방서 설치 규정 준수"}`;

    const safeDefectDetail = sanitizeForTable(defectDetail);
    const safeStandard = sanitizeForTable(standardSection);
    const safeRisk = sanitizeForTable(parsed2.risk_analysis || "안전사고 위험 우려");
    const safeAction = sanitizeForTable(parsed2.action_required || "1. 개구부 덮개 즉시 설치\n2. 위험 경고 표지 부착\n3. 감리원 검측 완료");

    const formattedReport = `## 📄 건설공사 현장점검 확인서

| 구분 | 점검 내용 |
|---|---|
| **지적 사항 (현장 문제점)** | ${safeDefectDetail} |
| **관련 설계·시방 기준** | ${safeStandard} |
| **위험도 및 원인 분석** | ${safeRisk} |
| **시정 조치 지시사항** | ${safeAction} |`;

    return NextResponse.json({
      defects: parsed1.defects || [],
      report: formattedReport
    });

  } catch (err: any) {
    console.error("분석 에러:", err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
