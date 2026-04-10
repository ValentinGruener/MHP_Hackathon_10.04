import { useState } from 'react';
import type { CheckResult } from '../types/api';

interface Props {
  errors: CheckResult[];
  onCorrect: (ids: number[]) => void;
  correcting: boolean;
}

const ENGINE_LABELS: Record<string, string> = {
  rules: 'Regelprüfung',
  languagetool: 'Rechtschreibung',
  haiku: 'KI-Analyse',
};

export function ErrorList({ errors, onCorrect, correcting }: Props) {
  const [filter, setFilter] = useState<string>('all');
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const filtered = filter === 'all' ? errors :
    filter === 'fixable' ? errors.filter(e => e.auto_fixable) :
    errors.filter(e => e.severity === filter);

  const fixableErrors = errors.filter(e => e.auto_fixable);
  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFixable = () => {
    setSelected(new Set(fixableErrors.map(e => e.id)));
  };

  return (
    <div>
      <div className="filter-bar">
        {['all', 'critical', 'warning', 'info', 'fixable'].map(f => (
          <button
            key={f}
            className={`filter-btn ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? `Alle (${errors.length})` :
             f === 'critical' ? `Kritisch (${errors.filter(e => e.severity === 'critical').length})` :
             f === 'warning' ? `Warnung (${errors.filter(e => e.severity === 'warning').length})` :
             f === 'info' ? `Info (${errors.filter(e => e.severity === 'info').length})` :
             `Korrigierbar (${fixableErrors.length})`}
          </button>
        ))}
      </div>

      {fixableErrors.length > 0 && (
        <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-md)' }}>
          <button className="btn btn-sm btn-secondary" onClick={selectAllFixable}>
            Alle korrigierbaren auswählen
          </button>
          {selected.size > 0 && (
            <button
              className="btn btn-sm btn-primary"
              onClick={() => onCorrect(Array.from(selected))}
              disabled={correcting}
            >
              {correcting ? 'Korrigiere...' : `${selected.size} Fehler korrigieren`}
            </button>
          )}
        </div>
      )}

      <ul className="error-list">
        {filtered.map(error => (
          <li key={error.id} className="error-item">
            {error.auto_fixable && (
              <input
                type="checkbox"
                checked={selected.has(error.id)}
                onChange={() => toggleSelect(error.id)}
                onClick={e => e.stopPropagation()}
              />
            )}
            <div className={`error-severity ${error.severity}`} />
            <div className="error-content">
              <div className="error-title">{error.description}</div>
              <div className="error-detail">
                {ENGINE_LABELS[error.engine] || error.engine}
                {error.suggestion && ` · Vorschlag: ${error.suggestion}`}
              </div>
              {error.current_value && error.expected_value && (
                <div className="diff-container" style={{ marginTop: 'var(--space-sm)' }}>
                  <div className="diff-side">
                    <h4>Vorher</h4>
                    <div className="diff-value before">{error.current_value}</div>
                  </div>
                  <div className="diff-side">
                    <h4>Nachher</h4>
                    <div className="diff-value after">{error.expected_value}</div>
                  </div>
                </div>
              )}
            </div>
            <span className="error-slide">Folie {error.slide_number}</span>
          </li>
        ))}
      </ul>

      {filtered.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">&#10004;</div>
          <p>Keine Fehler in dieser Kategorie</p>
        </div>
      )}
    </div>
  );
}
