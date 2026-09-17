import { NextResponse } from "next/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// 표 내부 엔터(\n)를 <br/>로 치환하고 파이프(|) 충돌을 방지하여 표 레이아웃 보존
function sanitizeForTable(text: string): string {
  if (!text) return "";
  return text
    .replace(/\r?\n+/g, "<br/>")
    .replace(/\|/g, "I");
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { base64Data, mimeType } = body;

    const geminiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;

    if (!geminiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY 환경변수가 설정되지 않았습니다." },
        { status: 500 }
      );
    }

    const promptText = `# [PE1: Persona]
당신은 40년 경력의 건설공사 시공, 품질 및 안전관리 특급 감리기술인(건설사업관리기술인)입니다. 현장 사진의 결함을 예리하게 식별하고, 국가건설기준(KDS, KCS) 및 관련 규정에 기반하여 객관적이고 명확한 시정요구서를 작성하는 데 전문성이 있습니다.

# [PE2: User]
현장점검을 수행한 발주청 감독관 및 인허가 관청 점검관입니다. 시공사 및 감리단에 공식 전달할 수 있도록 명확한 기준 조항과 증빙이 포함된 확인서가 필요합니다.

# [PE3: Object]
제공된 건설공사 현장점검 이미지에서 시공 및 안전 품질상의 문제점을 정밀 진단하고, 국가건설기준(KCS, KDS)을 검색할 수 있는 "정확한 핵심 건설 기술 검색어(2~3개)"를 도출하여 공식 [현장점검 확인서]를 작성하는 것입니다.

# [PE4: Procedure]
1. 이미지 정밀 판독: 사진 내 식별 가능한 시공 결함, 규격 미달, 안전 위해 요소를 목록화하고 결함 위치의 2D 바운딩 박스 좌표([ymin, xmin, ymax, xmax], 0~1000 정규화 스케일) 추출
2. 건설기준 매칭: 결함과 직결되는 공종의 핵심 기술 키워드(예: "동바리 수평연결재", "비탈면 가배수로", "비계 작업발판", "콘크리트 피복두께" 등) 도출
3. 위험도 및 원인 분석: 해당 결함이 구조물 내구성/안전성에 미치는 영향 평가
4. 조치 방안 수립: 시공사가 취해야 할 구체적인 보수·보강 및 재시공 지침 작성
5. 점검 확인서 완성: 지정된 JSON 포맷으로 출력

# [PE6: Ground Data Setting]
- 입력 대상: 첨부된 현장점검 사진
- 참조 기준: 국토교통부 국가건설기준센터(KCS, KDS)
- 원칙: 상투적인 비계 기준을 무분별하게 적용하지 말고, 사진에 나타난 실제 공종에 직결되는 정확한 검색 키워드를 제공할 것

# [PE7: Format]
반드시 다음 단일 JSON 포맷으로만 응답하십시오:
\`\`\`json
{
  "defects": [
    {
      "box_2d": [ymin, xmin, ymax, xmax],
      "label": "결함 명칭"
    }
  ],
  "search_keywords": [
    "동바리 수평연결재",
    "거푸집동바리 시공"
  ],
  "defect_detail": "사진에서 확인된 구체적 결함 및 시공 상태 서술",
  "standard_summary": "해당 공종에 요구되는 설계·시방 기준 규정 및 준수 원칙 설명",
  "risk_analysis": "구조적 결함, 붕괴 위험성, 안전 사고 위험성 상세 분석",
  "action_required": "1. 첫번째 시정조치\\n2. 두번째 시정조치\\n3. 세번째 시정조치"
}
\`\`\``;

    const geminiPayload = {
      contents: [{
        role: "user",
        parts: [
          { text: promptText },
          { inlineData: { mimeType: mimeType || "image/jpeg", data: base64Data } }
        ]
      }]
    };

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${geminiKey}`;

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiPayload)
    });

    if (!response.ok) {
      const errDetail = await response.text();
      throw new Error(`[Gemini API] ${response.status}: ${errDetail}`);
    }

    const result = await response.json();
    const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (!rawText) {
      throw new Error("AI 분석 결과가 비어 있습니다.");
    }

    const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/);
    if (!jsonMatch || !jsonMatch[1]) {
      throw new Error("AI 분석 데이터 구조화 실패");
    }

    const aiData = JSON.parse(jsonMatch[1]);

    const rawKeywords: string[] = Array.isArray(aiData.search_keywords) && aiData.search_keywords.length > 0
      ? aiData.search_keywords
      : ["현장점검 시공기준"];

    // KCSC 로그인 제한을 우회하여 공식 기준 원문으로 직행하는 검색 링크 생성
    const standardLinksMarkdown = rawKeywords.map((kw) => {
      const trimmed = kw.trim();
      // KCSC 사이트 내 문서만 100% 필터링하여 로그인 없이 바로 열리는 링크
      const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(`site:kcsc.re.kr ${trimmed}`)}`;
      return `• 🔍 **[KCSC 공식 기준 열람: '${trimmed}' (로그인 불필요) ↗](${googleSearchUrl})**`;
    }).join("<br/>");

    // 표 칸별 텍스트 줄바꿈 정제 (표 깨짐 방지)
    const safeDefectDetail = sanitizeForTable(aiData.defect_detail || "사진에서 확인된 결함 상태");
    const safeStandardSummary = sanitizeForTable(aiData.standard_summary || "국가건설기준에 명시된 시공 및 품질 허용오차 기준 준수 필요");
    const safeRiskAnalysis = sanitizeForTable(aiData.risk_analysis || "안전 및 품질 저하 위험");
    const safeActionRequired = sanitizeForTable(aiData.action_required || "시공사 즉시 시정 조치 요망");

    // [건설공사 현장점검 확인서] 단일 표 서식
    const formattedReport = `## 📄 건설공사 현장점검 확인서

| 구분 | 점검 내용 |
|---|---|
| **지적 사항 (현장 문제점)** | ${safeDefectDetail} |
| **관련 설계·시방 기준** | ${standardLinksMarkdown}<br/><br/>${safeStandardSummary} |
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
