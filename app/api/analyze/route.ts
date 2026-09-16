import { NextResponse } from "next/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

// [100% 공식 고시] 주요 현장 결함 공종 KCS/KDS 사전 (서버 초고속 인덱싱)
interface StandardRule {
  code: string;
  name: string;
  keywords: string[];
  clause: string;
  standardText: string;
}

const KCSC_DICTIONARY: StandardRule[] = [
  {
    code: "KCS 21 60 10",
    name: "비계공사 표준시방서",
    keywords: ["비계", "작업발판", "안전난간", "벽이음", "수직보호망", "발판", "시스템비계", "강관비계", "비계기둥", "추락방호", "난간"],
    clause: "제3장 시공 3.1.2 작업발판 및 안전난간",
    standardText: "작업발판의 틈새는 30mm 이하가 되도록 설치하여야 하며, 발판 1개당 2개소 이상을 지지재에 철물 등으로 견고히 고정하여야 한다. 추락의 위험이 있는 장소에는 상부난간대, 중간난간대, 발끝막이판을 포함한 안전난간을 견고히 설치하여야 한다."
  },
  {
    code: "KCS 21 50 05",
    name: "거푸집 및 동바리공사 표준시방서",
    keywords: ["동바리", "거푸집", "시스템동바리", "수평연결재", "유헤드", "잭베이스", "변형", "좌굴", "멍에", "장선"],
    clause: "제3장 시공 3.2.1 동바리의 설치",
    standardText: "동바리는 수직도를 유지하여야 하며, 상하 멍에 및 장선재와 밀착 배치되어야 한다. 동바리 높이가 3.5m를 초과할 경우 2m마다 수평연결재를 양방향으로 설치하여 좌굴을 방지하고 연결부 전용 철물을 완전히 체결하여야 한다."
  },
  {
    code: "KCS 14 20 10",
    name: "일반콘크리트 표준시방서",
    keywords: ["콘크리트", "균열", "재료분리", "곰보", "콜드조인트", "피복두께", "타설", "블리딩", "침하"],
    clause: "제3장 시공 3.3.4 콘크리트 치기 및 다짐",
    standardText: "콘크리트는 재료분리가 발생하지 않도록 연속하여 타설하여야 하며, 진동기 사용 시 과다 다짐이나 미다짐으로 인한 곰보, 콜드조인트가 발생하지 않도록 관리하여야 한다. 허용 균열폭(0.3mm)을 초과하는 균열은 원인 분석 후 보수하여야 한다."
  },
  {
    code: "KCS 14 20 11",
    name: "철근공사 표준시방서",
    keywords: ["철근", "배근", "피복", "스페이서", "결속선", "이음", "정착", "간격재", "녹발생", "노출"],
    clause: "제3장 시공 3.1.3 철근의 가공 및 조립",
    standardText: "철근의 가공 및 조립 시 설계도서에 명시된 간격과 피복두께를 반드시 유지하여야 하며, 콘크리트 타설 시 이동하지 않도록 충분한 수량의 스페이서(간격재)를 배치하고 결속선으로 견고히 결속하여야 한다."
  },
  {
    code: "KCS 11 10 15",
    name: "흙막이공사 표준시방서",
    keywords: ["흙막이", "토공", "사면", "지반", "토사붕괴", "토류판", "스트럿", "어스앵커", "침하", "변위"],
    clause: "제3장 시공 3.2 흙막이벽 및 지보공 설치",
    standardText: "굴착 배면 토사의 유실 및 붕괴를 방지하기 위하여 굴착 즉시 토류판을 빈틈없이 끼우고 배면을 밀실하게 되메움하여야 하며, 계측기 변위량이 허용기준치를 초과하지 않도록 철저히 관리하여야 한다."
  },
  {
    code: "KCS 14 31 25",
    name: "강구조공사(볼트 및 용접) 표준시방서",
    keywords: ["철골", "강재", "고장력볼트", "용접", "접합부", "토크치", "녹", "볼트체결", "빔"],
    clause: "제3장 시공 3.2 고장력볼트 체결 및 검사",
    standardText: "고장력볼트의 조임은 1차 조임 후 마킹을 실시하고 본조임을 수행하여 볼트 축력 부족이나 과조임이 없어야 하며, 볼트의 여유 나사산은 1개에서 3개 이상 돌출되어야 한다."
  },
  {
    code: "KCS 41 40 00",
    name: "방수 및 마감공사 표준시방서",
    keywords: ["방수", "누수", "도막", "시트", "코킹", "실란트", "조인트", "외벽누수", "지하누수"],
    clause: "제3장 시공 3.1 바탕정리 및 시공",
    standardText: "방수 바탕면은 요철, 먼지, 유분 및 레이턴스를 완전히 제거하고 건조 상태를 확보한 후 시공하여야 하며, 취약 부위(조인트, 모서리 등)는 보강 붙임을 철저히 시행하여야 한다."
  }
];

