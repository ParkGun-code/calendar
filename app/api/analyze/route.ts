import { NextResponse } from "next/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

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
당신은 40년 경력의 건설공사 시공, 품질 및 안전관리 특급 감리기술인(건설사업관리기술인)입니다. 현장 사진의 결함을 예리하게 식별하고, 국가건설기준(KDS, KCS) 및 관련 법령에 기반하여 객관적이고 명확한 시정요구서를 작성하는 데 전문성이 있습니다.

# [PE2: User]
현장점검을 수행한 발주청 감독관 및 인허가 관청 점검관입니다. 시공사 및 감리단에 공식 전달할 수 있도록 명확한 기준 조항과 증빙이 포함된 확인서가 필요합니다.

# [PE3: Object]
제공된 건설공사 현장점검 이미지에서 시공 및 안전 품질상의 문제점을 정밀 진단하고, 관련 설계기준(KDS/KCS 등)의 규정과 대조하여 공식 "현장점검 확인서(시정·권고사항)"를 작성하는 것입니다.

# [PE4: Procedure]
1. 이미지 정밀 판독: 사진 내 식별 가능한 시공 결함, 규격 미달, 안전 위해 요소를 목록화하고, 결함 위치의 2D 바운딩 박스 좌표([ymin, xmin, ymax, xmax], 0~1000 정규화 스케일)를 추출
2. 설계기준 매칭: 현장 결함과 직접 관련된 실제 국가건설기준(KCS 표준시방서 또는 KDS 설계기준) 코드와 정식 명칭을 정확히 도출
3. 위험도 및 원인 분석: 해당 결함이 구조물 내구성/안전성에 미치는 영향 평가
4. 조치 방안 수립: 시공사가 취해야 할 구체적인 보수·보강 및 재시공 지침 작성
5. 점검 확인서 완성: 지정된 JSON 양식으로 출력

# [PE6: Ground Data Setting]
- 입력 대상: 첨부된 현장점검 사진
- 참조 기준: 국토교통부 국가건설기준센터(KCS, KDS), 관련 공종 표준시방서 및 설계기준
- 원칙: 상투적인 가설비계 규정을 남발하지 말고, 사진에 나타난 실제 공종(예: 토공, 비탈면/사면, 배수로, 철근배근, 콘크리트타설 등)에 부합하는 정확한 기준을 지정할 것

# [PE7: Format]
반드시 다음 단일 JSON 포맷으로만 응답하십시오:
\`\`\`json
{
  "defects": [
    {
      "box_2d": [ymin, xmin, ymax, xmax],
      "label": "결함 명칭(예: 사면 상부 추락방지 미흡 및 배수불량)"
    }
  ],
  "matched_codes": [
    {
      "code": "KCS 11 30 00",
      "name": "비탈면 보호"
    },
    {
      "code": "KCS 11 20 00",
      "name": "토공사"
    }
  ],
  "defect_detail": "사진에서 확인된 구체적 결함 및 시공 상태 서술",
  "standard_text": "관련 KCS/KDS 기준 조항 및 위반 핵심 내용 구체적 기술",
  "risk_analysis": "구조적 결함, 붕괴 위험성, 안전 사고 위험성 상세 분석",
  "action_required": "시공사가 취해야 할 보수·보강 및 재시공 기준 지침 (관련 기준 번호 포함)"
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

    // AI가 아래쪽에서 정확하게 찾아낸 기준 코드들을 기반으로 링크 생성
    const matchedList: Array<{ code: string; name: string }> = Array.isArray(aiData.matched_codes) && aiData.matched_codes.length > 0
      ? aiData.matched_codes
      : [{ code: "KCS 11 30 00", name: "비탈면 보호" }];

    // 관련 기준 링크 블록 생성
    const standardLinksMarkdown = matchedList.map((item) => {
      const searchUrl = `https://www.kcsc.re.kr/Search/ListCodes?searchKeyword=${encodeURIComponent(item.code)}`;
      return `• **[${item.code} (${item.name}) KCSC 바로가기 ↗](${searchUrl})**`;
    }).join("<br/>");

    // 하단 링크 목록 생성
    const bottomLinksMarkdown = matchedList.map((item) => {
      const searchUrl = `https://www.kcsc.re.kr/Search/ListCodes?searchKeyword=${encodeURIComponent(item.code)}`;
      return `🔗 **[KCSC 국가건설기준센터에서 '${item.code} (${item.name})' 원문 확인 ↗](${searchUrl})**`;
    }).join("\n\n");

    // 최종 공식 [건설공사 현장점검 확인서] 테이블 구성
    const formattedReport = `## 📄 건설공사 현장점검 확인서

| 구분 | 점검 내용 |
|---|---|
| **지적 사항 (현장 문제점)** | ${aiData.defect_detail || "사진에서 확인된 구체적 결함 및 시공 상태"} |
| **관련 설계·시방 기준** | ${standardLinksMarkdown}<br/><br/>${aiData.standard_text || "공식 기준에 따라 해당 공종의 시공 및 품질 기준을 준수하여야 함."} |
| **위험도 및 원인 분석** | ${aiData.risk_analysis || "현장 안전 및 품질 저하 위험 존재"} |
| **시정 조치 지시사항** | ${aiData.action_required || "시공사 즉시 보수·보강 조치 실시"} |

---
${bottomLinksMarkdown}`;

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
