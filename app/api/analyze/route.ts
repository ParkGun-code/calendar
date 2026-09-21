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

// 503 트래픽 과부하 방지 다중 모델 호출
async function fetchGeminiWithFallback(payload: any, apiKey: string) {
  const candidateModels = ["gemini-3.6-flash", "gemini-2.5-flash"];
  let lastErrorMsg = "";

  for (const model of candidateModels) {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          return await res.json();
        }

        const errText = await res.text();
        lastErrorMsg = `[${model}] ${res.status}:${errText}`;

        if (res.status === 503 || res.status === 429) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }
        break;
      } catch (err: any) {
        lastErrorMsg = err.message || String(err);
      }
    }
  }

  throw new Error(`AI 서버 호출 지연. 잠시 후 다시 시도해 주세요. (${lastErrorMsg})`);
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
    // 1단계: 사진 속 정밀 결함 분석 및 명확한 KCS/KDS 코드 & 조항 검색 키워드 도출
    // =========================================================================
    const promptText = `# [PE1: Persona]
당신은 40년 경력의 대한민국 국토교통부 건설안전 최고 특급 감리기술인입니다.
현장 사진의 결함을 판독하고, 실제 건설공사 표준시방서(KCS) 또는 설계기준(KDS)의 구체적 조항(예: 3.1.2 (1) 항)을 인용하여 공학적이고 행정적인 시정명령서를 작성합니다.

# [PE2: Instruction]
1. 사진 내 결함 부위의 2D 바운딩 박스 좌표([ymin, xmin, ymax, xmax], 0~1000 정규화 스케일)를 도출하세요.
2. 이 결함과 가장 직접적으로 연관된 국토교통부 표준시방서 코드 번호('KCS XX XX XX' 형식)와 정식 기준명을 명확히 지정하세요.
   - 도로변 안전시설/가설방호벽/가설울타리: KCS 21 10 00(가설공사 일반) 또는 KCS 10 20 00 / KCS 44 80 00(도로안전시설)
   - 흙막이/사면/비탈면: KCS 11 10 00 ~ 11 30 00
   - 동바리/비계: KCS 21 50 05, KCS 21 60 10
   - 콘크리트/철근: KCS 14 20 10, KCS 14 20 11
3. 데이터베이스 검색에 필요한 핵심 단어 1~2개(예: 가설울타리, 방호벽, 수평연결재, 사면보호 등)를 추출하세요.
4. 해당 시방서에서 다루는 구체적 조항 번호와 조항 제목(예: "3.2.1 가설울타리 및 방호벽 설치 (1) 항")을 명시하세요.
5. 구체적인 현장 결함 상태, 구조/안전 위험도 분석, 3단계 즉시 시정 조치사항을 작성하세요.

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
  "name": "정식 표준시방서 명칭",
  "search_keyword": "핵심 검색 단어",
  "clause_no": "3.X.X (X)항",
  "clause_title": "조항 제목",
  "clause_requirement": "해당 조항에서 명시하는 구체적인 설치 기준 및 준수 수치 요약",
  "defect_detail": "사진에서 육안 확인된 구체적 결함 현상",
  "risk_analysis": "구조적 결함 및 안전사고 위험도 상세 분석",
  "action_required": "1. 첫번째 즉시 조치사항\\n2. 두번째 규정에 따른 보강 및 재시공 사항\\n3. 세번째 감리원 검측 확인 후 작업 진행"
}
\`\`\``;

    const geminiPayload = {
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
    };

    const result = await fetchGeminiWithFallback(geminiPayload, GEMINI_API_KEY);
    const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text || "";

    const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/);
    let aiData: any = {};
    try {
      aiData = JSON.parse(jsonMatch ? jsonMatch[1] : rawText);
    } catch {
      aiData = {
        defects: [],
        code: "KCS 21 10 00",
        name: "가설공사 표준시방서",
        search_keyword: "안전시설",
        clause_no: "3.2.1 (1)항",
        clause_title: "가설 안전시설 설치",
        clause_requirement: "차량 및 보행자 보호를 위한 연속적인 가설방호벽 또는 안전펜스를 설치하여야 한다.",
        defect_detail: "현장 시공 및 가설 안전 상태 결함 확인",
        risk_analysis: "안전사고 위험 및 현장 통제 불량 우려",
        action_required: "1. 안전펜스 즉시 설치\n2. 규정에 맞는 방호시설 보강\n3. 감리원 점검 완료 후 시공"
      };
    }

    const targetCode = (aiData.code || "KCS 21 10 00").trim();
    const targetKeyword = (aiData.search_keyword || "").trim();
    const clauseNo = aiData.clause_no || "3.1 (1)항";
    const clauseTitle = aiData.clause_title || "시공 기준";
    const clauseReq = aiData.clause_requirement || "";

    // =========================================================================
    // 2단계: Supabase 적재 원문에서 실제 조항 본문 정밀 추출 (서지정보 필터링)
    // =========================================================================
    let extractedClauseText = "";

    const { data: codeMatches } = await supabase
      .from("construction_standards")
      .select("code_number, title, content")
      .ilike("code_number", `%${targetCode.replace(/\s+/g, " ")}%`)
      .limit(1);

    if (codeMatches && codeMatches.length > 0 && codeMatches[0].content) {
      const fullText = codeMatches[0].content;
      
      // '1. 일반사항' 또는 '3. 시공' 이후의 실제 본문 위치 탐색 (헤더/개정이력 스킵)
      const bodyStartIndex = fullText.search(/(1\.\s*일반사항|3\.\s*시공|2\.\s*재료)/i);
      const cleanBody = bodyStartIndex !== -1 ? fullText.substring(bodyStartIndex) : fullText;

      // 키워드가 포함된 문단 위치 정밀 추출
      const kwIdx = targetKeyword ? cleanBody.indexOf(targetKeyword) : -1;
      if (kwIdx !== -1) {
        const start = Math.max(0, kwIdx - 40);
        const end = Math.min(cleanBody.length, kwIdx + 260);
        extractedClauseText = cleanBody.substring(start, end).replace(/\r?\n+/g, " ").trim();
      } else {
        // 키워드가 없으면 3. 시공 섹션 부근에서 250자 발췌
        extractedClauseText = cleanBody.substring(0, 250).replace(/\r?\n+/g, " ").trim();
      }
    }

    // 최종 기준 텍스트 포맷 구성 (명확한 조항 번호 체계 반영)
    let standardSummaryText = `• **적용 기준**: ${targetCode} ${aiData.name || "표준시방서"}\n• **세부 조항**: **${clauseNo} ${clauseTitle}**\n• **규정 요건**: ${clauseReq}`;
    
    if (extractedClauseText) {
      standardSummaryText += `\n• **공식 원문 인용**: "... ${extractedClauseText} ..."`;
    }

    // =========================================================================
    // 3단계: KCSC 공식 직행 링크 및 확인서 마크다운 표 생성
    // =========================================================================
    const encCode = encodeURIComponent(targetCode);
    const kcscUrl = `https://www.kcsc.re.kr/standardCode/search?searchType=0&kcsc_cd=${encCode}`;
    const standardLink = `• 🔍 **[KCSC 공식 기준검색: '${targetCode}' 바로가기 ↗](${kcscUrl})**`;

    const safeDefectDetail = sanitizeForTable(aiData.defect_detail);
    const safeStandardSummary = sanitizeForTable(standardSummaryText);
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

  } catch (err: any) {
    console.error("분석 에러:", err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
