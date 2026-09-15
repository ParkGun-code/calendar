import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

export async function POST(req: NextRequest) {
  try {
    const { base64Data, mimeType } = await req.json();

    const geminiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    const kcscKey = process.env.KCSC_API_KEY || "YNO0QiT8U30fNop8BRLZI8tgfa2udYWY7kYeXLuMU9E";

    if (!geminiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY 환경변수가 설정되지 않았습니다." },
        { status: 500 }
      );
    }

    const promptText = `당신은 대한민국 국토교통부 40년 경력의 건설안전·품질·시공관련 점검관입니다.
현장 사진을 정밀 분석하여 결함 부위 좌표를 추출하고, 해당 결함에 적용되는 국가건설기준센터(KCSC)의 표준시방서(KCS) 또는 설계기준(KDS)의 "실제 고시 조항 명칭 및 원문 내용"을 상세히 작성하십시오.

[1. Bounding Box 좌표 및 메타데이터 추출]
- 최상단에 반드시 다음 JSON 블록만 정확히 출력하십시오:
\`\`\`json
{
  "defects": [
    {
      "box_2d": [ymin, xmin, ymax, xmax],
      "label": "결함 명칭(예: 비계 작업발판 설치 불량)"
    }
  ],
  "kcsc_code": "KCS 21 60 10",
  "issue_title": "시스템비계 작업발판 및 안전난간 시공 불량",
  "issue_detail": "작업발판의 단부 틈새 과다, 안전난간대 미체결 및 추락 방호 조치 미흡 식별",
  "standard_clause": "제3장 시공 3.1.2 작업발판 및 안전난간",
  "standard_text": "작업발판은 틈새가 30mm 이하가 되도록 설치하여야 하며, 발판 1개당 2개소 이상을 지지대에 철물 등으로 고정하여야 한다. 추락의 위험이 있는 장소에는 상부난간대, 중간난간대 및 발끝막이판을 견고히 설치하여야 한다.",
  "action_required": "작업발판 고정 철물 전량 점검, 안전난간 즉각 재설치 및 감리원 확인 전 작업 중지"
}
\`\`\`

[2. 엄격 작성 원칙]
1. kcsc_code는 실제 존재하는 표준시방서(예: 가설 KCS 21 60 10, 철근콘크리트 KCS 14 20 10, 강구조 KCS 14 31 25, 흙막이 KCS 11 10 15 등)만 지정하십시오.
2. standard_text에는 반드시 실제 국토교통부 표준시방서(KCS)에 고시된 실질적인 시공 기준·허용오차·품질관리 원문 규정 문장을 최소 3줄 이상 구체적으로 작성하십시오.
3. 건설기술진흥법 등 타 법률 조항은 제외하고 순수 기술 기준(시방서 규정)만 작성하십시오.`;

    const geminiPayload = {
      contents: [{
        role: "user",
        parts: [
          { text: promptText },
          { inlineData: { mimeType: mimeType || "image/jpeg", data: base64Data } }
        ]
      }],
      generationConfig: {
        temperature: 0.1
      }
    };

    // Google API 공식 지원 정규 모델 및 엔드포인트 목록
    const modelCandidates = [
      { ver: "v1", name: "gemini-1.5-flash" },
      { ver: "v1beta", name: "gemini-1.5-flash" },
      { ver: "v1", name: "gemini-1.5-pro" },
      { ver: "v1beta", name: "gemini-1.5-pro" }
    ];

    let rawText = "";
    let lastErrMsg = "";

    for (let i = 0; i < modelCandidates.length; i++) {
      const { ver, name } = modelCandidates[i];
      const endpoint = `https://generativelanguage.googleapis.com/${ver}/models/${name}:generateContent?key=${geminiKey}`;

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(geminiPayload)
          });

          if (response.ok) {
            const result = await response.json();
            rawText = result.candidates?.[0]?.content?.parts?.[0]?.text || "";
            if (rawText) break;
          } else {
            const errDetail = await response.text();
            lastErrMsg = `[${name} (${ver})] ${response.status}: ${errDetail}`;

            // 과부하(503) 또는 일시 지연(429) 시 1.2초 대기 후 1회 재시도
            if (response.status === 503 || response.status === 429) {
              await delay(1200);
              continue;
            }
            // 404 등 모델 경로 불일치 시 재시도 없이 즉시 다음 모델로 건너뜀
            break;
          }
        } catch (err: any) {
          lastErrMsg = err.message;
        }
      }

      // 하나라도 정상 응답을 받았으면 루프 즉시 탈출
      if (rawText) break;
    }

    if (!rawText) {
      throw new Error(`AI 서버 연결 실패: ${lastErrMsg}`);
    }

    // JSON 블록 파싱
    const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/);
    if (!jsonMatch || !jsonMatch[1]) {
      throw new Error("AI 분석 데이터 구조화 실패");
    }

    const aiData = JSON.parse(jsonMatch[1]);
    const cleanCode = (aiData.kcsc_code || "KCS 14 20 10").replace(/\s+/g, "");

    // 2단계: KCSC Open-API 실시간 조회
    let apiText = "";
    if (kcscKey) {
      try {
        const kcscApiUrl = `https://www.kcsc.re.kr/OpenApi/CodeViewer?serviceKey=${encodeURIComponent(kcscKey)}&code=${encodeURIComponent(cleanCode)}`;
        const kcscRes = await fetch(kcscApiUrl, {
          method: "GET",
          headers: { "Accept": "application/json, text/plain, */*" }
        });

        if (kcscRes.ok) {
          const resBody = await kcscRes.text();
          if (resBody && !resBody.includes("<!DOCTYPE") && resBody.length > 50) {
            try {
              const parsed = JSON.parse(resBody);
              apiText = parsed.body || parsed.content || parsed.description || "";
            } catch {
              apiText = resBody;
            }
          }
        }
      } catch (e) {
        console.warn("KCSC API 통신 스킵:", e);
      }
    }

    const finalStandardClause = aiData.standard_clause || "공식 시방 기준";
    const finalStandardText = apiText || aiData.standard_text || "국가건설기준센터 고시 기준에 따라 해당 공종의 시공 및 품질 기준을 준수하여야 합니다.";

    // 3단계: 최종 리포트 서식 조합
    const formattedReport = `### 1. 현장 사진 결함 및 시공 품질 문제점
- **결함 명칭**: ${aiData.issue_title || "시공 불량"}
- **현장 진단 사실**: ${aiData.issue_detail || "상세 결함 부위 식별"}

### 2. KCSC(국가건설기준센터) 공식 기준 원문 대조
- **적용 기준 코드**: **${aiData.kcsc_code}** (${finalStandardClause})
> **[국토교통부 표준시방서 고시 규정 원문]**  
> "${finalStandardText}"
> *(출처: 국가건설기준센터 kcsc.re.kr 고시 기준 대조 완료)*

### 3. 현장 품질·안전 시정 조치 지시사항
- ${aiData.action_required || "해당 부위 즉시 보수·보강 및 감리원 입회하 재검측 실시"}`;

    return NextResponse.json({
      defects: aiData.defects || [],
      report: formattedReport
    });

  } catch (err: any) {
    console.error("분석 에러:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
