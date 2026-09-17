import { NextResponse } from "next/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// 마크다운 표 깨짐 방지용 줄바꿈 및 특수문자 정제
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

    // 국토교통부 고시 KCS 표준시방서 공식 대분류 목록 주입
    const promptText = `# [PE1: Persona]
당신은 40년 경력의 건설공사 시공, 품질 및 안전관리 특급 감리기술인(건설사업관리기술인)입니다. 현장 사진의 결함을 정밀 식별하고 국토교통부 국가건설기준(KCS 대분류)에 기반하여 객관적인 시정요구서를 작성합니다.

# [PE2: User]
발주청 감독관 및 인허가 관청 점검관.

# [PE3: KCS 표준시방서 공식 대분류 기준표]
- KCS 10 공통공사 (공사일반, 사업관리, 가설공사, 안전 및 환경관리)
- KCS 11 지반공사 (흙공사, 옹벽, 앵커, 지반보강 및 개량공사)
- KCS 14 콘크리트공사 (구조용 콘크리트, 프리캐스트, 특수 콘크리트)
- KCS 17 강구조공사 (강구조물 제작 및 조립, 공장제작, 교량강구조)
- KCS 21 가설공사 (거푸집 및 동바리, 비계, 안전시설 가설재)
- KCS 24 교량공사 (상부 및 하부구조 공사, 교량 부속시설물 공사)
- KCS 27 터널공사 (터널 굴착, 보강, NATM, 쉴드 TBM 터널)
- KCS 31 설비공사 (기계설비, 보온, 도장방청, 배관설비)
- KCS 41 건축공사 (토공사, 지정 및 기초, 조적, 방수, 지붕 및 홈통)
- KCS 44 도로공사 (토공, 배수공, 포장공, 도로 부속시설물)
- KCS 47 철도공사 (궤도재료, 노반공사, 궤도공사, 신호 및 통신설비)
- KCS 51 하천공사 (제방, 호안, 보 및 수문, 하천정비 공사)
- KCS 54 댐공사 (필댐, 콘크리트댐, 댐 부속시설물)
- KCS 57 항만공사 (외곽시설, 계류시설, 준설 및 매립 공사)
- KCS 61 상수도공사 (관로공사, 정수시설, 취수 및 도수설비)
- KCS 64 하수도공사 (하수관로, 하수처리시설, 펌프장 공사)
- KCS 71 조경공사 (조경식재, 조경시설물, 식생복원 공사)
- KCS 81 환경시설공사 (폐기물 처리시설, 오염토양 정화시설)

# [PE4: Procedure]
1. 이미지 정밀 판독: 결함 부위의 2D 바운딩 박스 좌표([ymin, xmin, ymax, xmax], 0~1000 정규화 스케일) 추출
2. 대분류 확정: 위 KCS 대분류 목록 중 사진의 실제 공종에 해당하는 분류코드(예: KCS 11 지반공사, KCS 21 가설공사 등) 1~2개 선택
3. 검색 키워드 도출: KCSC 공식 사이트에서 실제 검색할 핵심 단어(예: "비탈면 가배수로", "동바리 수평연결재", "작업발판" 등) 추출
4. 위험도 분석 및 조치 지시사항 수립 후 JSON 출력

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
  "kcs_category": "KCS 11 지반공사",
  "search_keywords": [
    "비탈면",
    "산마루측구"
  ],
  "defect_detail": "사진에서 확인된 구체적 결함 및 시공 상태",
  "standard_summary": "해당 대분류 기준에 의거한 시공 원칙 및 준수 조항 설명",
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

    const categoryText = aiData.kcs_category || "KCS 표준시방서";
    const rawKeywords: string[] = Array.isArray(aiData.search_keywords) && aiData.search_keywords.length > 0
      ? aiData.search_keywords
      : ["현장점검"];

    // KCSC 공식 검색 규격 URL 생성 (undefined 원천 차단)
    const kcscLinksMarkdown = rawKeywords.map((kw) => {
      const trimmed = kw.trim();
      const enc = encodeURIComponent(trimmed);
      const kcscSearchUrl = `https://www.kcsc.re.kr/standardCode/search?searchType=0&kcsc_cd=${enc}`;
      return `• 🔍 **[KCSC 공식 기준검색: '${trimmed}' 바로가기 ↗](${kcscSearchUrl})**`;
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
| **적용 공종 대분류** | **${categoryText}** |
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
