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

// 오직 gemini-3.6-flash 모델만 고정 호출 (일시적 503 과부하 발생 시 1.5초 후 1회 재시도)
async function callGemini36Flash(payload: any, apiKey: string) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${apiKey}`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      return await res.json();
    }

    const errText = await res.text();
    if ((res.status === 503 || res.status === 429) && attempt === 1) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      continue;
    }

    throw new Error(`[gemini-3.6-flash] ${res.status}:${errText}`);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { base64Data, mimeType } = body;

    if (!base64Data) {
      return NextResponse.json({ error: "이미지 데이터가 전달되지 않았습니다." }, { status: 400 });
    }

    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: "GEMINI_API_KEY가 설정되지 않았습니다." }, { status: 500 });
    }

    // =========================================================================
    // [Step 1] 사진 분석: 결함 위치 및 DB 조회용 키워드 추출
    // =========================================================================
    const visionPrompt = `# [Vision 결함 진단]
건설공사 현장 사진을 분석하여 다음 정보를 JSON으로 추출하세요:
1. 결함 부위 바운딩 박스([ymin, xmin, ymax, xmax], 0~1000) 및 결함 명칭
2. 시방서 DB 조회를 위한 핵심 검색 키워드 2~3개 (예: "안전울타리", "가설울타리", "방호벽", "동바리", "수평연결재", "비탈면", "피복두께")
3. 육안으로 관찰된 구체적 결함 현상 설명

※ KCS 코드 번호는 DB에서 직접 매칭하므로 코드 번호는 임의로 생성하지 마세요.

