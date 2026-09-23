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

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${GEMINI_API_KEY}`;

    // =========================================================================
    // 1단계: 사진 분석 및 2,565건 현장점검 실무 적발 사례 패턴 1차 대조
    // =========================================================================
    const step1Prompt = `당신은 국토교통부 건설안전 최고 특급 감리기술인입니다.
전달받은 현장 사진의 안전 위험 및 시공 결함을 정밀 분석하고, [2,565건 국토관리청 실무 점검 적발 데이터베이스]의 핵심 패턴과 대조하여 가장 부합하는 공인 기준 코드를 1개 판별하세요.

[2,565건 현장점검 실무 적발 핵심 패턴]:
- [추락/안전난간/개구부] 
  * 바닥 단부, 슬래브 개구부, 계단실 안전난간 미설치/로프 구획 -> KCS 21 70 10 (추락재해 방지시설, 3.2 안전난간)
  * 수평개구부 덮개 미설치, 규격 미달(합판 파손), 미고정 -> KCS 21 70 10 (추락재해 방지시설, 3.3 개구부 수평보호덮개)
  * 안전대 걸이시설(생명줄) 미설치/이완 -> KCS 21 70 10 (추락재해 방지시설, 3.7 안전대 부착설비)
  * 추락방호망 이격/미설치 -> KCS 21 70 10 (추락재해 방지시설, 3.1 추락방호망)
- [비계/작업발판]
  * 시스템비계 수평재/가새 임의 해체 후 미복구 -> KCS 21 60 05 (비계공사 일반사항, 3.1 일반사항)
  * 비계 기둥 하부 받침철물 너트 미체결, 침하 -> KCS 21 60 10 (비계, 3.2 시스템비계)
  * 작업발판 틈새 과다(30mm 초과), 미고정, 상부 자재 적치 -> KCS 21 60 15 (작업발판 및 통로, 3.1 작업발판)
  * 벽이음재 철선 임의 체결, 미설치 -> KCS 21 60 05 (비계공사 일반사항, 3.3 벽이음재)
- [낙하물/방호시설]
  * 비계 외측 및 벽체 사이 낙하물방지망 미설치 -> KCS 21 70 15 (낙하물재해 방지시설, 3.1 낙하물방지망)
  * 주출입구 상부 방호선반 미설치 -> KCS 21 70 15 (낙하물재해 방지시설, 3.2 방호선반)
- [거푸집/동바리]
  * 동바리 수평연결재 철선 결속, 2m 이내 미설치 -> KCS 21 50 05 (거푸집 및 동바리공사 일반사항, 3.4 동바리)
  * 경사면 동바리 쐐기목 미고정, 수직 미유지 -> KCS 21 50 05 (거푸집 및 동바리공사 일반사항, 3.4 동바리)
- [철골/구조]
  * 철골 접합부 가볼트 체결 부족(1군 1/3 이상 미달) -> KCS 14 31 30 (조립 및 설치, 3.3.2 현장조립)
  * 철골 용접부 손상 터치업 페인트 미실시 -> KCS 14 31 40 (도장, 3.13 터치업)
- [철근/콘크리트]
  * 철근 간격재(스페이서) 미설치, 피복두께 부족 -> KCS 14 20 11 (철근공사, 2.2 간격재)
  * 시공이음부 레이턴스/이물질 미제거 -> KCS 14 20 10 (일반콘크리트, 3.6.2 시공이음)
- [토공/가설/환경]
  * 터파기 비탈면 상부 토사/자재 근접 적치 -> KCS 11 20 15 (터파기, 3.3.17 굴착토사)
  * 굴착기 후면 협착방지봉 미설치 -> KCS 21 20 10 (건설지원장비, 3.4 굴착기)
  * 임시침사지 토사 퇴적/준설 미흡 -> KCS 21 20 15 (환경관리시설, 3.3.1 침사지)

★ 중요: "label"은 이미지 위에 표기되므로 절대 문장으로 길게 쓰지 마시고 15자 이내의 간결한 명칭으로만 작성하세요! (예: "안전난간 미설치 (추락 위험)", "개구부 덮개 미설치")

