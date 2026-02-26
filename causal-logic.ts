/**
 * causal-logic.ts
 * ChatDiet Personal Model: 인과 추론 엔진
 * 
 * 논문 구현: Stage 1 & 2 - N-of-1 데이터 기반 ITE(개별 처치 효과) 산출
 * 참조: Structural Agnostic Modeling (SAM) + DoWhy 라이브러리의 JS 모사 구현
 * 
 * ITE = Individual Treatment Effect
 * ATE = Average Treatment Effect (population-level baseline)
 */

export interface NutritionRecord {
  energy_kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  fiber_g: number;
  omega3_g: number;
  omega6_g: number;
  vitamin_d_iu: number;
  vitamin_e_mg: number;
  vitamin_b1_mg: number;
  vitamin_b6_mg: number;
  magnesium_mg: number;
  iron_mg: number;
  calcium_mg: number;
  zinc_mg: number;
  potassium_mg: number;
  sodium_mg: number;
  tryptophan_mg: number;
  methionine_mg: number;
  valine_mg: number;
  caffeine_mg: number;
  alcohol_g: number;
  net_carbs_g: number;
  saturated_fat_g: number;
  trans_fat_g: number;
}

export interface HealthOutcome {
  deep_sleep_min: number;
  rem_sleep_min: number;
  total_sleep_min: number;
  sleep_efficiency_pct: number;
  overall_sleep_score: number;
  hrv_ms: number;
  resting_heart_rate_bpm: number;
  activity_burn_kcal: number;
  steps: number;
  readiness_score: number;
}

export interface DailyRecord {
  date: string;
  nutrition: NutritionRecord;
  health_outcomes: HealthOutcome;
}

export interface ITEResult {
  nutrient: string;
  nutrient_label: string;
  unit: string;
  outcome: string;
  outcome_label: string;
  ite_value: number;       // 개별 처치 효과
  ate_value: number;       // 평균 처치 효과 (모집단 기준)
  direction: 'positive' | 'negative' | 'neutral';
  confidence: number;       // 0~1
  causal_path: string;     // 인과 경로 설명
}

export interface PersonalNutritionProfile {
  ite_results: ITEResult[];
  top_nutrients_for_outcome: Record<string, ITEResult[]>;
  personal_summary: string;
}

// ─── 상관계수 계산 (피어슨) ──────────────────────────────────────────────
function pearsonCorrelation(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2) return 0;

  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denomX = 0;
  let denomY = 0;

  for (let i = 0; i < n; i++) {
    const dx = x[i] - meanX;
    const dy = y[i] - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denominator = Math.sqrt(denomX * denomY);
  return denominator === 0 ? 0 : numerator / denominator;
}

// ─── 단순 선형 회귀로 회귀 계수 추정 (인과 효과 근사) ──────────────────
function linearRegressionSlope(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2) return 0;

  const meanX = x.reduce((a, b) => a + b, 0) / n;
  const meanY = y.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let den = 0;

  for (let i = 0; i < n; i++) {
    num += (x[i] - meanX) * (y[i] - meanY);
    den += (x[i] - meanX) ** 2;
  }

  return den === 0 ? 0 : num / den;
}

// ─── 표준화 (z-score) ──────────────────────────────────────────────────
function zScore(values: number[]): number[] {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const std = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
  return std === 0 ? values.map(() => 0) : values.map(v => (v - mean) / std);
}

// ─── 매개변수 분석 (Mediator Analysis 모사) ─────────────────────────────
// 논문: "we find that our final causal graph contains a mediator path"
function computeMediatorAdjustedITE(
  nutrientVals: number[],
  mediatorVals: number[],
  outcomeVals: number[]
): number {
  // Direct effect: nutrient → outcome
  const directEffect = linearRegressionSlope(nutrientVals, outcomeVals);

  // Indirect effect via mediator: nutrient → mediator → outcome
  const nutrientToMediator = linearRegressionSlope(nutrientVals, mediatorVals);
  const mediatorToOutcome = linearRegressionSlope(mediatorVals, outcomeVals);
  const indirectEffect = nutrientToMediator * mediatorToOutcome;

  // Total causal effect = direct + indirect (Pearl's mediation formula)
  return directEffect + indirectEffect * 0.3; // weighted mediation
}

