/**
 * route.ts
 * ChatDiet Orchestrator + Generative Response
 * 
 * 논문 구현:
 * - Stage 4: Orchestrator (BM25 Retrieval + Transcribing + Prompt Engineering)
 * - Stage 5: Generative Response (Gemini 2.0 Flash)
 * 
 * 참조: Section 3.2.1 "Orchestrator", Section 3.4 "Generative Response"
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  calculateITE,
  extractHealthGoalFromQuery,
  searchFoodsByNutrient,
  nutrientKeyToSearchTags,
  type DailyRecord,
} from '../../../lib/causal-logic'; 
import mockData from '../../../data/mock-data.json';

export const runtime = 'edge';

// ─── Orchestrator: 하이브리드 프롬프트 생성 ──────────────────────────────
// 논문: "Retrieving + Transcribing + Prompt Engineering"
function buildOrchestratorPrompt(
  userQuery: string,
  personalITEs: Array<{
    nutrient_label: string;
    unit: string;
    outcome_label: string;
    ite_value: number;
    direction: string;
    causal_path: string;
  }>,
  recommendedFoods: Array<{
    name_ko: string;
    key_nutrients: Record<string, number>;
    description_ko: string;
  }>,
  healthGoal: string,
  userName: string
): string {
  // ── Transcribing: 수치 데이터를 텍스트로 변환 ────────────────────────
  const nutritionEffectsText = personalITEs
    .map(ite => {
      const sign = ite.ite_value > 0 ? '+' : '';
      return `• ${ite.nutrient_label}(${ite.unit}) → ${ite.outcome_label}: ITE = ${sign}${ite.ite_value.toFixed(4)} [${ite.direction === 'positive' ? '긍정적' : '부정적'} 인과 효과]\n  경로: ${ite.causal_path}`;
    })
    .join('\n');

  const foodListText = recommendedFoods
    .map(food => {
      const topNutrients = Object.entries(food.key_nutrients)
        .slice(0, 3)
        .map(([k, v]) => `${k}: ${v}`)
        .join(', ');
      return `• ${food.name_ko}: ${topNutrients} | ${food.description_ko}`;
    })
    .join('\n');

  // ── Prompt Engineering: Zero-Shot Chain-of-Thought ───────────────────
  // 논문: "Please provide a food recommendation based exclusively on the nutrition effects
  //       and the provided list of food ingredients"
  return `당신은 ChatDiet AI 영양 상담사입니다. 
사용자 ${userName}님의 개인 N-of-1 생체 데이터에서 추출한 인과 추론(Causal Inference) 결과를 바탕으로 맞춤형 식품 추천을 제공하세요.

## 사용자 건강 목표
"${userQuery}"
목표 건강 지표: ${healthGoal}

## [Personal Model] 개인 영양 효과 (ITE - 개별 처치 효과)
이 수치는 ChatDiet의 인과 발견 알고리즘이 ${userName}님의 실제 데이터에서 산출한 개인화된 영양-건강 인과 효과입니다.
이 데이터에만 의존하여 추천하세요. 일반적인 영양 지식은 보조적으로만 활용하세요.

${nutritionEffectsText}

## [Population Model] 추천 식품 영양 정보 데이터베이스
${foodListText}

## 답변 지침 (Zero-Shot Chain-of-Thought)
반드시 다음 형식으로 단계별로 답변하세요:

1. **인과 분석 결과**: "분석 결과, [영양소]가 귀하의 [건강 지표]를 [수치]만큼 증가/감소시키는 것으로 추론되었습니다" 형식 포함
2. **식품 추천**: Personal Model 결과에 기반하여 구체적 식품 1~2가지 추천 (반드시 위 식품 목록에서만 선택)
3. **섭취 방법**: 구체적인 섭취 방법 및 양
4. **주의사항**: 개인 데이터에서 확인된 주의 영양소 언급

응답은 친근하고 전문적인 한국어로 작성하세요. 추천 근거는 반드시 ITE 수치를 인용하세요.`;
}

// ─── API Route Handler ────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { messages, apiKey } = await req.json();

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Gemini API 키가 필요합니다.' },
        { status: 400 }
      );
    }

    const userQuery = messages[messages.length - 1]?.content || '';

    // ── Stage 1 & 2: Personal Model - ITE 계산 ──────────────────────────
    const records = mockData.daily_records as DailyRecord[];
    const profile = calculateITE(records);
    const healthGoal = extractHealthGoalFromQuery(userQuery);

    // ── Stage 4 Retrieval: 관련 ITE 필터링 ──────────────────────────────
    // 논문: "BM25 algorithm to retrieve nutrients that significantly impact [target outcome]"
    const relevantITEs = (profile.top_nutrients_for_outcome[healthGoal] || [])
      .filter(ite => Math.abs(ite.ite_value) > 0.5)
      .slice(0, 5);

    // ── Stage 3: Population Model - 식품 검색 ───────────────────────────
    const targetNutrientTags = relevantITEs.flatMap(ite =>
      nutrientKeyToSearchTags(ite.nutrient)
    );
    const recommendedFoods = searchFoodsByNutrient(targetNutrientTags, 5);

    // ── Stage 4 Orchestrator: 하이브리드 프롬프트 생성 ───────────────────
    const orchestratorPrompt = buildOrchestratorPrompt(
      userQuery,
      relevantITEs,
      recommendedFoods,
      healthGoal,
      mockData.user.name
    );

    // ── Stage 5: Generative Response - Gemini 2.0 Flash ─────────────────
    const geminiMessages = [
      ...messages.slice(0, -1).map((m: { role: string; content: string }) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      {
        role: 'user',
        parts: [{ text: orchestratorPrompt + '\n\n사용자 질문: ' + userQuery }],
      },
    ];

    // Gemini 2.0 Flash API 호출
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: geminiMessages,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024,
          },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ],
        }),
      }
    );

    if (!geminiResponse.ok) {
      const error = await geminiResponse.json();
      return NextResponse.json(
        { error: `Gemini API 오류: ${error.error?.message || '알 수 없는 오류'}` },
        { status: 500 }
      );
    }

    const geminiData = await geminiResponse.json();
    const responseText =
      geminiData.candidates?.[0]?.content?.parts?.[0]?.text ||
      '응답을 생성할 수 없습니다.';

    // ── 메타데이터: 분석 결과 함께 반환 ─────────────────────────────────
    return NextResponse.json({
      response: responseText,
      metadata: {
        health_goal: healthGoal,
        top_ite_results: relevantITEs.slice(0, 3),
        recommended_foods: recommendedFoods.slice(0, 3).map(f => f.name_ko),
        personal_summary: profile.personal_summary,
      },
    });
  } catch (error) {
    console.error('ChatDiet API Error:', error);
    return NextResponse.json(
      { error: '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' },
      { status: 500 }
    );
  }
}
