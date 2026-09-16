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
1. 이미지 정밀 판독: 사진 내 식별 가능한 시공 결함, 규격 미달, 안전 위해 요소 목록화 및 바운딩 박스 2D 좌표([ymin, xmin, ymax, xmax] 형식, 0~1000 정규화 스케일) 추출
2. 설계기준 매칭: 결함 사항과 직결되는 국가건설기준(KDS/KCS 표준시방서) 명칭 및 핵심 조항 도출
3. 위험도 및 원인 분석: 해당 결함이 구조물 내구성/안전성에 미치는 영향 평가
4. 조치 방안 수립: 시공사가 취해야 할 구체적인 보수·보강 및 재시공 지침 작성
5. 점검 확인서 완성: 지정된 표 양식에 맞추어 최종 정리

# [PE6: Ground Data Setting]
- 입력 대상: 첨부된 현장점검 사진
- 참조 기준: 국토교통부 국가건설기준센터(KCS, KDS), 콘크리트구조기준, 가설공사 표준시방서 등 관련 공종 규정
- 원칙: 확실하지 않은 추정치는 '현장 실측 필요'로 명시하고, 규정 위반 소지를 법적/기술적 용어로 기술할 것

# [PE7: Format & Output Constraints]
반드시 다음 구조의 단일 JSON 형식으로만 응답하십시오:
\`\`\`json
{
  "defects": [
    {
      "box_2d": [ymin, xmin, ymax, xmax],
      "label": "결함 명칭(예: 비계 작업발판 설치 불량)"
    }
  ],
  "kcsc_code": "KCS 21 60 10",
  "report_table": "## 📄 건설공사 현장점검 확인서\\n\\n| 구분 | 점검 내용 |\\n|---|---|\\n| **지적 사항 (현장 문제점)** | (사진에서 확인된 구체적 결함 및 시공 상태 서술) |\\n| **관련 설계·시방 기준** | (관련 국가건설기준 코드 및 위반 조항 핵심 내용 서술) |\\n| **위험도 및 원인 분석** | (구조적 결함/안전 사고 위험성 평가) |\\n| **시정 조치 지시사항** | (시공사가 이행해야 할 보수·보강 및 재시공 기준 지침) |"
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
    const rawCode = aiData.kcsc_code || "KCS 21 60 10";
    const kcscSearchUrl = `https://www.kcsc.re.kr/Search/ListCodes?searchKeyword=${encodeURIComponent(rawCode)}`;

    // 표 하단에 국가건설기준센터 공식 링크 추가
    const finalReport = `${aiData.report_table}

---
🔗 **[국가건설기준센터(KCSC)에서 '${rawCode}' 공식 고시 원문 확인 및 검색 ↗](${kcscSearchUrl})**`;

    return NextResponse.json({
      defects: aiData.defects || [],
      report: finalReport,
      kcsc_url: kcscSearchUrl,
      kcsc_code: rawCode
    });

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("분석 에러:", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