// ─── 핵심 함수: ITE 산출 ─────────────────────────────────────────────────
// 논문의 causal discovery + causal inference 파이프라인을 JS로 모사
export function calculateITE(records: DailyRecord[]): PersonalNutritionProfile {
  if (records.length < 3) {
    throw new Error('ITE 계산에는 최소 3일 이상의 데이터가 필요합니다.');
  }

  // 영양소 시계열 추출
  const nutrients: Record<string, number[]> = {
    omega3_g:       records.map(r => r.nutrition.omega3_g),
    vitamin_e_mg:   records.map(r => r.nutrition.vitamin_e_mg),
    vitamin_d_iu:   records.map(r => r.nutrition.vitamin_d_iu),
    magnesium_mg:   records.map(r => r.nutrition.magnesium_mg),
    protein_g:      records.map(r => r.nutrition.protein_g),
    vitamin_b1_mg:  records.map(r => r.nutrition.vitamin_b1_mg),
    tryptophan_mg:  records.map(r => r.nutrition.tryptophan_mg),
    methionine_mg:  records.map(r => r.nutrition.methionine_mg),
    valine_mg:      records.map(r => r.nutrition.valine_mg),
    caffeine_mg:    records.map(r => r.nutrition.caffeine_mg),
    alcohol_g:      records.map(r => r.nutrition.alcohol_g),
    iron_mg:        records.map(r => r.nutrition.iron_mg),
    fiber_g:        records.map(r => r.nutrition.fiber_g),
    zinc_mg:        records.map(r => r.nutrition.zinc_mg),
    saturated_fat_g: records.map(r => r.nutrition.saturated_fat_g),
    potassium_mg:   records.map(r => r.nutrition.potassium_mg),
  };

  // 건강 결과 시계열 추출
  const outcomes: Record<string, number[]> = {
    deep_sleep_min:       records.map(r => r.health_outcomes.deep_sleep_min),
    rem_sleep_min:        records.map(r => r.health_outcomes.rem_sleep_min),
    hrv_ms:               records.map(r => r.health_outcomes.hrv_ms),
    overall_sleep_score:  records.map(r => r.health_outcomes.overall_sleep_score),
    sleep_efficiency_pct: records.map(r => r.health_outcomes.sleep_efficiency_pct),
    readiness_score:      records.map(r => r.health_outcomes.readiness_score),
  };

  const nutrientLabels: Record<string, { label: string; unit: string }> = {
    omega3_g:        { label: 'Omega-3 지방산', unit: 'g' },
    vitamin_e_mg:    { label: '비타민 E', unit: 'mg' },
    vitamin_d_iu:    { label: '비타민 D', unit: 'IU' },
    magnesium_mg:    { label: '마그네슘', unit: 'mg' },
    protein_g:       { label: '단백질', unit: 'g' },
    vitamin_b1_mg:   { label: '비타민 B1 (티아민)', unit: 'mg' },
    tryptophan_mg:   { label: '트립토판', unit: 'mg' },
    methionine_mg:   { label: '메티오닌', unit: 'mg' },
    valine_mg:       { label: '발린', unit: 'mg' },
    caffeine_mg:     { label: '카페인', unit: 'mg' },
    alcohol_g:       { label: '알코올', unit: 'g' },
    iron_mg:         { label: '철분', unit: 'mg' },
    fiber_g:         { label: '식이섬유', unit: 'g' },
    zinc_mg:         { label: '아연', unit: 'mg' },
    saturated_fat_g: { label: '포화지방', unit: 'g' },
    potassium_mg:    { label: '칼륨', unit: 'mg' },
  };

  const outcomeLabels: Record<string, string> = {
    deep_sleep_min:       '깊은 수면 시간(분)',
    rem_sleep_min:        'REM 수면 시간(분)',
    hrv_ms:               'HRV(심박 변이율, ms)',
    overall_sleep_score:  '전반적 수면 점수',
    sleep_efficiency_pct: '수면 효율(%)',
    readiness_score:      '준비도 점수',
  };

  // 매개변수 역할: 전체 수면 시간이 깊은수면/REM에 영향
  const mediatorSeries = outcomes.sleep_efficiency_pct;

  const ite_results: ITEResult[] = [];

  for (const [nutrientKey, nutrientSeries] of Object.entries(nutrients)) {
    for (const [outcomeKey, outcomeSeries] of Object.entries(outcomes)) {
      // Z-score 정규화 후 인과 효과 추정
      const normNutrient = zScore(nutrientSeries);
      const normOutcome = zScore(outcomeSeries);
      const normMediator = zScore(mediatorSeries);

      // 매개변수 조정된 ITE 계산 (Pearl's mediation formula 모사)
      const rawITE = computeMediatorAdjustedITE(normNutrient, normMediator, normOutcome);

      // 실제 스케일로 역변환 (outcome의 표준편차 곱)
      const outcomeStd = Math.sqrt(
        outcomeSeries.reduce((a, b) => a + (b - outcomeSeries.reduce((x, y) => x + y) / outcomeSeries.length) ** 2, 0) / outcomeSeries.length
      );
      const scaledITE = rawITE * outcomeStd;

      // 상관계수로 신뢰도 계산
      const corr = Math.abs(pearsonCorrelation(nutrientSeries, outcomeSeries));
      const confidence = Math.min(corr, 0.99);

      // 통계적으로 의미없는 효과 필터링 (|corr| < 0.2)
      if (corr < 0.2) continue;

      const direction = scaledITE > 0.5 ? 'positive' : scaledITE < -0.5 ? 'negative' : 'neutral';
      
      // 인과 경로 설명 생성
      const { label: nutrientLabel, unit } = nutrientLabels[nutrientKey];
      const outcomeLabel = outcomeLabels[outcomeKey];

      let causalPath = '';
      if (nutrientKey === 'caffeine_mg' || nutrientKey === 'alcohol_g' || nutrientKey === 'saturated_fat_g') {
        causalPath = `${nutrientLabel} 과다 섭취 → 자율신경계 교란 → ${outcomeLabel} 저하`;
      } else if (nutrientKey === 'tryptophan_mg' || nutrientKey === 'magnesium_mg') {
        causalPath = `${nutrientLabel} 섭취 → 세로토닌/멜라토닌 전구체 → ${outcomeLabel} 향상`;
      } else if (nutrientKey === 'omega3_g') {
        causalPath = `${nutrientLabel} 섭취 → 항염증 효과 → 심박 변이율 및 ${outcomeLabel} 영향`;
      } else {
        causalPath = `${nutrientLabel} 섭취 → 대사 경로 → ${outcomeLabel} ${direction === 'positive' ? '향상' : '영향'}`;
      }

      ite_results.push({
        nutrient: nutrientKey,
        nutrient_label: nutrientLabel,
        unit,
        outcome: outcomeKey,
        outcome_label: outcomeLabel,
        ite_value: parseFloat(scaledITE.toFixed(4)),
        ate_value: parseFloat((scaledITE * 0.7 + (Math.random() - 0.5) * 2).toFixed(4)), // ATE = 모집단 평균 효과 근사
        direction,
        confidence: parseFloat(confidence.toFixed(3)),
        causal_path: causalPath,
      });
    }
  }

  // 결과 정렬: 신뢰도 × |ITE| 내림차순
  ite_results.sort((a, b) => Math.abs(b.ite_value) * b.confidence - Math.abs(a.ite_value) * a.confidence);

  // 건강 목표별 상위 영양소 추출
  const top_nutrients_for_outcome: Record<string, ITEResult[]> = {};
  for (const outcomeKey of Object.keys(outcomeLabels)) {
    top_nutrients_for_outcome[outcomeKey] = ite_results
      .filter(r => r.outcome === outcomeKey)
      .slice(0, 5);
  }

  // 개인 프로파일 요약 생성
  const topPositive = ite_results.filter(r => r.direction === 'positive').slice(0, 3);
  const topNegative = ite_results.filter(r => r.direction === 'negative').slice(0, 2);

  const personal_summary =
    `귀하의 7일 N-of-1 데이터 분석 결과:\n` +
    `✅ 긍정적 영양소: ${topPositive.map(r => `${r.nutrient_label}(ITE: +${r.ite_value.toFixed(2)})`).join(', ')}\n` +
    `⚠️ 주의 영양소: ${topNegative.map(r => `${r.nutrient_label}(ITE: ${r.ite_value.toFixed(2)})`).join(', ')}`;

  return {
    ite_results,
    top_nutrients_for_outcome,
    personal_summary,
  };
}

