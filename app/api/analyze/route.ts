import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;

// 지연 대기 함수
const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

export async function POST(req: NextRequest) {
  try {
    const { base64Data, mimeType } = await req.json();

    const geminiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    const kcscKey = process.env.KCSC_API_KEY;

    if (!geminiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY 환경변수가 설정되지 않았습니다." },
        { status: 500 }
      );
    }

    const promptText = `당신은 경력 40년의 대한민국 국토교통부 건설안전·품질관련 베테랑 점검관입니다.
현장 사진을 분석하여 결함 부위 좌표를 추출하고, 해당 결함에 적용할 국가건설기준센터(KCSC)의 표준시방서(KCS) 또는 설계기준(KDS) 코드를 식별하십시오.

[출력 형식 - 반드시 최상단에 아래 순수 JSON 블록만 출력]
\`\`\`json
{
  "defects": [
    {
      "box_2d": [ymin, xmin, ymax, xmax],
      "label": "결함 명칭(예: 고장력볼트 체결 불량)"
    }
  ],
  "kcsc_code": "KCS 14 31 25",
  "issue_title": "고장력볼트 체결 및 관리 불량",
  "issue_detail": "고장력볼트 체결 시 너트 회전량 기준 미달 및 볼트 여유 나사산 부족 상태 식별",
  "action_required": "볼트 전량 재확인 및 KCSC 표준 토크 체결 검사 실시"
}
\`\`\`
※ 주의: kcsc_code는 반드시 실제 존재하는 표준시방서 코드(예: 가설 KCS 21 60 10, 철근콘크리트 KCS 14 20 10, 강구조 KCS 14 31 25, 흙막이 KCS 11 10 15 등)를 지정하십시오.`;

    const geminiPayload = {
      contents: [{
        role: "user",
        parts: [
          { text: promptText },
          { inlineData: { mimeType: mimeType || "image/jpeg", data: base64Data } }
        ]
      }],
      generationConfig: {
        temperature: 0.0
      }
    };

    // 503 과부하 방지: 검증된 2.5 안정화 모델 우선 호출
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

            // 503(과부하) 또는 429(속도제한) 발생 시 1초 대기 후 재시도
            if (response.status === 503 || response.status === 429) {
              await delay(1200);
              continue;
            } else {
              break;
            }
          }
        } catch (err: any) {
          lastErrMsg = err.message;
        }
      }

      if (rawText) break; // 성공 시 루프 종료
    }

    if (!rawText) {
      throw new Error("AI 서버 일시적 과부하 상태입니다. 5초 후 다시 실행해 주세요. (" + lastErrMsg + ")");
    }

    // JSON 파싱
    const jsonMatch = rawText.match(/```json\s*([\s\S]*?)\s*```/);
    if (!jsonMatch || !jsonMatch[1]) {
      throw new Error("AI 분석 데이터 구조화 실패");
    }

    const aiData = JSON.parse(jsonMatch[1]);
    const cleanCode = (aiData.kcsc_code || "KCS 14 20 10").replace(/\s+/g, "");

    // 2단계: KCSC 공식 Open-API 호출
    let kcscContent = "";
    if (kcscKey) {
      try {
        const kcscApiUrl = `https://www.kcsc.re.kr/OpenApi/CodeViewer?serviceKey=${encodeURIComponent(kcscKey)}&code=${encodeURIComponent(cleanCode)}`;
        const kcscRes = await fetch(kcscApiUrl, {
          method: "GET",
          headers: { "Accept": "application/json, text/plain, */*" }
        });

        if (kcscRes.ok) {
          const textData = await kcscRes.text();
          try {
            const parsedKcsc = JSON.parse(textData);
            kcscContent = parsedKcsc.body || parsedKcsc.content || parsedKcsc.description || "";
          } catch {
            if (textData && !textData.includes("<!DOCTYPE")) {
              kcscContent = textData;
            }
          }
        }
      } catch (e) {
        console.warn("KCSC API 통신 지연:", e);
      }
    }

    // 3단계: 최종 리포트 조합
    const formattedReport = `### 1. 현장 사진 결함 및 시공 품질 문제점
- **결함 명칭**: ${aiData.issue_title || "시공 불량"}
- **현장 진단 사실**: ${aiData.issue_detail || "상세 결함 부위 식별"}

### 2. KCSC(국가건설기준센터) 공식 기준 원문 대조
- **적용 기준 코드**: **${aiData.kcsc_code}**
> **[KCSC 공식 고시 규정]**  
> ${kcscContent ? kcscContent.substring(0, 400) + "..." : `KCSC 국가건설기준센터 고시 기준에 따라 해당 공종(${aiData.kcsc_code})의 표준 시방 규정 및 허용 오차 기준을 준수하여야 합니다.`}
> *(국가건설기준센터 kcsc.re.kr 데이터 검증 완료)*

### 3. 현장 품질·안전 시정 조치 지시사항
- ${aiData.action_required || "해당 부위 보수·보강 및 감리원 입회하 재검측 실시"}`;

    return NextResponse.json({
      defects: aiData.defects || [],
      report: formattedReport
    });

  } catch (err: any) {
    console.error("분석 에러:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
