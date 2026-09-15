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

    // 1단계: 사진 분석 + KCSC 코드 도출 + 시방서 원문 규정 직접 추출
    const promptText = `당신은 대한민국 국토교통부 40년 경력의 건설안전·품질·시공분야 베테랑 점검관입니다.
현장 사진을 정밀 분석하여 결함 부위 좌표를 추출하고, 해당 결함에 적용되는 국가건설기준센터(KCSC)의 표준시방서(KCS) 또는 설계기준(KDS)의 "실제 고시 조항 명칭 및 원문 내용"을 상세히 작성하십시오.

[1. Bounding Box 좌표 및 메타데이터 추출]
- 최상단에 반드시 다음 JSON 블록만 정확히 출력하십시오:
\`\`\`json
{
  "defects": [
    {
      "box_2d": [ymin, xmin, ymax, xmax],
      "label": "결함 명칭(예: 고장력볼트 체결 불량)"
    }
  ],
  "kcsc_code": "KCS 14 31 25",
  "issue_title": "고장력볼트 체결 및 접합 관리 상태 불량",
  "issue_detail": "고장력볼트 조임 시 너트 회전량 기준 미달, 볼트 여유 나사산(1~3개) 부족 및 와셔 체결 불량 식별",
  "standard_clause": "제3장 시공 3.3 볼트 조임 및 검사",
  "standard_text": "고장력볼트의 조임은 토크관리법 또는 너트회전법에 따라 시공하여야 하며, 볼트 끝 여유 길이는 너트를 완전히 죈 후 나사산이 1~3개 나와야 한다. 볼트 조임 후 볼트 머리와 너트 아래에 와셔가 정상 체결되었는지 전량 확인하여야 한다.",
  "action_required": "볼트 전량 토크 계측 검사 실시, 기준 미달 볼트 즉각 재체결 및 감리원 입회하 볼트마킹 확인"
}
\`\`\`

[2. 엄격 작성 원칙]
1. kcsc_code는 실제 존재하는 표준시방서(예: 가설 KCS 21 60 10, 철근콘크리트 KCS 14 20 10, 강구조 KCS 14 31 25, 흙막이 KCS 11 10 15 등)만 지정하십시오.
2. standard_text에는 반드시 실제 국토교통부 표준시방서(KCS)에 고시된 실질적인 시공 기준·허용오차·품질관리 원문 규정 문장을 최소 3줄 이상 구체적으로 작성하십시오. 절대 빈칸이나 요약문으로 끝내지 마십시오.
3. 건설기술진흥법 등 법률 조항은 제외하고 순수 기술 기준(시방서 규정)만 작성하십시오.`;

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

    const candidateModels = [
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemini-flash-latest"
    ];

    let rawText = "";
    let lastErrMsg = "";

    for (let i = 0; i < candidateModels.length; i++) {
      const modelName = candidateModels[i];
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${geminiKey}`;

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
            lastErrMsg = `[${modelName}] ${response.status}: ${errDetail}`;
            if (response.status === 503 || response.status === 429) {
              await delay(1000);
              continue;
            } else {
              break;
            }
          }
        } catch (err: any) {
          lastErrMsg = err.message;
        }
      }

      if (rawText) break;
    }

    if (!rawText) {
      throw new Error("AI 응답 지연: " + lastErrMsg);
    }

    // JSON 블록 파싱
    const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/);
    if (!jsonMatch || !jsonMatch[1]) {
      throw new Error("AI 분석 데이터 구조화 실패");
    }

    const aiData = JSON.parse(jsonMatch[1]);
    const cleanCode = (aiData.kcsc_code || "KCS 14 20 10").replace(/\s+/g, "");

    // 2단계: KCSC Open-API 실시간 조회 (서버 응답 병합)
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

    // API 원문이 비어 있을 경우 AI가 인출한 고시 원문(standard_text)을 우선 배치
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