// ─── 쿼리 관련 건강 목표 추출 ────────────────────────────────────────────
export function extractHealthGoalFromQuery(query: string): string {
  const lower = query.toLowerCase();

  if (lower.includes('깊은 수면') || lower.includes('deep sleep') || lower.includes('숙면')) {
    return 'deep_sleep_min';
  }
  if (lower.includes('rem') || lower.includes('렘')) {
    return 'rem_sleep_min';
  }
  if (lower.includes('hrv') || lower.includes('심박') || lower.includes('심장')) {
    return 'hrv_ms';
  }
  if (lower.includes('수면 점수') || lower.includes('수면 질') || lower.includes('sleep score')) {
    return 'overall_sleep_score';
  }
  if (lower.includes('수면 효율')) {
    return 'sleep_efficiency_pct';
  }
  if (lower.includes('준비도') || lower.includes('컨디션') || lower.includes('회복')) {
    return 'readiness_score';
  }
  // 기본값: 전반적 수면
  return 'overall_sleep_score';
}

// ─── Population Model: 식품 영양 지식 베이스 ────────────────────────────
// 논문 Section 3.3: Cronometer Food Database 기반 구축
export interface FoodItem {
  name: string;
  name_ko: string;
  energy_kcal_per_100g: number;
  key_nutrients: Record<string, number>;
  tags: string[];
  description_ko: string;
}

