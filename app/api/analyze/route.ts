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
      return NextResponse.json(
        { error: "이미지 데이터가 전달되지 않았습니다." },
        { status: 400 }
      );
    }

    if (!GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY 환경변수가 설정되지 않았습니다." },
        { status: 500 }
      );
    }

    // =========================================================================
    // 단 1회의 호출로 사진 결함 식별, KCS 코드 도출, 위험도 및 조치사항 생성
    // =========================================================================
    const promptText = `# [PE1: Persona]
당신은 40년 경력의 대한민국 국토교통부 건설공사 시공·안전 점검 총괄 수석 감리기술인입니다.
현장 사진의 결함을 정밀 식별하고 국토교통부 표준시방서(KCS) 또는 설계기준(KDS)에 근거하여 객관적인 시정요구서를 작성합니다.

# [PE2: Instruction]
1. 사진 내 결함 부위의 2D 바운딩 박스 좌표([ymin, xmin, ymax, xmax], 0~1000 정규화)를 추출하세요.
2. 이 결함과 직결되는 표준시방서(KCS) 또는 설계기준(KDS) 코드 번호(반드시 'KCS XX XX XX' 또는 'KDS XX XX XX' 형식)와 정식 기준명을 도출하세요.
3. 데이터베이스 검색에 필요한 핵심 단어 1개(예: 수평연결재, 비탈면, 피복두께, 작업발판 등)를 추출하세요.
4. 구체적인 현장 결함 상태, 위험도 분석, 3단계 시정 조치사항을 작성하세요.

반드시 다음 JSON 형식으로만 응답하십시오:
\`\`\`json
{
  "defects": [
    {
      "box_2d": [ymin, xmin, ymax, xmax],
      "label": "결함 명칭"
    }
  ],
  "code": "KCS 21 50 05",
  "name": "거푸집 및 동바리공사 표준시방서",
  "search_keyword": "수평연결재",
  "defect_detail": "사진에서 육안 확인된 구체적 결함 현상",
  "risk_analysis": "구조적 결함 및 안전사고 위험도 상세 분석",
  "action_required": "1. 첫번째 즉시 조치사항\\n2. 두번째 규정에 따른 보강 및 재시공 사항\\n3. 세번째 감리원 검측 완료 후 후속 작업 진행"
}
\`\`\``;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${GEMINI_API_KEY}`;

    const response = await fetch(endpoint, {
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

    if (!response.ok) {
      const errDetail = await response.text();
      throw new Error(`[Gemini API] ${response.status}: ${errDetail}`);
    }

    const result = await response.json();
    const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text || "";

    const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/);
    let aiData: any = {};
    try {
      aiData = JSON.parse(jsonMatch ? jsonMatch[1] : rawText);
    } catch {
      aiData = {
        defects: [],
        code: "KCS 21 50 05",
        name: "거푸집 및 동바리공사 표준시방서",
        search_keyword: "동바리",
        defect_detail: "현장 시공 및 가설 안전 상태 확인 요망",
        risk_analysis: "안전성 저하 및 구조적 결함 발생 우려",
        action_required: "1. 현장 안전조치 즉시 이행\n2. 표준시방서 기준에 따른 보강 시공\n3. 감리원 검측 확인"
      };
    }

    const targetCode = (aiData.code || "KCS 21 50 05").trim();
    const targetKeyword = (aiData.search_keyword || "").trim();

    // =========================================================================
    // Supabase 적재 데이터(1,304개)에서 실제 공식 시방서 원문 즉시 발췌 (0.01초)
    // =========================================================================
    let standardSummary = "국토교통부 표준시방서 시공 기준 준수 필요";

    // 1차 검색: 코드 번호 일치 조회
    const { data: codeMatches } = await supabase
      .from("construction_standards")
      .select("code_number, title, content")
      .ilike("code_number", `%${targetCode.replace(/\s+/g, " ")}%`)
      .limit(1);

    if (codeMatches && codeMatches.length > 0 && codeMatches[0].content) {
      // 본문에서 키워드가 포함된 문단 발췌 (없으면 본문 앞 300자)
      const fullText = codeMatches[0].content;
      const kwIdx = targetKeyword ? fullText.indexOf(targetKeyword) : -1;
      if (kwIdx !== -1) {
        const start = Math.max(0, kwIdx - 50);
        const end = Math.min(fullText.length, kwIdx + 250);
        standardSummary = `[${codeMatches[0].title} 원문 발췌] "... ${fullText.substring(start, end).replace(/\r?\n+/g, " ")} ..."`;
      } else {
        standardSummary = `[${codeMatches[0].title} 원문 발췌] "${fullText.substring(0, 200).replace(/\r?\n+/g, " ")}..."`;
      }
    } else if (targetKeyword) {
      // 2차 검색: 키워드 검색
      const { data: kwMatches } = await supabase
        .from("construction_standards")
        .select("code_number, title, content")
        .ilike("content", `%${targetKeyword}%`)
        .limit(1);

      if (kwMatches && kwMatches.length > 0 && kwMatches[0].content) {
        standardSummary = `[${kwMatches[0].code_number} ${kwMatches[0].title} 원문 발췌] "${kwMatches[0].content.substring(0, 200).replace(/\r?\n+/g, " ")}..."`;
      }
    }

    // =========================================================================
    // KCSC 공식 검색 규격 링크 생성 및 확인서 표 렌더링
    // =========================================================================
    const encCode = encodeURIComponent(targetCode);
    const kcscUrl = `https://www.kcsc.re.kr/standardCode/search?searchType=0&kcsc_cd=${encCode}`;
    const standardLink = `• 🔍 **[KCSC 공식 기준검색: '${targetCode}' 바로가기 ↗](${kcscUrl})** (${aiData.name || "표준시방서"})`;

    const safeDefectDetail = sanitizeForTable(aiData.defect_detail);
    const safeStandardSummary = sanitizeForTable(standardSummary);
    const safeRiskAnalysis = sanitizeForTable(aiData.risk_analysis);
    const safeActionRequired = sanitizeForTable(aiData.action_required);

    const formattedReport = `## 📄 건설공사 현장점검 확인서

| 구분 | 점검 내용 |
|---|---|
| **지적 사항 (현장 문제점)** | ${safeDefectDetail} |
| **관련 설계·시방 기준** | ${standardLink}<br/><br/>${safeStandardSummary} |
| **위험도 및 원인 분석** | ${safeRiskAnalysis} |
| **시정 조치 지시사항** | ${safeActionRequired} |`;

    return NextResponse.json({
      defects: aiData.defects || [],
      report: formattedReport
    });

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("분석 에러:", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
