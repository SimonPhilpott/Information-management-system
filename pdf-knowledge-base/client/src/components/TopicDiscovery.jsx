import { Search, Lightbulb, Dice5 } from 'lucide-react';

export default function TopicDiscovery({ topics, suggestions, onTopicClick, onRefresh }) {
  const subjectKeys = Object.keys(topics || {});
  const hasTopis = subjectKeys.some(k => topics[k].length > 0);

  return (
    <aside className="topic-panel">
      <div className="topic-panel-header">
        <div className="topic-panel-title">
          <Search size={16} />
          Discover Topics
        </div>
      </div>

      <div className="topic-panel-content">
        {!hasTopis ? (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--text-muted)' }}>
            <Search size={32} style={{ marginBottom: '12px', opacity: 0.3 }} />
            <p style={{ fontSize: '13px', lineHeight: 1.6 }}>
              Topics will appear here once your PDFs are synced and indexed.
            </p>
          </div>
        ) : (
          <>
            {subjectKeys.map(subject => (
              <div key={subject} className="topic-subject-group">
                <div className="topic-subject-name">{subject}</div>
                <div className="topic-chips">
                  {topics[subject].map((topic, i) => (
                    <button
                      key={i}
                      className="topic-chip"
                      onClick={() => onTopicClick(topic.suggestedQuestion || `Tell me about ${topic.topic}`)}
                      title={topic.description || topic.topic}
                    >
                      {topic.topic}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        <button className="surprise-btn" onClick={onRefresh} id="surprise-btn">
          <Dice5 size={14} />
          Surprise me with a question
        </button>

        {suggestions && suggestions.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <div className="topic-subject-name" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Lightbulb size={12} />
              Suggested Questions
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  className="topic-chip"
                  onClick={() => onTopicClick(s.suggested_question)}
                  style={{ textAlign: 'left', whiteSpace: 'normal', lineHeight: 1.4, padding: '8px 12px' }}
                  title={`From: ${s.filename}`}
                >
                  {s.suggested_question}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
