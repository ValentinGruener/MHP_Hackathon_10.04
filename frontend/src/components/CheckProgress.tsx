interface Props {
  progress: Record<string, string>;
}

const ENGINE_NAMES: Record<string, string> = {
  haiku: 'KI-Analyse (visuell + inhaltlich)',
};

export function CheckProgressView({ progress }: Props) {
  return (
    <div className="progress-container">
      <div className="spinner" />
      <h3 style={{ marginBottom: 'var(--space-sm)' }}>Dokument wird geprueft...</h3>
      <p style={{ color: 'var(--text-tertiary)', fontSize: '14px' }}>
        PDF wird Seite fuer Seite abfotografiert und von der KI analysiert
      </p>
      <div className="progress-engines">
        {Object.entries(ENGINE_NAMES).map(([key, label]) => (
          <div key={key} className="engine-status">
            <div className={`dot ${progress[key] || 'pending'}`} />
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