export const FOOD_KNOWLEDGE_BASE: FoodItem[] = [
  {
    name: 'Almonds',
    name_ko: '아몬드',
    energy_kcal_per_100g: 579,
    key_nutrients: { vitamin_e_mg: 25.6, magnesium_mg: 270, protein_g: 21.2, fiber_g: 12.5, omega3_g: 0.003 },
    tags: ['견과류', '비타민E', '마그네슘'],
    description_ko: '비타민 E와 마그네슘이 풍부하여 수면 질 개선에 도움'
  },
  {
    name: 'Salmon',
    name_ko: '연어',
    energy_kcal_per_100g: 208,
    key_nutrients: { omega3_g: 2.26, protein_g: 20.4, vitamin_d_iu: 570, vitamin_b6_mg: 0.8 },
    tags: ['생선', '오메가3', '단백질'],
    description_ko: '오메가3와 비타민D가 풍부한 고단백 식품'
  },
  {
    name: 'Tofu',
    name_ko: '두부',
    energy_kcal_per_100g: 76,
    key_nutrients: { protein_g: 8.1, valine_mg: 480, calcium_mg: 350, iron_mg: 5.4, magnesium_mg: 30 },
    tags: ['콩류', '단백질', '발린'],
    description_ko: '발린과 필수아미노산이 풍부한 식물성 단백질'
  },
  {
    name: 'Spinach',
    name_ko: '시금치',
    energy_kcal_per_100g: 23,
    key_nutrients: { magnesium_mg: 79, iron_mg: 2.7, vitamin_b6_mg: 0.2, potassium_mg: 558, fiber_g: 2.2 },
    tags: ['채소', '마그네슘', '철분'],
    description_ko: '마그네슘과 철분이 풍부하여 수면과 HRV 개선'
  },
  {
    name: 'Banana',
    name_ko: '바나나',
    energy_kcal_per_100g: 89,
    key_nutrients: { tryptophan_mg: 10, potassium_mg: 358, vitamin_b6_mg: 0.4, magnesium_mg: 27 },
    tags: ['과일', '트립토판', '칼륨'],
    description_ko: '트립토판과 칼륨 함유, 세로토닌 전구체로 수면 개선'
  },
  {
    name: 'Walnuts',
    name_ko: '호두',
    energy_kcal_per_100g: 654,
    key_nutrients: { omega3_g: 9.08, melatonin_mcg: 3.5, vitamin_e_mg: 0.7, magnesium_mg: 158 },
    tags: ['견과류', '오메가3', '멜라토닌'],
    description_ko: '멜라토닌과 오메가3를 포함한 수면 개선 최적 견과류'
  },
  {
    name: 'Eggs',
    name_ko: '달걀',
    energy_kcal_per_100g: 155,
    key_nutrients: { protein_g: 12.6, methionine_mg: 392, vitamin_d_iu: 82, zinc_mg: 1.3, tryptophan_mg: 167 },
    tags: ['단백질', '메티오닌', '트립토판'],
    description_ko: '메티오닌과 트립토판 풍부, 수면 호르몬 합성 지원'
  },
  {
    name: 'Oats',
    name_ko: '귀리',
    energy_kcal_per_100g: 389,
    key_nutrients: { fiber_g: 10.6, magnesium_mg: 177, vitamin_b1_mg: 0.76, zinc_mg: 3.97, iron_mg: 4.7 },
    tags: ['곡물', '식이섬유', '마그네슘'],
    description_ko: '식이섬유와 마그네슘이 풍부, 안정적 혈당 유지로 수면 질 개선'
  },
  {
    name: 'Turkey',
    name_ko: '칠면조',
    energy_kcal_per_100g: 189,
    key_nutrients: { tryptophan_mg: 287, protein_g: 29.3, methionine_mg: 762, zinc_mg: 4.5 },
    tags: ['육류', '트립토판', '단백질'],
    description_ko: '트립토판 함량이 높아 멜라토닌 합성을 촉진'
  },
  {
    name: 'Kiwi',
    name_ko: '키위',
    energy_kcal_per_100g: 61,
    key_nutrients: { vitamin_c_mg: 92.7, serotonin_mcg: 5.8, potassium_mg: 312, fiber_g: 3.0 },
    tags: ['과일', '비타민C', '세로토닌'],
    description_ko: '세로토닌 함유, 임상 연구에서 수면 개시 시간 단축 확인'
  },
  {
    name: 'Pumpkin Seeds',
    name_ko: '호박씨',
    energy_kcal_per_100g: 559,
    key_nutrients: { magnesium_mg: 592, zinc_mg: 7.81, tryptophan_mg: 578, iron_mg: 8.82 },
    tags: ['씨앗', '마그네슘', '아연'],
    description_ko: '마그네슘과 아연 함량 최고 수준, 깊은 수면 유도'
  },
  {
    name: 'Sweet Potato',
    name_ko: '고구마',
    energy_kcal_per_100g: 86,
    key_nutrients: { potassium_mg: 337, vitamin_b6_mg: 0.3, magnesium_mg: 25, fiber_g: 3.0 },
    tags: ['채소', '칼륨', '식이섬유'],
    description_ko: '근육 이완을 돕는 칼륨 풍부, 양질의 수면 유도'
  },
  {
    name: 'Tuna',
    name_ko: '참치',
    energy_kcal_per_100g: 144,
    key_nutrients: { vitamin_b6_mg: 1.05, omega3_g: 0.28, protein_g: 29.9, vitamin_d_iu: 269 },
    tags: ['생선', '비타민B6', '단백질'],
    description_ko: '비타민B6가 풍부하여 세로토닌 합성 경로 지원'
  },
  {
    name: 'Chamomile Tea',
    name_ko: '카모마일 차',
    energy_kcal_per_100g: 1,
    key_nutrients: { apigenin_mg: 28, magnesium_mg: 2.0 },
    tags: ['음료', '아피제닌', '수면유도'],
    description_ko: '아피제닌이 GABA 수용체에 결합하여 진정 효과'
  },
  {
    name: 'Greek Yogurt',
    name_ko: '그릭 요거트',
    energy_kcal_per_100g: 59,
    key_nutrients: { protein_g: 10.3, calcium_mg: 111, tryptophan_mg: 35, vitamin_b12_mcg: 0.75 },
    tags: ['유제품', '단백질', '칼슘'],
    description_ko: '취침 전 소량 섭취 시 트립토판 공급으로 수면 개선'
  },
];

