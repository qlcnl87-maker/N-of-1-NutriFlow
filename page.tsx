'use client';

import { useState, useRef, useEffect } from 'react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  metadata?: {
    health_goal?: string;
    top_ite_results?: Array<{
      nutrient_label: string;
      unit: string;
      outcome_label: string;
      ite_value: number;
      direction: string;
    }>;
    recommended_foods?: string[];
  };
  timestamp: Date;
}

const SUGGESTED_QUERIES = [
  '깊은 수면을 늘리려면 어떤 음식을 먹어야 하나요?',
  'REM 수면을 개선하는 식품을 추천해 주세요',
  'HRV(심박 변이율)를 높이려면 무엇을 먹어야 하나요?',
  '컨디션과 준비도 점수를 높이는 식단이 궁금해요',
];

const DIRECTION_COLORS: Record<string, string> = {
  positive: '#4ade80',
  negative: '#f87171',
  neutral: '#94a3b8',
};

export default function ChatDietPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: `안녕하세요! 저는 **ChatDiet AI**입니다. 🌿\n\n귀하의 **7일간 생체 데이터(수면·HRV·식단)**를 인과 추론(Causal Inference)으로 분석하여, 개인에게 최적화된 영양 식품을 추천해 드립니다.\n\n논문 *"ChatDiet: Empowering personalized nutrition-oriented food recommender chatbots"* 의 아키텍처를 기반으로 구현되었습니다.\n\n어떤 건강 목표가 있으신가요?`,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState('');
  const [showApiModal, setShowApiModal] = useState(false);
  const [tempApiKey, setTempApiKey] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (content: string) => {
    if (!content.trim() || loading) return;

    if (!apiKey) {
      setShowApiModal(true);
      return;
    }

    const userMsg: Message = {
      role: 'user',
      content,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg].map(m => ({
            role: m.role,
            content: m.content,
          })),
          apiKey,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || '오류가 발생했습니다');
      }

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: data.response,
          metadata: data.metadata,
          timestamp: new Date(),
        },
      ]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '알 수 없는 오류';
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `⚠️ 오류: ${msg}`,
          timestamp: new Date(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const formatMessage = (content: string) => {
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br/>');
  };

  return (
    <div style={{ fontFamily: '"Pretendard", "Noto Sans KR", sans-serif', minHeight: '100vh', background: '#0a0e1a', color: '#e2e8f0' }}>
      {/* Header */}
      <header style={{
        borderBottom: '1px solid #1e293b',
        padding: '16px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'rgba(10,14,26,0.95)',
        backdropFilter: 'blur(12px)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: 40, height: 40, borderRadius: '10px',
            background: 'linear-gradient(135deg, #10b981, #059669)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, boxShadow: '0 0 20px rgba(16,185,129,0.4)'
          }}>🌿</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', letterSpacing: '-0.02em', color: '#f0fdf4' }}>
              ChatDiet AI
            </div>
            <div style={{ fontSize: '0.72rem', color: '#4ade80', letterSpacing: '0.05em' }}>
              PERSONALIZED NUTRITION • N-OF-1 CAUSAL INFERENCE
            </div>
          </div>
        </div>
        <button
          onClick={() => setShowApiModal(true)}
          style={{
            padding: '8px 16px', borderRadius: '8px',
            border: apiKey ? '1px solid #10b981' : '1px solid #475569',
            background: apiKey ? 'rgba(16,185,129,0.1)' : 'rgba(71,85,105,0.2)',
            color: apiKey ? '#4ade80' : '#94a3b8',
            fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600,
          }}
        >
          {apiKey ? '✓ API 연결됨' : '⚙ API 키 설정'}
        </button>
      </header>

      <div style={{ display: 'flex', height: 'calc(100vh - 73px)' }}>
        {/* Sidebar */}
        <aside style={{
          width: 280, flexShrink: 0,
          borderRight: '1px solid #1e293b',
          padding: '20px',
          overflowY: 'auto',
          background: 'rgba(15,20,35,0.6)',
          display: 'flex', flexDirection: 'column', gap: '20px'
        }}>
          {/* Architecture Badge */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(16,185,129,0.1), rgba(5,150,105,0.05))',
            border: '1px solid rgba(16,185,129,0.2)',
            borderRadius: '12px', padding: '16px',
          }}>
            <div style={{ fontSize: '0.7rem', color: '#4ade80', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 10 }}>
              CHATDIET ARCHITECTURE
            </div>
            {[
              { stage: '1–2', label: 'Personal Model', desc: 'ITE 인과 추론', color: '#10b981' },
              { stage: '3', label: 'Population Model', desc: '식품 지식 베이스', color: '#06b6d4' },
              { stage: '4', label: 'Orchestrator', desc: 'BM25 + 프롬프트 엔지니어링', color: '#a78bfa' },
              { stage: '5', label: 'Gemini 2.0 Flash', desc: '설명 가능한 응답 생성', color: '#f59e0b' },
            ].map(item => (
              <div key={item.stage} style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-start' }}>
                <div style={{
                  minWidth: 28, height: 22, borderRadius: '6px',
                  background: item.color + '22', border: `1px solid ${item.color}44`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.65rem', color: item.color, fontWeight: 700
                }}>
                  S{item.stage}
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#f1f5f9' }}>{item.label}</div>
                  <div style={{ fontSize: '0.65rem', color: '#64748b' }}>{item.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* User Profile */}
          <div style={{
            background: 'rgba(30,41,59,0.5)',
            borderRadius: '12px', padding: '16px',
            border: '1px solid #1e293b'
          }}>
            <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 10 }}>
              DEMO USER
            </div>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#e2e8f0', marginBottom: 4 }}>김건강</div>
            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>35세 · BMI 22.9</div>
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid #1e293b' }}>
              <div style={{ fontSize: '0.7rem', color: '#4ade80', marginBottom: 4 }}>📊 데이터 기간: 7일</div>
              <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Oura Ring + Cronometer</div>
            </div>
          </div>

          {/* Suggested Queries */}
          <div>
            <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 10 }}>
              추천 질문
            </div>
            {SUGGESTED_QUERIES.map((q, i) => (
              <button
                key={i}
                onClick={() => sendMessage(q)}
                disabled={loading || !apiKey}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '10px 12px', marginBottom: 6, borderRadius: '8px',
                  border: '1px solid #1e293b',
                  background: 'rgba(30,41,59,0.3)',
                  color: '#94a3b8', fontSize: '0.75rem',
                  cursor: loading || !apiKey ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease',
                  lineHeight: '1.4',
                }}
                onMouseEnter={e => {
                  if (!loading && apiKey) {
                    (e.target as HTMLElement).style.background = 'rgba(16,185,129,0.08)';
                    (e.target as HTMLElement).style.borderColor = 'rgba(16,185,129,0.3)';
                    (e.target as HTMLElement).style.color = '#d1fae5';
                  }
                }}
                onMouseLeave={e => {
                  (e.target as HTMLElement).style.background = 'rgba(30,41,59,0.3)';
                  (e.target as HTMLElement).style.borderColor = '#1e293b';
                  (e.target as HTMLElement).style.color = '#94a3b8';
                }}
              >
                {q}
              </button>
            ))}
          </div>
        </aside>

        {/* Main Chat Area */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {messages.map((msg, i) => (
              <div key={i} style={{
                display: 'flex',
                flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                gap: '12px', alignItems: 'flex-start',
                animation: 'fadeIn 0.3s ease',
              }}>
                {/* Avatar */}
                <div style={{
                  width: 36, height: 36, borderRadius: '10px', flexShrink: 0,
                  background: msg.role === 'assistant'
                    ? 'linear-gradient(135deg, #10b981, #059669)'
                    : 'linear-gradient(135deg, #6366f1, #4f46e5)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '16px',
                  boxShadow: msg.role === 'assistant'
                    ? '0 0 16px rgba(16,185,129,0.3)'
                    : '0 0 16px rgba(99,102,241,0.3)',
                }}>
                  {msg.role === 'assistant' ? '🌿' : '👤'}
                </div>

                <div style={{ maxWidth: '70%' }}>
                  {/* Message bubble */}
                  <div style={{
                    padding: '14px 18px', borderRadius: '16px',
                    background: msg.role === 'assistant'
                      ? 'rgba(15,23,42,0.8)'
                      : 'rgba(99,102,241,0.15)',
                    border: msg.role === 'assistant'
                      ? '1px solid #1e293b'
                      : '1px solid rgba(99,102,241,0.3)',
                    fontSize: '0.875rem', lineHeight: '1.7',
                    color: '#e2e8f0',
                  }}
                    dangerouslySetInnerHTML={{ __html: formatMessage(msg.content) }}
                  />

                  {/* ITE Metadata Panel */}
                  {msg.metadata?.top_ite_results && msg.metadata.top_ite_results.length > 0 && (
                    <div style={{
                      marginTop: 10, padding: '14px',
                      background: 'rgba(10,14,26,0.6)',
                      border: '1px solid rgba(16,185,129,0.2)',
                      borderRadius: '12px',
                    }}>
                      <div style={{ fontSize: '0.68rem', color: '#4ade80', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 10 }}>
                        📊 PERSONAL MODEL — 개인 ITE 인과 효과 분석
                      </div>
                      {msg.metadata.top_ite_results.map((ite, j) => (
                        <div key={j} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '6px 8px', marginBottom: 4,
                          background: 'rgba(15,23,42,0.5)', borderRadius: '6px',
                        }}>
                          <div>
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#e2e8f0' }}>
                              {ite.nutrient_label}
                            </span>
                            <span style={{ fontSize: '0.65rem', color: '#64748b', marginLeft: 4 }}>
                              → {ite.outcome_label}
                            </span>
                          </div>
                          <div style={{
                            fontSize: '0.75rem', fontWeight: 700, fontFamily: 'monospace',
                            color: DIRECTION_COLORS[ite.direction] || '#94a3b8',
                            background: DIRECTION_COLORS[ite.direction] + '15',
                            padding: '2px 8px', borderRadius: '4px',
                          }}>
                            {ite.ite_value > 0 ? '+' : ''}{ite.ite_value.toFixed(4)}
                          </div>
                        </div>
                      ))}
                      {msg.metadata.recommended_foods && (
                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #1e293b' }}>
                          <span style={{ fontSize: '0.65rem', color: '#64748b' }}>🍽 Population Model 추천: </span>
                          <span style={{ fontSize: '0.7rem', color: '#a5f3fc' }}>
                            {msg.metadata.recommended_foods.join(' · ')}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ fontSize: '0.65rem', color: '#334155', marginTop: 4, textAlign: msg.role === 'user' ? 'right' : 'left' }}>
                    {msg.timestamp.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}

            {/* Loading indicator */}
            {loading && (
              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '10px',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '16px', boxShadow: '0 0 16px rgba(16,185,129,0.3)',
                }}>🌿</div>
                <div style={{
                  padding: '14px 18px', borderRadius: '16px',
                  background: 'rgba(15,23,42,0.8)', border: '1px solid #1e293b',
                }}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <div style={{ fontSize: '0.75rem', color: '#4ade80' }}>인과 추론 분석 중</div>
                    {[0, 1, 2].map(n => (
                      <div key={n} style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: '#4ade80',
                        animation: `pulse 1.2s ${n * 0.2}s ease-in-out infinite`,
                      }} />
                    ))}
                  </div>
                  <div style={{ fontSize: '0.65rem', color: '#334155', marginTop: 4 }}>
                    Personal Model → Orchestrator → Gemini 2.0 Flash
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div style={{
            borderTop: '1px solid #1e293b', padding: '16px 24px',
            background: 'rgba(10,14,26,0.95)',
          }}>
            <div style={{
              display: 'flex', gap: '12px', alignItems: 'flex-end',
              background: 'rgba(15,23,42,0.8)', borderRadius: '14px',
              border: '1px solid #1e293b', padding: '12px 16px',
              transition: 'border-color 0.2s',
            }}
              onFocus={() => {}}
            >
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={apiKey ? '건강 목표나 궁금한 영양 정보를 입력하세요... (Enter로 전송)' : 'API 키를 먼저 설정해 주세요'}
                disabled={loading || !apiKey}
                rows={1}
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none',
                  color: '#e2e8f0', fontSize: '0.875rem', resize: 'none',
                  lineHeight: '1.5', fontFamily: 'inherit', maxHeight: '120px',
                  overflowY: 'auto',
                }}
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={loading || !input.trim() || !apiKey}
                style={{
                  width: 38, height: 38, borderRadius: '10px', border: 'none',
                  background: loading || !input.trim() || !apiKey
                    ? '#1e293b' : 'linear-gradient(135deg, #10b981, #059669)',
                  color: loading || !input.trim() || !apiKey ? '#334155' : '#fff',
                  fontSize: '16px', cursor: loading || !input.trim() || !apiKey ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, transition: 'all 0.15s ease',
                  boxShadow: !loading && input.trim() && apiKey ? '0 0 16px rgba(16,185,129,0.4)' : 'none',
                }}
              >
                ↑
              </button>
            </div>
            <div style={{ fontSize: '0.65rem', color: '#334155', marginTop: 8, textAlign: 'center' }}>
              ChatDiet은 의학적 진단을 대체하지 않습니다. 전문 의료진과 상담하세요.
            </div>
          </div>
        </main>
      </div>

      {/* API Key Modal */}
      {showApiModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
          backdropFilter: 'blur(4px)',
        }}>
          <div style={{
            background: '#0f172a', borderRadius: '20px',
            border: '1px solid #1e293b', padding: '32px', width: '440px',
            boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
          }}>
            <div style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 8, color: '#f0fdf4' }}>
              🔑 Gemini API 키 설정
            </div>
            <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: 20, lineHeight: '1.6' }}>
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer"
                style={{ color: '#4ade80' }}>Google AI Studio</a>에서 무료 API 키를 발급받아 입력하세요.
              키는 브라우저에만 저장되며 서버에 보관되지 않습니다.
            </div>
            <input
              type="password"
              value={tempApiKey}
              onChange={e => setTempApiKey(e.target.value)}
              placeholder="AIza..."
              style={{
                width: '100%', padding: '12px 16px', borderRadius: '10px',
                background: '#1e293b', border: '1px solid #334155',
                color: '#e2e8f0', fontSize: '0.875rem', outline: 'none',
                boxSizing: 'border-box', marginBottom: 16, fontFamily: 'monospace',
              }}
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => setShowApiModal(false)}
                style={{
                  flex: 1, padding: '12px', borderRadius: '10px',
                  background: 'transparent', border: '1px solid #334155',
                  color: '#94a3b8', cursor: 'pointer', fontSize: '0.875rem',
                }}
              >
                취소
              </button>
              <button
                onClick={() => {
                  if (tempApiKey.trim()) {
                    setApiKey(tempApiKey.trim());
                    setShowApiModal(false);
                    setTempApiKey('');
                  }
                }}
                style={{
                  flex: 2, padding: '12px', borderRadius: '10px',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  border: 'none', color: '#fff', cursor: 'pointer',
                  fontSize: '0.875rem', fontWeight: 600,
                  boxShadow: '0 0 20px rgba(16,185,129,0.3)',
                }}
              >
                저장하고 시작하기
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;600;700&display=swap');
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { transform: scale(0.7); opacity: 0.5; } 50% { transform: scale(1.2); opacity: 1; } }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #0a0e1a; }
        ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 3px; }
      `}</style>
    </div>
  );
}
