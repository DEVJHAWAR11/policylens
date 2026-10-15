// Ask one question across 2–5 of the user's policies (compare coverage, spot gaps/overlaps)
import { useState } from 'react';
import { Loader2, Send, X } from 'lucide-react';
import { fetchApi } from '../../api';

export default function ComparePanel({ T, names, ids, onClose }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const ask = async () => {
    const q = question.trim();
    if (!q || loading) return;
    setLoading(true);
    setError('');
    setAnswer('');
    try {
      const data = await fetchApi('/query/multi', {
        method: 'POST',
        body: { question: q, policy_ids: ids },
        timeout: 90_000,
        retry: 1,
      });
      setAnswer(data.answer);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const f = { fontFamily: "'DM Sans', sans-serif" };
  const syne = { fontFamily: "'Syne', sans-serif" };

  return (
    <div style={{ padding: 20, borderRadius: 18, background: T.cardBg, border: `1px solid ${T.navActiveBrd}`, boxShadow: T.cardShadow, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <p style={{ ...syne, fontSize: 14, fontWeight: 600, color: T.t1, margin: 0 }}>Compare {ids.length} policies</p>
          <p style={{ ...f, fontSize: 12, color: T.t3, margin: '4px 0 0' }}>{names.join(' · ')}</p>
        </div>
        <button onClick={onClose} aria-label="Close comparison"
          style={{ width: 30, height: 30, borderRadius: 8, cursor: 'pointer', background: 'transparent', border: `1px solid ${T.cardBorder}`, color: T.t3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <X size={14} />
        </button>
      </div>

      <div style={{ display: 'flex', gap: 10, padding: '10px 14px', borderRadius: 14, background: T.inputBg, border: `1px solid ${T.inputBorder}` }}>
        <input
          type="text"
          value={question}
          maxLength={2000}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') ask(); }}
          placeholder="e.g. Which policy has the shorter waiting period?"
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 13, color: T.inputText, ...f }}
        />
        <button onClick={ask} disabled={!question.trim() || loading}
          style={{ width: 34, height: 34, borderRadius: 10, border: 'none', cursor: question.trim() && !loading ? 'pointer' : 'not-allowed', background: question.trim() && !loading ? T.sendActive : T.sendDisabled, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: question.trim() && !loading ? 1 : 0.4 }}>
          {loading ? <Loader2 size={15} className="iris-spinner" /> : <Send size={15} />}
        </button>
      </div>

      {error && <p role="alert" style={{ ...f, fontSize: 13, color: T.redClr, margin: 0 }}>{error}</p>}
      {answer && (
        <div style={{ ...f, fontSize: 13, lineHeight: 1.65, color: T.t1, whiteSpace: 'pre-wrap', padding: '12px 16px', borderRadius: 12, background: T.msgAiBg }}>
          {answer}
        </div>
      )}
    </div>
  );
}