반드시 아래 JSON 형식으로만 응답하십시오:
\`\`\`json
{
  "defects": [
    {
      "box_2d": [ymin, xmin, ymax, xmax],
      "label": "15자 이내 간결한 결함명칭"
    }
  ],
  "code": "KCS XX XX XX",
  "name": "표준시방서 정식 명칭",
  "defect_detail": "사진에서 육안 확인된 미흡 현상 상세 서술"
}
\`\`\``;

    const res1 = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: step1Prompt },
              { inlineData: { mimeType: mimeType || "image/jpeg", data: base64Data } }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.1,
          thinkingConfig: { thinkingBudget: 0 }
        }
      })
    });

    if (!res1.ok) {
      const err1 = await res1.text();
      if (res1.status === 429) {
        throw new Error("AI 호출 한도(429)를 초과했습니다. 약 1분 후 다시 시도해 주세요.");
      }
      throw new Error(`[1단계 비전 분석 오류] ${res1.status}: ${err1}`);
    }

    const data1 = await res1.json();
    const rawText1 = data1.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const match1 = rawText1.match(/```json\s*([\s\S]*?)\s*```/);
    if (!match1 || !match1[1]) {
      throw new Error("AI 분석 데이터 생성에 실패했습니다. 다시 시도해 주세요.");
    }

    const parsed1 = JSON.parse(match1[1]);
    const targetCode = (parsed1.code || "").trim();
    const targetName = (parsed1.name || "").trim();
    const defectDetail = parsed1.defect_detail || "현장 결함 식별 완료";

    if (!targetCode) {
      throw new Error("관련 국가건설기준 코드를 특정하지 못했습니다.");
    }

    // =========================================================================
    // 2단계: 1차 선정된 기준 코드로 Supabase DB 원문 본문 선조회 (RAG 정밀 검증)
    // =========================================================================
    let standardExcerpt = "";
    try {
      const cleanCode = targetCode.replace(/\s+/g, " ");
      const { data: dbData } = await supabase
        .from("construction_standards")
        .select("content, title")
        .ilike("code_number", `%${cleanCode}%`)
        .limit(1);

      if (dbData && dbData.length > 0 && dbData[0].content) {
        const fullContent = dbData[0].content;
        const startPos = fullContent.search(/(3\.\s*시공|2\.\s*재료|1\.\s*일반사항)/i);
        const searchBase = startPos !== -1 ? fullContent.substring(startPos) : fullContent;
        standardExcerpt = searchBase.substring(0, 4500);
      }
    } catch (dbErr) {
      console.warn("Supabase 원문 조회 경고:", dbErr);
    }

    // Rate Limit(429) 방지를 위한 호출 간 딜레이
    await new Promise((r) => setTimeout(r, 1200));

    // =========================================================================
    // 3단계: 조회된 실제 DB 원문만을 읽고 세부 조항 번호 및 실무 확인서 작성
    // =========================================================================
    const step2Prompt = `당신은 국토교통부 수석 감리기술인입니다.
아래 제공된 [국토교통부 표준시방서 실제 원문 본문]에서 해당 결함과 직접 일치하는 실제 세부 조항 번호(반드시 '3.X' 또는 '3.X.X' 형태), 조항명, 핵심 설치 수치 및 규정을 발췌하세요.
절대로 원문 본문에 없는 가짜 조항 번호를 지어내지 마십시오(환각 절대 금지).

[현장 지적 사항]: ${defectDetail}
[적용 기준]: ${targetCode}${targetName}

[국토교통부 표준시방서 실제 원문 본문]:
${standardExcerpt || "원문 대조 요망"}

반드시 아래 JSON 형식으로만 응답하십시오:
\`\`\`json
{
  "clause": "원문에 적힌 정확한 조항 번호 (예: 3.2, 3.3 등)",
  "clause_title": "원문에 적힌 실제 조항 제목",
  "clause_rule": "원문에서 발췌한 핵심 설치 수치 및 법적 요건",
  "risk_analysis": "구조적 안전성 저하 및 안전사고 위험도 상세 분석",
  "action_required": "1. 즉시 안전 확보 및 작업 통제\\n2. 시방서 기준에 따른 보강 및 규격 자재 재시공\\n3. 현장 감리원 검측 완료 확인"
}
\`\`\``;

    const res2 = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: step2Prompt }] }],
        generationConfig: {
          temperature: 0.1,
          thinkingConfig: { thinkingBudget: 0 }
        }
      })
    });

    if (!res2.ok) {
      const err2 = await res2.text();
      if (res2.status === 429) {
        throw new Error("AI 호출 한도(429)에 도달했습니다. 잠시 후 다시 시도해 주세요.");
      }
      throw new Error(`[2단계 조항 대조 오류] ${res2.status}: ${err2}`);
    }

    const data2 = await res2.json();
    const rawText2 = data2.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const match2 = rawText2.match(/```json\s*([\s\S]*?)\s*```/);
    const parsed2 = match2 ? JSON.parse(match2[1]) : {};

    // =========================================================================
    // 4단계: KCSC 공식 검색 링크 및 현장점검 확인서 마크다운 생성
    // =========================================================================
    const encCode = encodeURIComponent(targetCode);
    const kcscUrl = `https://www.kcsc.re.kr/standardCode/search?searchType=0&kcsc_cd=${encCode}`;

    const clauseDisplay = parsed2.clause 
      ? `${parsed2.clause} ${parsed2.clause_title || ""}` 
      : "관련 세부 조항";

    const standardSection = `• 🔍 **[KCSC 공식 기준검색: '${targetCode}' 바로가기 ↗](${kcscUrl})**<br/><br/>• **적용 기준**: ${targetCode} ${targetName}<br/>• **세부 조항**: **${clauseDisplay}**<br/>• **규정 요건**: ${parsed2.clause_rule || "시방서 설치 규정 준수"}`;

    const safeDefectDetail = sanitizeForTable(defectDetail);
    const safeStandard = sanitizeForTable(standardSection);
    const safeRisk = sanitizeForTable(parsed2.risk_analysis || "안전사고 위험 우려");
    const safeAction = sanitizeForTable(parsed2.action_required || "1. 작업 중지 및 접근 통제\n2. 규정 기준에 따른 보강 설치\n3. 감리원 검측 확인");

    const formattedReport = `## 📄 건설공사 현장점검 확인서

| 구분 | 점검 내용 |
|---|---|
| **지적 사항 (현장 문제점)** | ${safeDefectDetail} |
| **관련 설계·시방 기준** | ${safeStandard} |
| **위험도 및 원인 분석** | ${safeRisk} |
| **시정 조치 지시사항** | ${safeAction} |`;

    return NextResponse.json({
      defects: parsed1.defects || [],
      report: formattedReport
    });

  } catch (err: any) {
    console.error("분석 에러:", err);
    return NextResponse.json({ error: err.message || String(err) }, { status: 500 });
  }
}
