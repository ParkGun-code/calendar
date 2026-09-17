import { NextResponse } from "next/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// 마크다운 표 깨짐 방지용 줄바꿈 및 특수문자 치환
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
당신은 40년 경력의 건설공사 시공, 품질 및 안전관리 특급 감리기술인(건설사업관리기술인)입니다. 현장 사진의 결함을 정밀 식별하고 국토교통부 표준시방서(KCS) 공식 코드 번호에 기반하여 객관적인 시정요구서를 작성합니다.

# [PE2: User]
발주청 감독관 및 인허가 관청 점검관.

# [PE3: KCS 표준시방서 대분류 및 주요 코드 예시]
- KCS 10 00 00 공통공사 (KCS 10 10 00 공통사항, KCS 10 20 00 가설공사 등)
- KCS 11 00 00 지반공사 (KCS 11 20 00 토공사, KCS 11 30 00 비탈면 보호 등)
- KCS 14 00 00 콘크리트공사 (KCS 14 20 10 일반콘크리트, KCS 14 20 11 철근공사, KCS 14 20 12 거푸집 및 동바리 등)
- KCS 17 00 00 강구조공사
- KCS 21 00 00 가설공사 (KCS 21 50 05 거푸집 및 동바리공사, KCS 21 60 10 비계공사 등)
- KCS 24 00 00 교량공사
- KCS 27 00 00 터널공사
- KCS 41 00 00 건축공사
- KCS 44 00 00 도로공사

# [PE4: Procedure]
1. 이미지 정밀 판독: 결함 부위의 2D 바운딩 박스 좌표([ymin, xmin, ymax, xmax], 0~1000 정규화 스케일) 추출
2. KCS 코드 도출: 사진에 나타난 결함과 직결되는 실제 국토교통부 표준시방서 코드 번호(반드시 'KCS XX XX XX' 형식)와 정식 명칭 1~2개 도출
3. 위험도 분석 및 조치 지시사항 수립 후 JSON 출력

# [PE5: Format]
반드시 다음 JSON 형식으로만 응답하십시오:
\`\`\`json
{
  "defects": [
    {
      "box_2d": [ymin, xmin, ymax, xmax],
      "label": "결함 명칭"
    }
  ],
  "matched_codes": [
    {
      "code": "KCS 21 50 05",
      "name": "거푸집 및 동바리공사 표준시방서"
    }
  ],
  "defect_detail": "사진에서 확인된 구체적 결함 및 시공 상태",
  "standard_summary": "도출된 KCS 코드에 명시된 시공 원칙 및 핵심 준수 규정 요약",
  "risk_analysis": "구조적 결함 및 안전사고 위험도 상세 분석",
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

    const matchedList: Array<{ code: string; name: string }> = Array.isArray(aiData.matched_codes) && aiData.matched_codes.length > 0
      ? aiData.matched_codes
      : [{ code: "KCS 21 50 05", name: "거푸집 및 동바리공사 표준시방서" }];

    // KCSC 공식 검색 규격(searchType=0&kcsc_cd=KCS 코드)에 KCS 번호 직접 전달
    const kcscLinksMarkdown = matchedList.map((item) => {
      const targetCode = item.code.trim();
      const encCode = encodeURIComponent(targetCode);
      const kcscSearchUrl = `https://www.kcsc.re.kr/standardCode/search?searchType=0&kcsc_cd=${encCode}`;
      return `• 🔍 **[KCSC 공식 기준검색: '${targetCode}' 바로가기 ↗](${kcscSearchUrl})** (${item.name})`;
    }).join("<br/>");

    // 표 데이터 정제
    const safeDefectDetail = sanitizeForTable(aiData.defect_detail || "현장 사진 기반 결함 식별 완료");
    const safeStandardSummary = sanitizeForTable(aiData.standard_summary || "국토교통부 표준시방서 기준 준수 필요");
    const safeRiskAnalysis = sanitizeForTable(aiData.risk_analysis || "안전 및 품질 저하 위험 존재");
    const safeActionRequired = sanitizeForTable(aiData.action_required || "시공사 즉시 시정 조치 요망");

    // 건설공사 현장점검 확인서 표 조립
    const formattedReport = `## 📄 건설공사 현장점검 확인서

| 구분 | 점검 내용 |
|---|---|
| **지적 사항 (현장 문제점)** | ${safeDefectDetail} |
| **관련 설계·시방 기준** | ${kcscLinksMarkdown}<br/><br/>${safeStandardSummary} |
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
