/**
 * route.ts - Fixed Version
 * Edge runtime 제거, 모델명 안정화, 에러 메시지 개선
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  calculateITE,
  extractHealthGoalFromQuery,
  searchFoodsByNutrient,
  nutrientKeyToSearchTags,
  type DailyRecord,
} from '@/lib/causal-logic';
import mockData from '@/data/mock-data.json';

// ※ export const runtime = 'edge' 제거 → Node.js runtime 사용

function buildOrchestratorPrompt(
  userQuery: string,
  personalITEs: Array<{
    nutrient_label: string; unit: string;
    outcome_label: string; ite_value: number;
    direction: string; causal_path: string;
  }>,
  recommendedFoods: Array<{
    name_ko: string; key_nutrients: Record<string, number>; description_ko: string;
  }>,
  healthGoal: string,
  userName: string
): string {
  const nutritionEffectsText = personalITEs.map(ite => {
    const sign = ite.ite_value > 0 ? '+' : '';
    return `• ${ite.nutrient_label}(${ite.unit}) → ${ite.outcome_label}: ITE = ${sign}${ite.ite_value.toFixed(4)} [${ite.direction === 'positive' ? '긍정적' : '부정적'} 인과 효과]\n  경로: ${ite.causal_path}`;
  }).join('\n');

  const foodListText = recommendedFoods.map(food => {
    const topNutrients = Object.entries(food.key_nutrients).slice(0, 3)
      .map(([k, v]) => `${k}: ${v}`).join(', ');
    return `• ${food.name_ko}: ${topNutrients} | ${food.description_ko}`;
  }).join('\n');

  return `당신은 ChatDiet AI 영양 상담사입니다.
사용자 ${userName}님의 N-of-1 생체 데이터 인과 추론 결과를 바탕으로 맞춤형 식품을 추천하세요.

## 사용자 건강 목표
"${userQuery}" (지표: ${healthGoal})

## [Personal Model] 개인 ITE (개별 처치 효과)
${nutritionEffectsText}

## [Population Model] 추천 식품 DB
${foodListText}

## 답변 지침 (Zero-Shot Chain-of-Thought)
1. **인과 분석 결과**: "분석 결과, [영양소]가 귀하의 [건강 지표]를 [수치]만큼 증가시키는 것으로 추론되었습니다" 형식 필수 포함
2. **식품 추천**: 위 식품 목록에서만 1~2가지 추천
3. **섭취 방법**: 구체적 방법·양
4. **주의사항**: 부정적 ITE 영양소 언급

친근하고 전문적인 한국어로 답변하고, ITE 수치를 반드시 인용하세요.`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, apiKey } = body;

    if (!apiKey?.trim()) {
      return NextResponse.json(
        { error: 'API 키가 필요합니다. 우측 상단 ⚙ 버튼에서 설정하세요.' },
        { status: 400 }
      );
    }

    const cleanKey = apiKey.trim();
    const userQuery = messages[messages.length - 1]?.content || '';

    // Stage 1&2: ITE 계산
    const records = mockData.daily_records as DailyRecord[];
    const profile = calculateITE(records);
    const healthGoal = extractHealthGoalFromQuery(userQuery);

    // Stage 4 Retrieval
    const relevantITEs = (profile.top_nutrients_for_outcome[healthGoal] || [])
      .filter(ite => Math.abs(ite.ite_value) > 0.5).slice(0, 5);

    // Stage 3: Population Model
    const tags = relevantITEs.flatMap(ite => nutrientKeyToSearchTags(ite.nutrient));
    const recommendedFoods = searchFoodsByNutrient(tags, 5);

    // Stage 4 Orchestrator
    const prompt = buildOrchestratorPrompt(userQuery, relevantITEs, recommendedFoods, healthGoal, mockData.user.name);

    // Stage 5: Gemini 2.0 Flash (안정 모델명)
    const geminiMessages = [
      ...messages.slice(0, -1).map((m: { role: string; content: string }) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      { role: 'user', parts: [{ text: prompt + '\n\n사용자 질문: ' + userQuery }] },
    ];

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${cleanKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: geminiMessages,
          generationConfig: { temperature: 0.7, maxOutputTokens: 1500 },
        }),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      const msg = data?.error?.message || `HTTP ${res.status}`;
      const status = data?.error?.status || '';
      if (status === 'UNAUTHENTICATED' || msg.includes('API key') || msg.includes('key not valid')) {
        return NextResponse.json({
          error: `❌ API 키가 올바르지 않습니다.\n\n✅ 해결 방법:\n① aistudio.google.com/app/apikey 접속\n② "Create API Key" 클릭하여 새 키 발급\n③ ⚙ 버튼 클릭 후 새 키 입력\n\n발급된 키는 "AIza..."로 시작합니다.`,
        }, { status: 400 });
      }
      return NextResponse.json({ error: `Gemini 오류: ${msg}` }, { status: 500 });
    }

    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '응답 생성에 실패했습니다.';

    return NextResponse.json({
      response: responseText,
      metadata: {
        health_goal: healthGoal,
        top_ite_results: relevantITEs.slice(0, 3),
        recommended_foods: recommendedFoods.slice(0, 3).map(f => f.name_ko),
        personal_summary: profile.personal_summary,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '알 수 없는 오류';
    return NextResponse.json({ error: `서버 오류: ${msg}` }, { status: 500 });
  }
}
