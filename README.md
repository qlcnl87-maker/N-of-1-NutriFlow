> **논문 기반 구현**: *"ChatDiet: Empowering personalized nutrition-oriented food recommender chatbots through an LLM-augmented framework"* (Yang et al., 2024, Smart Health)

N-of-1 생체 데이터 기반 인과 추론(Causal Inference)으로 개인화된 영양 식품을 추천하는 AI 챗봇입니다.

---

## 아키텍처 (논문 Figure 1 기반)

```
사용자 질문
    ↓
[Stage 1&2] Personal Model
  · N-of-1 생체 데이터 로드 (mock-data.json)
  · 인과 발견 (Causal Discovery) — 피어슨 상관 + 선형 회귀
  · 인과 추론 (Causal Inference) — ITE 산출 (Pearl's Mediation Formula 모사)
    ↓
[Stage 3] Population Model
  · 식품 영양 지식 베이스 (15개 식품 DB)
  · BM25 기반 영양소-식품 매칭
    ↓
[Stage 4] Orchestrator
  · Retrieving: 쿼리 관련 ITE 필터링
  · Transcribing: 수치 데이터 → 텍스트 변환
  · Prompt Engineering: Zero-Shot Chain-of-Thought
    ↓
[Stage 5&6] Gemini 2.0 Flash + React UI
  · 설명 가능한 맞춤형 식품 추천 생성
  · ITE 수치 인용 ("분석 결과, OOO 영양소가 귀하의 깊은 수면을 X분 증가시키는 것으로 추론되었습니다")
```

---

## 빠른 시작

### 1. 설치
```bash
npm install
```

### 2. 개발 서버 실행
```bash
npm run dev
```

### 3. 브라우저 접속
```
http://localhost:3000
```

### 4. API 키 설정
- 우측 상단 **"⚙ API 키 설정"** 클릭
- [Google AI Studio](https://aistudio.google.com/app/apikey)에서 무료 Gemini API 키 발급
- 키 입력 후 저장

---

## Vercel 배포

```bash
# Vercel CLI 설치
npm i -g vercel

# 배포
vercel deploy
```

또는 GitHub 저장소를 Vercel에 연결하면 자동 배포됩니다.

---

## 파일 구조

```
chatdiet/
├── app/
│   ├── api/chat/
│   │   └── route.ts          # Stage 4&5: Orchestrator + Gemini API
│   ├── layout.tsx
│   └── page.tsx              # Stage 6: React Chat UI
├── lib/
│   └── causal-logic.ts       # Stage 1&2&3: 인과 추론 엔진 + 식품 DB
├── data/
│   └── mock-data.json        # 7일치 가상 N-of-1 생체 데이터
├── package.json
├── tsconfig.json
├── next.config.js
└── vercel.json
```

---

## 주요 기술

| 구성요소 | 기술 | 논문 대응 |
|---------|------|----------|
| 인과 발견 | 피어슨 상관 + 선형회귀 | SAM (Structural Agnostic Modeling) |
| 인과 추론 | ITE + 매개변수 분석 | DoWhy Library + Pearl's Mediation |
| 검색 | BM25 점수 기반 | BM25 Algorithm |
| LLM | Gemini 2.0 Flash | GPT-3.5-turbo |
| 프레임워크 | Next.js 14 (App Router) | - |

---

## 참조 논문

Yang, Z., Khatibi, E., Nagesh, N., Abbasian, M., Azimi, I., Jain, R., & Rahmani, A. M. (2024).  
**ChatDiet: Empowering personalized nutrition-oriented food recommender chatbots through an LLM-augmented framework.**  
*Smart Health, 32*, 100465. https://doi.org/10.1016/j.smhl.2024.100465
