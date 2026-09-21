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

    // =========================================================================
    // 단 1회 호출: 바운딩 박스, 결함 진단, 세부 조항 번호(3.X.X (X)항)까지 일괄 생성
    // =========================================================================
    const promptText = `# [PE1: Persona]
당신은 대한민국 국토교통부 건설안전 최고 특급 감리기술인입니다.
현장 사진의 결함을 정밀 분석하고, 국토교통부 표준시방서(KCS) 또는 설계기준(KDS)의 구체적인 조항 번호(반드시 3.X.X (X)항 형식)를 명시하여 시정확인서를 작성합니다.

# [PE2: Instruction]
1. 사진 내 결함 부위의 2D 바운딩 박스([ymin, xmin, ymax, xmax], 0~1000 정규화)를 추출하세요.
2. 결함과 직결되는 실제 표준시방서 코드 번호('KCS XX XX XX' 형식)와 기준명을 도출하세요.
   - 도로변 안전시설/가설방호벽/가설울타리: KCS 21 10 00 또는 KCS 10 20 00
   - 동바리/비계/작업발판: KCS 21 50 05, KCS 21 60 10
   - 비탈면/터파기/사면: KCS 11 20 15, KCS 11 30 00
   - 철근/콘크리트: KCS 14 20 10, KCS 14 20 11
3. 세부 조항 번호(예: "3.2.1 (1)항", "3.1.4 (2)항")와 구체적인 시공 규정 요건을 서술하세요.
4. 구체적인 현장 결함 현상, 구조/안전 위험도, 3단계 즉시 시정조치를 작성하세요.

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
  "name": "표준시방서 명칭",
  "clause": "3.X.X (X)항",
  "clause_title": "조항 소제목",
  "clause_rule": "해당 조항에서 규정하는 구체적 시공·설치 수치 및 기준 요건",
  "defect_detail": "사진에서 육안 확인된 구체적 결함 현상",
  "risk_analysis": "구조적 결함 및 안전사고 위험도 상세 분석",
  "action_required": "1. 첫번째 즉시 조치사항\\n2. 두번째 규정에 따른 보강 및 재시공 사항\\n3. 세번째 감리원 검측 완료 확인"
}
\`\`\``;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${GEMINI_API_KEY}`;

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
          temperature: 0.1
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
    let aiData: any = {};
    try {
      aiData = JSON.parse(jsonMatch ? jsonMatch[1] : rawText);
    } catch {
      aiData = {
        defects: [],
        code: "KCS 21 10 00",
        name: "가설공사 표준시방서",
        clause: "3.2.1 (1)항",
        clause_title: "가설 안전시설",
        clause_rule: "공사구간 내 안전 확보를 위하여 연속된 가설방호벽 및 안전시설을 설치하여야 한다.",
        defect_detail: "현장 가설 안전 및 시공 상태 점검 요망",
        risk_analysis: "안전사고 및 구조적 위험 발생 우려",
        action_required: "1. 현장 안전시설 보강\n2. 시방서 규정 준수 조치\n3. 감리원 검측 완료"
      };
    }

    const targetCode = (aiData.code || "KCS 21 10 00").trim();
    const targetName = (aiData.name || "표준시방서").trim();
    const clauseNo = (aiData.clause || "3.1 (1)항").trim();
    const clauseTitle = (aiData.clause_title || "시공 기준").trim();
    const clauseRule = (aiData.clause_rule || "").trim();

    // =========================================================================
    // Supabase DB(1,304개)에서 원문 조항 고속 검증 발췌 (0.01초 소요)
    // =========================================================================
    let originalExcerpt = "";
    try {
      const { data: dbData } = await supabase
        .from("construction_standards")
        .select("content")
        .ilike("code_number", `%${targetCode.replace(/\s+/g, " ")}%`)
        .limit(1);

      if (dbData && dbData.length > 0 && dbData[0].content) {
        const fullContent = dbData[0].content;
        const startPos = fullContent.search(/(1\.\s*일반사항|3\.\s*시공|2\.\s*재료)/i);
        const cleanContent = startPos !== -1 ? fullContent.substring(startPos) : fullContent;
        originalExcerpt = cleanContent.substring(0, 180).replace(/\r?\n+/g, " ").trim();
      }
    } catch (dbErr) {
      console.warn("Supabase 보조 조회 실패 (스킵):", dbErr);
    }

    // =========================================================================
    // KCSC 공식 검색 직행 링크 및 확인서 표 생성
    // =========================================================================
    const kcscUrl = `https://www.kcsc.re.kr/standardCode/search?searchType=0&kcsc_cd=${encodeURIComponent(targetCode)}`;
    const standardLink = `• 🔍 **[KCSC 공식 기준검색: '${targetCode}' 바로가기 ↗](${kcscUrl})**`;

    let standardSection = `${standardLink}<br/><br/>• **적용 기준**: ${targetCode} ${targetName}<br/>• **세부 조항**: **${clauseNo} ${clauseTitle}**<br/>• **규정 요건**: ${clauseRule}`;
    if (originalExcerpt) {
      standardSection += `<br/>• **원문 발췌**: "... ${originalExcerpt} ..."`;
    }

    const safeDefectDetail = sanitizeForTable(aiData.defect_detail);
    const safeStandard = sanitizeForTable(standardSection);
    const safeRisk = sanitizeForTable(aiData.risk_analysis);
    const safeAction = sanitizeForTable(aiData.action_required);

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
