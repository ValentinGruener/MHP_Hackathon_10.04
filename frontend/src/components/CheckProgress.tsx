interface Props {
  progress: Record<string, string>;
}

const ENGINE_NAMES: Record<string, string> = {
  rules: 'Regelprüfung',
  languagetool: 'Rechtschreibung',
  haiku: 'KI-Analyse',
};

export function CheckProgressView({ progress }: Props) {
  return (
    <div className="progress-container">
      <div className="spinner" />
      <h3 style={{ marginBottom: 'var(--space-sm)' }}>Präsentation wird geprüft...</h3>
      <p style={{ color: 'var(--gray-500)', fontSize: '14px' }}>
        Drei Engines prüfen parallel
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