응답 형식:
\`\`\`json
{
  "defects": [
    {
      "box_2d": [ymin, xmin, ymax, xmax],
      "label": "결함 명칭"
    }
  ],
  "keywords": ["핵심키워드1", "핵심키워드2"],
  "defect_detail": "현장에서 확인된 구체적 결함 현상 요약"
}
\`\`\``;

    const visionResult = await callGemini36Flash({
      contents: [{
        role: "user",
        parts: [
          { text: visionPrompt },
          { inlineData: { mimeType: mimeType || "image/jpeg", data: base64Data } }
        ]
      }],
      generationConfig: { temperature: 0.1 }
    }, GEMINI_API_KEY);

    const rawVisionText = visionResult.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const visionMatch = rawVisionText.match(/```json\s*([\s\S]*?)\s*```/);
    let visionData: any = {};
    try {
      visionData = JSON.parse(visionMatch ? visionMatch[1] : rawVisionText);
    } catch {
      visionData = {
        defects: [],
        keywords: ["안전울타리", "가설"],
        defect_detail: "현장 가설 및 시공 안전 상태 확인 요망"
      };
    }

    const defects = visionData.defects || [];
    const keywords: string[] = Array.isArray(visionData.keywords) && visionData.keywords.length > 0 
      ? visionData.keywords 
      : ["가설", "안전"];
    const defectDetail = visionData.defect_detail || "현장 결함 확인";

    // =========================================================================
    // [Step 2] Supabase DB 실측 검색: 1,304개 실제 적재 데이터에서 매칭
    // =========================================================================
    let matchedStandard: any = null;

    // 제목 우선 검색
    for (const kw of keywords) {
      const { data } = await supabase
        .from("construction_standards")
        .select("code_number, title, content")
        .ilike("title", `%${kw}%`)
        .limit(1);

      if (data && data.length > 0) {
        matchedStandard = data[0];
        break;
      }
    }

    // 본문 검색
    if (!matchedStandard) {
      for (const kw of keywords) {
        const { data } = await supabase
          .from("construction_standards")
          .select("code_number, title, content")
          .ilike("content", `%${kw}%`)
          .limit(1);

        if (data && data.length > 0) {
          matchedStandard = data[0];
          break;
        }
      }
    }

    // 기본 매칭값
    if (!matchedStandard) {
      const { data: defaultData } = await supabase
        .from("construction_standards")
        .select("code_number, title, content")
        .eq("code_number", "KCS 21 10 00")
        .limit(1);
      
      matchedStandard = defaultData?.[0] || {
        code_number: "KCS 21 10 00",
        title: "가설공사 일반사항",
        content: "시공자는 공사구간 내 통행인과 차량의 안전을 위하여 연속적인 가설울타리 및 안전시설을 설치하여야 한다."
      };
    }

    const realCode = matchedStandard.code_number.trim();
    const realTitle = matchedStandard.title.trim();
    
    // 본문 머리말 건너뛰고 본문 텍스트 슬라이스
    const fullText = matchedStandard.content || "";
    const startIdx = fullText.search(/(1\.\s*일반사항|3\.\s*시공|2\.\s*재료)/i);
    const validBody = startIdx !== -1 ? fullText.substring(startIdx, startIdx + 3000) : fullText.substring(0, 3000);

    // =========================================================================
    // [Step 3] 실제 DB 원문 전달 및 조항 번호(3.X.X (X)항) 발췌 강제
    // =========================================================================
    const reportPrompt = `# [Persona]
당신은 국토교통부 건설안전 최고 감리기술인입니다.
제공된 **[실제 국토교통부 공식 시방서 원문]** 속에서 현장 결함과 직결되는 구체적 조항을 인용하여 보고서를 작성하세요.
제공된 원문에 없는 내용은 임의로 작성하지 마세요.

[현장 결함 상세]:
${defectDetail}

[실제 데이터베이스에서 조회된 공식 기준 원문]:
- 기준: ${realCode}${realTitle}
- 원문 내용:
"""
${validBody}
"""

반드시 아래 JSON 포맷으로만 응답하세요:
\`\`\`json
{
  "clause": "3.X.X (X)항 형태의 구체적 조항 번호 (예: 3.2.1 (1)항)",
  "clause_title": "해당 조항의 소제목",
  "quote": "원문에서 결함과 직결되는 실제 규정 문장 그대로 1~2줄 인용",
  "risk_analysis": "해당 규정 위반 시 발생할 수 있는 구체적 사고 및 구조적 위험",
  "action_required": "1. 첫번째 즉시 조치사항\\n2. 두번째 규정에 따른 보강 시공\\n3. 세번째 감리원 검측 완료 후 후속작업 승인"
}
\`\`\``;

    const reportResult = await callGemini36Flash({
      contents: [{
        role: "user",
        parts: [{ text: reportPrompt }]
      }],
      generationConfig: { temperature: 0.1 }
    }, GEMINI_API_KEY);

    const rawReportText = reportResult.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const reportMatch = rawReportText.match(/```json\s*([\s\S]*?)\s*```/);
    let reportData: any = {};
    try {
      reportData = JSON.parse(reportMatch ? reportMatch[1] : rawReportText);
    } catch {
      reportData = {
        clause: "3.1 (1)항",
        clause_title: "시공 기준",
        quote: "공사구간에는 안전관리계획에 따라 적합한 안전방호시설을 설치하여야 한다.",
        risk_analysis: "교통사고 및 작업자/보행자 추락 위험",
        action_required: "1. 가설 안전시설 즉시 보강\n2. 규정 준수 확인\n3. 감리원 점검 확인"
      };
    }

    // =========================================================================
    // [Step 4] 공식 KCSC 링크 및 최종 점검 확인서 표 렌더링
    // =========================================================================
    const kcscUrl = `https://www.kcsc.re.kr/standardCode/search?searchType=0&kcsc_cd=${encodeURIComponent(realCode)}`;
    const standardLink = `• 🔍 **[KCSC 공식 기준검색: '${realCode}' 바로가기 ↗](${kcscUrl})**`;

    const clauseDisplay = `• **적용 기준**: ${realCode} ${realTitle}\n• **세부 조항**: **${reportData.clause || "시공기준"} ${reportData.clause_title || ""}**\n• **인용 원문**: "${reportData.quote || ""}"`;

    const safeDefectDetail = sanitizeForTable(defectDetail);
    const safeStandard = sanitizeForTable(`${standardLink}\n\n${clauseDisplay}`);
    const safeRisk = sanitizeForTable(reportData.risk_analysis);
    const safeAction = sanitizeForTable(reportData.action_required);

    const formattedReport = `## 📄 건설공사 현장점검 확인서

| 구분 | 점검 내용 |
|---|---|
| **지적 사항 (현장 문제점)** | ${safeDefectDetail} |
| **관련 설계·시방 기준** | ${safeStandard} |
| **위험도 및 원인 분석** | ${safeRisk} |
| **시정 조치 지시사항** | ${safeAction} |`;

    return NextResponse.json({
      defects,
      report: formattedReport
    });

  } catch (err: any) {
    console.error("분석 에러:", err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
