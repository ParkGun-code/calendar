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
    // [Step 1] Vision AI: 사진 속 결함 식별(바운딩 박스) 및 기준 검색 키워드 도출
    // =========================================================================
    const visionPrompt = `# [PE1: Persona]
당신은 대한민국 국토교통부 건설공사 시공·안전 점검 총괄 수석 감리기술인입니다.
현장 사진을 정밀 분석하여 결함의 시각적 위치와 Supabase DB에서 조회할 기준 코드/키워드를 추출합니다.

# [PE2: Instruction]
1. 사진 내 결함 부위의 2D 바운딩 박스 좌표([ymin, xmin, ymax, xmax], 0~1000 정규화)를 추출하세요.
2. 이 결함과 직결되는 표준시방서(KCS) 또는 설계기준(KDS) 코드 번호(예: "KCS 21 50 05", "KCS 11 30 00", "KCS 14 20 10")를 도출하세요.
3. 데이터베이스 본문 검색에 사용할 핵심 단어 1~2개(예: "수평연결재", "비탈면", "피복두께", "작업발판")를 뽑으세요.
4. 현장에서 육안으로 확인된 결함 상태를 구체적으로 1~2문장으로 요약하세요.

반드시 아래 JSON 포맷으로만 응답하세요:
\`\`\`json
{
  "defects": [
    {
      "box_2d": [ymin, xmin, ymax, xmax],
      "label": "결함 명칭"
    }
  ],
  "search_code": "KCS 21 50 05",
  "search_keyword": "수평연결재",
  "defect_detail": "현장에서 확인된 구체적 결함 현상"
}
\`\`\``;

    // 원래 구동되던 모델(gemini-3.6-flash)로 복구
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${GEMINI_API_KEY}`;

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
          temperature: 0.1
        }
      })
    });

    if (!visionRes.ok) {
      const errDetail = await visionRes.text();
      throw new Error(`[Gemini Vision API] ${visionRes.status}: ${errDetail}`);
    }

    const visionResult = await visionRes.json();
    const rawVisionText = visionResult.candidates?.[0]?.content?.parts?.[0]?.text || "";

    const jsonMatch = rawVisionText.match(/```json\s*([\s\S]*?)\s*```/);
    let parsedVision: any = {};
    try {
      parsedVision = JSON.parse(jsonMatch ? jsonMatch[1] : rawVisionText);
    } catch {
      parsedVision = {
        defects: [],
        search_code: "KCS 21 50 05",
        search_keyword: "가설",
        defect_detail: "현장 시공 및 가설 안전 상태 확인 요망"
      };
    }

    const defects = parsedVision.defects || [];
    const searchCode = (parsedVision.search_code || "KCS 21 50 05").trim();
    const searchKeyword = (parsedVision.search_keyword || "시공").trim();
    const defectDetail = parsedVision.defect_detail || "현장 시공 상태 결함 식별";

    // =========================================================================
    // [Step 2] RAG: Supabase construction_standards 테이블에서 공식 원문 텍스트 조회
    // =========================================================================
    let matchedStandard: { code_number: string; title: string; content: string } | null = null;

    // 1차 검색: 코드 번호 일치 검색
    const codeClean = searchCode.replace(/\s+/g, " ").trim();
    const { data: codeMatches } = await supabase
      .from("construction_standards")
      .select("code_number, title, content")
      .ilike("code_number", `%${codeClean}%`)
      .limit(1);

    if (codeMatches && codeMatches.length > 0) {
      matchedStandard = codeMatches[0];
    } else {
      // 2차 검색: 키워드로 본문 검색
      const { data: keywordMatches } = await supabase
        .from("construction_standards")
        .select("code_number, title, content")
        .ilike("content", `%${searchKeyword}%`)
        .limit(1);

      if (keywordMatches && keywordMatches.length > 0) {
        matchedStandard = keywordMatches[0];
      }
    }

    const officialCode = matchedStandard?.code_number || searchCode;
    const officialTitle = matchedStandard?.title || "표준시방서 기준";
    const officialContent = matchedStandard?.content
      ? matchedStandard.content.substring(0, 2500)
      : "국토교통부 건설공사 표준시방서 및 설계기준 규정을 준수하여 시공하여야 한다.";

    // =========================================================================
    // [Step 3] AI 확인서 작성기: Supabase 공식 원문 팩트에 기반한 시정요구서 생성
    // =========================================================================
    const kcscLink = `https://www.kcsc.re.kr/standardCode/search?searchType=0&kcsc_cd=${encodeURIComponent(officialCode)}`;

    const reportPrompt = `# [Persona]
당신은 40년 경력의 대한민국 국토교통부 건설안전 최고 감리기술인입니다.
아래 제공된 **[국토교통부 공식 기준 원문]**과 현장 결함을 대조하여 객관적인 시정요구서를 작성합니다.
절대 기준이나 수치를 임의로 조작하지 말고, 제공된 공식 원문 규정에 충실하게 조치사항을 도출하세요.

[현장 지적 사항]:
${defectDetail}

[Supabase DB에서 조회된 국토교통부 공식 시방기준]:
- 기준 코드 및 명칭: ${officialCode}${officialTitle}
- 공식 기준 원문:
"""
${officialContent}
"""

반드시 아래 JSON 포맷으로만 응답하세요:
\`\`\`json
{
  "standard_summary": "위 공식 기준 원문에서 이 결함과 직결되는 핵심 조항 원문 인용 및 시공 규정 요약 (2~3줄)",
  "risk_analysis": "해당 규정 미준수 시 발생할 수 있는 구조적 붕괴, 균열, 전도 등 위험도 분석",
  "action_required": "1. 첫번째 즉시 조치사항\\n2. 두번째 규정에 따른 보강 및 재시공 사항\\n3. 세번째 감리원 확인 절차"
}
\`\`\``;

    const reportRes = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{ text: reportPrompt }]
          }
        ],
        generationConfig: {
          temperature: 0.2
        }
      })
    });

    if (!reportRes.ok) {
      const errDetail = await reportRes.text();
      throw new Error(`[Gemini Report API] ${reportRes.status}: ${errDetail}`);
    }

    const reportResult = await reportRes.json();
    const rawReportText = reportResult.candidates?.[0]?.content?.parts?.[0]?.text || "";

    const reportJsonMatch = rawReportText.match(/```json\s*([\s\S]*?)\s*```/);
    let parsedReport: any = {};
    try {
      parsedReport = JSON.parse(reportJsonMatch ? reportJsonMatch[1] : rawReportText);
    } catch {
      parsedReport = {
        standard_summary: "국토교통부 표준시방서 규정에 부합하도록 시공 상태 확인 및 보강 필요",
        risk_analysis: "안전성 저하 및 구조적 결함 발생 우려",
        action_required: "1. 현장 안전조치 즉시 이행\n2. 표준시방서 기준에 따른 보강 시공\n3. 감리원 검측 완료 후 후속 작업 진행"
      };
    }

    // 표 데이터 정제
    const safeDefectDetail = sanitizeForTable(defectDetail);
    const safeStandardSummary = sanitizeForTable(parsedReport.standard_summary || "");
    const safeRiskAnalysis = sanitizeForTable(parsedReport.risk_analysis || "");
    const safeActionRequired = sanitizeForTable(parsedReport.action_required || "");

    const kcscLinkMarkdown = `• 🔍 **[KCSC 공식 기준검색: '${officialCode}' 바로가기 ↗](${kcscLink})** (${officialTitle})`;

    // 건설공사 현장점검 확인서 마크다운 표 조립
    const formattedReport = `## 📄 건설공사 현장점검 확인서

| 구분 | 점검 내용 |
|---|---|
| **지적 사항 (현장 문제점)** | ${safeDefectDetail} |
| **관련 설계·시방 기준** | ${kcscLinkMarkdown}<br/><br/>${safeStandardSummary} |
| **위험도 및 원인 분석** | ${safeRiskAnalysis} |
| **시정 조치 지시사항** | ${safeActionRequired} |`;

    return NextResponse.json({
      defects,
      report: formattedReport
    });

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("분석 에러:", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
