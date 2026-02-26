/**
 * route.ts
 * ChatDiet Orchestrator + Generative Response
 * * 논문 구현:
 * - Stage 4: Orchestrator (BM25 Retrieval + Transcribing + Prompt Engineering)
 * - Stage 5: Generative Response (Gemini 1.5 Flash Stable)
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

function buildOrchestratorPrompt(
  userQuery: string,
  personalITEs: any[],
  recommendedFoods: any[],
  healthGoal: string,
  userName: string
): string {
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

  return `당신은 ChatDiet AI 영양 상담사입니다. 
사용자 ${userName}님의 개인 N-of-1 생체 데이터에서 추출한 인과 추론(Causal Inference) 결과를 바탕으로 맞춤형 식품 추천을 제공하세요.

## 사용자 건강 목표
"${userQuery}"
목표 건강 지표: ${healthGoal}

## [Personal Model] 개인 영양 효과 (ITE - 개별 처치 효과)
${nutritionEffectsText}

## [Population Model] 추천 식품 영양 정보 데이터베이스
${foodListText}

## 답변 지침
반드시 다음 형식으로 답변하세요:
1. 인과 분석 결과: ITE 수치를 인용하여 설명
2. 식품 추천: 제공된 목록에서 선택
3. 섭취 방법 및 주의사항

친근하고 전문적인 한국어로 작성하세요.`;
}

export async function POST(req: NextRequest) {
  try {
    const { messages, apiKey } = await req.json();

    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API 키가 필요합니다.' }, { status: 400 });
    }

    const userQuery = messages[messages.length - 1]?.content || '';
    const records = mockData.daily_records as DailyRecord[];
    const profile = calculateITE(records);
    const healthGoal = extractHealthGoalFromQuery(userQuery);

    const relevantITEs = (profile.top_nutrients_for_outcome[healthGoal] || [])
      .filter(ite => Math.abs(ite.ite_value) > 0.5)
      .slice(0, 5);

    const targetNutrientTags = relevantITEs.flatMap(ite => nutrientKeyToSearchTags(ite.nutrient));
    const recommendedFoods = searchFoodsByNutrient(targetNutrientTags, 5);

    const orchestratorPrompt = buildOrchestratorPrompt(
      userQuery,
      relevantITEs,
      recommendedFoods,
      healthGoal,
      mockData.user.name
    );

    const geminiMessages = [
      ...messages.slice(0, -1).map((m: any) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      {
        role: 'user',
        parts: [{ text: orchestratorPrompt + '\n\n사용자 질문: ' + userQuery }],
      },
    ];

    // ⭐ 수정된 부분: Stable 모델 주소 (gemini-1.5-flash)
    // Stage 5: Generative Response - 안정적인 v1 정식 버전으로 교체
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: geminiMessages,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1024,
          },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const error = await geminiResponse.json();
      return NextResponse.json({ error: `Gemini API 오류: ${error.error?.message}` }, { status: 500 });
    }

    const geminiData = await geminiResponse.json();
    const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '응답 생성 실패';

    return NextResponse.json({
      response: responseText,
      metadata: {
        health_goal: healthGoal,
        top_ite_results: relevantITEs.slice(0, 3),
        recommended_foods: recommendedFoods.slice(0, 3).map(f => f.name_ko),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
