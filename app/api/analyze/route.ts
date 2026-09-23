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
    // 1단계: 사진 내 공종 식별, 결함 탐지 및 1,335개 기준 풀에서 가장 적합한 기준 매칭
    // =========================================================================
    const step1Prompt = `당신은 국토교통부 건설안전 최고 특급 감리기술인입니다.
전달받은 건설현장 사진을 객관적으로 정밀 분석하여 다음 작업을 수행하세요.

[수행 지침]:
1. 사진 속 실제 공종(예: 철골공사, 비계공사, 가설흙막이, 콘크리트타설, 토공사, 추락방지 등)과 구체적인 결함 부위를 식별하세요.
2. 결함 부위의 2D 바운딩 박스([ymin, xmin, ymax, xmax], 0~1000 정규화 스케일)를 추출하세요.
3. 대한민국 국가건설기준(KCS 표준시방서 또는 KDS 설계기준) 1,335개 분류체계 중에서, 식별된 현장 결함과 가장 직접적으로 연관된 공식 코드 번호('KCS XX XX XX' 또는 'KDS XX XX XX')와 정식 기준명을 1개 선정하세요.
   (※ 선입견을 갖지 말고 사진에 실제로 보이는 구조물 형태와 위험 요소를 기준으로 객관적으로 판단할 것)

반드시 아래 JSON 형식으로만 응답하십시오:
\`\`\`json
{
  "defects": [
    {
      "box_2d": [ymin, xmin, ymax, xmax],
      "label": "식별된 구체적 결함 명칭"
    }
  ],
  "work_type": "현장 공종 (예: 철골공사, 비계공사, 안전시설 등)",
  "code": "선택한 공식 코드 (예: KCS 14 31 30, KCS 21 60 10, KCS 21 70 10 등)",
  "name": "선택한 공식 기준 정식 명칭",
  "defect_detail": "사진에서 육안으로 확인되는 구조적·안전상 미흡 현상 상세 서술"
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
      const errText = await res1.text();
      if (res1.status === 429) {
        throw new Error("AI 호출 한도(429)에 도달했습니다. 약 1분 후 다시 시도해 주세요.");
      }
      throw new Error(`[1단계 비전 분석 오류] ${res1.status}: ${errText}`);
    }

    const data1 = await res1.json();
    const rawText1 = data1.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const match1 = rawText1.match(/```json\s*([\s\S]*?)\s*```/);
    if (!match1 || !match1[1]) {
      throw new Error("AI가 유효한 분석 데이터를 생성하지 못했습니다. 다시 시도해 주세요.");
    }

    const parsed1 = JSON.parse(match1[1]);
    const targetCode = (parsed1.code || "").trim();
    const targetName = (parsed1.name || "").trim();
    const defectDetail = parsed1.defect_detail || parsed1.defects?.[0]?.label || "현장 결함 확인";

    if (!targetCode) {
      throw new Error("적합한 국가건설기준 코드를 판별하지 못했습니다.");
    }

    // =========================================================================
    // 2단계: Supabase 실제 DB에서 판별된 기준의 원문 본문 조회 (RAG)
    // =========================================================================
    let standardExcerpt = "";
    try {
      const cleanCode = targetCode.replace(/\s+/g, " ");
      const { data: dbData } = await supabase
        .from("construction_standards")
        .select("content, title")
        .ilike("code_number", `%${cleanCode}%`)
        .limit(1);

      if (dbData && dbData.length > 0 && dbData[0].content) {
        const fullContent = dbData[0].content;
        // 시공 본문(3. 시공) 또는 일반사항(1. 일반사항) 위치 탐색
        const startPos = fullContent.search(/(3\.\s*시공|2\.\s*재료|1\.\s*일반사항)/i);
        const searchBase = startPos !== -1 ? fullContent.substring(startPos) : fullContent;
        standardExcerpt = searchBase.substring(0, 4000);
      }
    } catch (dbErr) {
      console.warn("DB 원문 조회 오류:", dbErr);
    }

    // API Rate Limit(429) 방지를 위한 안전 딜레이 (1.2초)
    await new Promise((resolve) => setTimeout(resolve, 1200));

    // =========================================================================
    // 3단계: 조회된 실제 DB 원문만을 참조하여 세부 조항 번호 및 내용 정밀 발췌
    // =========================================================================
    const step2Prompt = `당신은 국토교통부 수석 감리기술인입니다.
아래 제공된 [국토교통부 국가건설기준 실제 원문]을 바탕으로, 식별된 현장 결함과 일치하는 실제 세부 조항 번호와 조항명, 핵심 시공 규정을 정확하게 발췌하세요.
절대로 원문에 없는 가짜 조항 번호나 제목을 지어내지 마십시오(환각 금지). 반드시 제공된 원문 안에서만 찾으세요.

[현장 결함 사항]: ${defectDetail}
[적용 기준]: ${targetCode}${targetName}

[국토교통부 국가건설기준 실제 원문 본문]:
${standardExcerpt || "원문 본문 직접 대조 요망"}

반드시 아래 JSON 형식으로만 응답하십시오:
\`\`\`json
{
  "clause": "원문에 적힌 정확한 조항 번호 (예: 3.X 또는 3.X.X)",
  "clause_title": "원문에 적힌 실제 조항 제목",
  "clause_rule": "원문에서 발췌한 핵심 시공·설치 규정 요건",
  "risk_analysis": "구조적 안전성 및 현장 안전사고 위험도 상세 분석",
  "action_required": "1. 즉시 안전 확보 조치\\n2. 규정에 따른 정밀 보강 및 재시공 사항\\n3. 감리원 검측 확인 및 관리대장 기록"
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

    if (!res2.ok) {
      const errText2 = await res2.text();
      if (res2.status === 429) {
        throw new Error("AI 호출 한도(429)에 도달했습니다. 잠시 후 다시 시도해 주세요.");
      }
      throw new Error(`[2단계 조항 대조 오류] ${res2.status}: ${errText2}`);
    }

    const data2 = await res2.json();
    const rawText2 = data2.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const match2 = rawText2.match(/```json\s*([\s\S]*?)\s*```/);
    const parsed2 = match2 ? JSON.parse(match2[1]) : {};

    // =========================================================================
    // 4단계: KCSC 공식 링크 및 공식 확인서 완성
    // =========================================================================
    const encCode = encodeURIComponent(targetCode);
    const kcscUrl = `https://www.kcsc.re.kr/standardCode/search?searchType=0&kcsc_cd=${encCode}`;

    const clauseDisplay = parsed2.clause 
      ? `${parsed2.clause} ${parsed2.clause_title || ""}` 
      : "관련 세부 조항";

    const standardSection = `• 🔍 **[KCSC 공식 기준검색: '${targetCode}' 바로가기 ↗](${kcscUrl})**<br/><br/>• **적용 기준**: ${targetCode} ${targetName}<br/>• **세부 조항**: **${clauseDisplay}**<br/>• **규정 요건**: ${parsed2.clause_rule || "국가건설기준 설치 규정 준수"}`;

    const safeDefectDetail = sanitizeForTable(defectDetail);
    const safeStandard = sanitizeForTable(standardSection);
    const safeRisk = sanitizeForTable(parsed2.risk_analysis || "안전 및 구조적 위험 우려");
    const safeAction = sanitizeForTable(parsed2.action_required || "1. 작업 중지 및 위험구역 통제\n2. 표준시방서 기준에 따른 보강 조치\n3. 감리원 검측 완료");

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
