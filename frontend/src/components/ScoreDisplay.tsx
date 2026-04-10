interface Props {
  score: number;
  coverage: number;
  errorCounts: { critical: number; warning: number; info: number };
}

export function ScoreDisplay({ score, coverage, errorCounts }: Props) {
  const scoreClass = score >= 80 ? 'score-good' : score >= 50 ? 'score-warn' : 'score-bad';
  const barColor = score >= 80 ? 'var(--color-success)' : score >= 50 ? 'var(--color-warning)' : 'var(--color-error)';

  return (
    <div className="score-display">
      <div className={`score-value ${scoreClass}`}>{Math.round(score)}%</div>
      <div className="score-label">CD-Konformität</div>
      <div className="score-bar">
        <div className="score-bar-fill" style={{ width: `${score}%`, background: barColor }} />
      </div>
      <div className="error-chips">
        {errorCounts.critical > 0 && (
          <span className="chip chip-critical">{errorCounts.critical} Kritisch</span>
        )}
        {errorCounts.warning > 0 && (
          <span className="chip chip-warning">{errorCounts.warning} Warnung</span>
        )}
        {errorCounts.info > 0 && (
          <span className="chip chip-info">{errorCounts.info} Info</span>
        )}
        {errorCounts.critical === 0 && errorCounts.warning === 0 && errorCounts.info === 0 && (
          <span className="chip" style={{ background: 'var(--color-success-bg)', color: 'var(--color-success)' }}>
            Keine Fehler gefunden
          </span>
        )}
      </div>
      {coverage < 100 && (
        <div className="coverage" style={{ marginTop: 'var(--space-md)' }}>
          Coverage: {Math.round(coverage)}% des Inhalts geprüft
        </div>
      )}
    </div>
  );
}