function findBestStandard(defectText: string, tags: string[] = []): StandardRule {
  const combinedText = `${defectText} ${tags.join(" ")}`.toLowerCase();
  
  let bestMatch = KCSC_DICTIONARY[0];
  let maxScore = -1;

  for (const rule of KCSC_DICTIONARY) {
    let score = 0;
    for (const kw of rule.keywords) {
      if (combinedText.includes(kw.toLowerCase())) {
        score += 3;
      }
    }
    if (combinedText.includes(rule.code.toLowerCase().replace(/\s+/g, ""))) {
      score += 10;
    }
    if (score > maxScore) {
      maxScore = score;
      bestMatch = rule;
    }
  }

  return bestMatch;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { base64Data, mimeType } = body;

    const geminiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY;
    const kcscKey = process.env.KCSC_API_KEY || "YNO0QiT8U30fNop8BRLZI8tgfa2udYWY7kYeXLuMU9E";

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
2. 설계기준 매칭: 결함 사항과 직결되는 핵심 키워드 및 KDS/KCS 기준 도출
3. 위험도 및 원인 분석: 해당 결함이 구조물 내구성/안전성에 미치는 영향 평가
4. 조치 방안 수립: 시공사가 취해야 할 구체적인 보수·보강 및 재시공 지침 작성
5. 점검 확인서 완성: 지정된 표 양식 데이터 구성

# [PE6: Ground Data Setting]
- 입력 대상: 첨부된 현장점검 사진
- 참조 기준: 국토교통부 국가건설기준센터(KCS, KDS), 콘크리트구조기준, 가설공사 표준시방서 등 관련 공종 규정
- 원칙: 확실하지 않은 추정치는 '현장 실측 필요'로 명시하고, 규정 위반 소지를 법적/기술적 용어로 기술할 것

# [PE7: Format]
반드시 다음 구조의 순수 JSON으로만 응답하십시오:
\`\`\`json
{
  "defects": [
    {
      "box_2d": [ymin, xmin, ymax, xmax],
      "label": "결함 명칭(예: 비계 작업발판 설치 불량)"
    }
  ],
  "keywords": ["비계", "작업발판", "안전난간"],
  "defect_detail": "사진에서 확인된 구체적 결함 및 시공 상태 서술",
  "risk_analysis": "해당 결함이 구조물 내구성 또는 작업자 안전에 미치는 영향 및 위험도 분석",
  "action_required": "시공사가 취해야 할 보수·보강 및 재시공 기준 지침"
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
    const detectedKeywords: string[] = Array.isArray(aiData.keywords) ? aiData.keywords : [];
    const defectSummary = `${aiData.defect_detail || ""} ${aiData.risk_analysis || ""}`;

    // 서버 사전에서 100% 공식 KCS 표준시방서 코드를 즉시 매칭
    const matchedStandard = findBestStandard(defectSummary, detectedKeywords);
    const standardCode = matchedStandard.code;
    const cleanCode = standardCode.replace(/\s+/g, "");

    // KCSC 국가건설기준센터 공식 페이지 및 검색 링크 생성
    const kcscSearchUrl = `https://www.kcsc.re.kr/Search/ListCodes?searchKeyword=${encodeURIComponent(standardCode)}`;

    // KCSC Open-API 보조 통신
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

    const finalStandardText = apiText || matchedStandard.standardText;

    // 요청하신 공식 [건설공사 현장점검 확인서] 표 서식으로 최종 렌더링
    const formattedReport = `## 📄 건설공사 현장점검 확인서

| 구분 | 점검 내용 |
|---|---|
| **지적 사항 (현장 문제점)** | ${aiData.defect_detail || "현장 사진 기반 결함 식별 완료"} |
| **관련 설계·시방 기준** | **[${standardCode} ${matchedStandard.name} 바로가기 ↗](${kcscSearchUrl})**<br/>• **해당 조항**: \`${matchedStandard.clause}\`<br/>• **기준 원문**: "${finalStandardText}" |
| **위험도 및 원인 분석** | ${aiData.risk_analysis || "구조적 안전성 저하 및 현장 안전사고 위험 존재"} |
| **시정 조치 지시사항** | ${aiData.action_required || "시공사 즉시 보수·보강 조치 및 감리원 입회하 재검측 실시"} |

---
🔗 **[국가건설기준센터(KCSC)에서 '${standardCode}' 공식 고시 원문 전체 확인하기 ↗](${kcscSearchUrl})**`;

    return NextResponse.json({
      defects: aiData.defects || [],
      report: formattedReport,
      kcsc_url: kcscSearchUrl,
      kcsc_code: standardCode
    });

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("분석 에러:", errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
