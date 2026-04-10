import type { CheckResult } from '../types/api';

interface Props {
  score: number;
  coverage: number;
  errorCounts: { critical: number; warning: number; info: number };
  checkResults?: CheckResult[];
}

interface CategoryScore {
  label: string;
  score: number;
  errors: number;
}

function parseCategoryScores(checkResults?: CheckResult[]): CategoryScore[] | null {
  if (!checkResults) return null;

  // Find the AI summary entry
  const summary = checkResults.find(
    r => r.error_type === 'ci_summary' && r.suggestion
  );

  if (!summary) return null;

  try {
    const scores = JSON.parse(summary.suggestion!);
    return [
      { label: 'Stil', score: scores.stil ?? 0, errors: checkResults.filter(r => r.error_type !== 'ci_summary' && getCat(r) === 'stil').length },
      { label: 'Formalitaeten', score: scores.formalitaeten ?? 0, errors: checkResults.filter(r => getCat(r) === 'formalitaeten').length },
      { label: 'Struktur', score: scores.struktur ?? 0, errors: checkResults.filter(r => getCat(r) === 'struktur').length },
      { label: 'Begriffe', score: scores.begriffe ?? 0, errors: checkResults.filter(r => getCat(r) === 'firmeninterne_begriffe').length },
    ];
  } catch {
    return null;
  }
}

function getCat(r: CheckResult): string {
  // Map error_type to category for non-haiku engines
  const structureTypes = ['empty_content', 'missing_slide', 'too_much_text'];
  const stilTypes = ['wrong_font', 'wrong_color', 'wrong_font_size', 'style_violation'];
  const formalTypes = ['missing_disclaimer', 'missing_gendering', 'wrong_date_format'];

  if (structureTypes.includes(r.error_type)) return 'struktur';
  if (stilTypes.includes(r.error_type)) return 'stil';
  if (formalTypes.includes(r.error_type)) return 'formalitaeten';
  if (r.error_type === 'inconsistent_terms' || r.error_type === 'forbidden_abbreviation') return 'firmeninterne_begriffe';
  return 'stil';
}

function scoreColor(score: number): string {
  if (score >= 80) return 'var(--color-success)';
  if (score >= 50) return 'var(--color-warning)';
  return 'var(--color-error)';
}

export function ScoreDisplay({ score, coverage, errorCounts, checkResults }: Props) {
  const scoreClass = score >= 80 ? 'score-good' : score >= 50 ? 'score-warn' : 'score-bad';
  const barColor = scoreColor(score);
  const categoryScores = parseCategoryScores(checkResults);

  // Find overall feedback from AI
  const summaryResult = checkResults?.find(r => r.error_type === 'ci_summary');
  const overallFeedback = summaryResult?.description;

  return (
    <div className="score-display">
      <div className={`score-value ${scoreClass}`}>{Math.round(score)}%</div>
      <div className="score-label">CD-Konformitaet</div>
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
          <span className="chip" style={{ background: 'var(--color-success-muted)', color: 'var(--color-success)' }}>
            Keine Fehler gefunden
          </span>
        )}
      </div>

      {/* Category Scores */}
      {categoryScores && (
        <div className="category-scores">
          {categoryScores.map(cat => (
            <div key={cat.label} className="category-score-item">
              <div className="category-score-header">
                <span className="category-score-label">{cat.label}</span>
                <span className="category-score-value" style={{ color: scoreColor(cat.score) }}>
                  {cat.score}%
                </span>
              </div>
              <div className="score-bar" style={{ height: '4px' }}>
                <div className="score-bar-fill" style={{ width: `${cat.score}%`, background: scoreColor(cat.score) }} />
              </div>
              {cat.errors > 0 && (
                <span className="category-error-count">{cat.errors} Fehler</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* AI Feedback */}
      {overallFeedback && (
        <div className="ai-feedback">
          <div className="ai-feedback-label">KI-Feedback</div>
          <p>{overallFeedback}</p>
        </div>
      )}

      {coverage < 100 && (
        <div className="coverage" style={{ marginTop: 'var(--space-md)' }}>
          Coverage: {Math.round(coverage)}% des Inhalts geprueft
        </div>
      )}
    </div>
  );
}