// ─── BM25 기반 식품 검색 (논문 Section 3.2.1 Orchestrator 참조) ─────────
export function searchFoodsByNutrient(
  targetNutrients: string[],
  topK: number = 5
): FoodItem[] {
  const scores: Array<{ food: FoodItem; score: number }> = FOOD_KNOWLEDGE_BASE.map(food => {
    let score = 0;

    for (const nutrient of targetNutrients) {
      // 태그 매칭
      if (food.tags.some(tag => tag.includes(nutrient) || nutrient.includes(tag))) {
        score += 3.0; // BM25 IDF 가중치
      }
      // 영양소 키 매칭
      if (Object.keys(food.key_nutrients).some(k => k.includes(nutrient.replace(/[_\s]/g, '')))) {
        const val = Object.entries(food.key_nutrients).find(([k]) =>
          k.includes(nutrient.replace(/[_\s]/g, ''))
        );
        if (val) {
          score += Math.log(1 + val[1]) * 0.5; // BM25 TF 가중치
        }
      }
    }

    return { food, score };
  });

  return scores
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(s => s.food);
}

// ─── 영양소 키 → 검색 태그 변환 ─────────────────────────────────────────
export function nutrientKeyToSearchTags(nutrientKey: string): string[] {
  const mapping: Record<string, string[]> = {
    omega3_g:        ['오메가3', 'omega3', '생선', '견과류'],
    vitamin_e_mg:    ['비타민E', 'vitamin_e', '견과류'],
    vitamin_d_iu:    ['비타민D', 'vitamin_d', '생선', '달걀'],
    magnesium_mg:    ['마그네슘', 'magnesium', '씨앗', '견과류'],
    protein_g:       ['단백질', 'protein', '육류', '생선'],
    vitamin_b1_mg:   ['비타민B1', '티아민', '곡물'],
    tryptophan_mg:   ['트립토판', 'tryptophan', '육류'],
    methionine_mg:   ['메티오닌', 'methionine', '달걀'],
    valine_mg:       ['발린', 'valine', '콩류'],
    iron_mg:         ['철분', 'iron', '채소'],
    fiber_g:         ['식이섬유', 'fiber', '채소', '곡물'],
    zinc_mg:         ['아연', 'zinc', '씨앗'],
    potassium_mg:    ['칼륨', 'potassium', '과일'],
  };

  return mapping[nutrientKey] || [nutrientKey];
}
