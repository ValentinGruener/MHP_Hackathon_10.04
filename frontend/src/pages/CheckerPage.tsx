import { useState, useEffect, useRef } from 'react';
import { UploadZone } from '../components/UploadZone';
import { CheckProgressView } from '../components/CheckProgress';
import { useTemplates, usePresentations } from '../hooks/useApi';
import type { Template, CheckResult } from '../types/api';

type Step = 'select-template' | 'upload' | 'checking' | 'results';

const CATEGORIES: Record<string, string> = {
  all: 'Alle',
  stil: 'Stil',
  formalitaeten: 'Formalitaeten',
  struktur: 'Struktur',
  firmeninterne_begriffe: 'Begriffe',
};

function getCategory(err: CheckResult): string {
  const structureTypes = ['empty_content', 'missing_slide', 'missing_section', 'too_much_text', 'layout_violation'];
  const stilTypes = ['wrong_font', 'wrong_color', 'wrong_font_size', 'style_violation', 'wrong_tone'];
  const formalTypes = ['missing_disclaimer', 'missing_gendering', 'wrong_date_format'];
  const begriffeTypes = ['inconsistent_terms', 'forbidden_abbreviation', 'forbidden_phrase', 'placeholder_text'];

  if (structureTypes.includes(err.error_type)) return 'struktur';
  if (stilTypes.includes(err.error_type)) return 'stil';
  if (formalTypes.includes(err.error_type)) return 'formalitaeten';
  if (begriffeTypes.includes(err.error_type)) return 'firmeninterne_begriffe';
  return 'stil';
}

function severityColor(s: string): string {
  if (s === 'critical') return 'var(--color-error)';
  if (s === 'warning') return 'var(--color-warning)';
  return 'var(--color-info)';
}

function severityLabel(s: string): string {
  if (s === 'critical') return 'Kritisch';
  if (s === 'warning') return 'Warnung';
  return 'Info';
}

interface PageImage {
  page_number: number;
  image_base64: string;
  width: number;
  height: number;
}

export function CheckerPage() {
  const { templates, load: loadTemplates } = useTemplates();
  const { presentation, checking, progress, upload, check, setPresentation } = usePresentations();
  const [step, setStep] = useState<Step>('select-template');
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pages, setPages] = useState<PageImage[]>([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [activePage, setActivePage] = useState(1);
  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  // Load PDF pages when results are ready
  useEffect(() => {
    if (step === 'results' && presentation?.id) {
      fetch(`/api/presentations/${presentation.id}/pages`)
        .then(r => r.json())
        .then(data => setPages(data.pages || []))
        .catch(() => {});
    }
  }, [step, presentation?.id]);

  const handleTemplateSelect = (t: Template) => {
    setSelectedTemplate(t);
    setStep('upload');
    setError(null);
  };

  const handleUpload = async (file: File) => {
    if (!selectedTemplate) return;
    setError(null);
    try {
      const p = await upload(file, selectedTemplate.id);
      setStep('checking');
      await check(p.id);
      setStep('results');
    } catch (e: any) {
      setError(e.message || 'Upload fehlgeschlagen');
      setStep('upload');
    }
  };

  const handleReset = () => {
    setStep('select-template');
    setSelectedTemplate(null);
    setPresentation(null);
    setError(null);
    setPages([]);
    setActiveCategory('all');
    setActivePage(1);
  };

  const scrollToPage = (pageNum: number) => {
    setActivePage(pageNum);
    pageRefs.current[pageNum]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Filter errors
  const allErrors = (presentation?.check_results || []).filter(e => e.error_type !== 'ci_summary');
  const filteredErrors = activeCategory === 'all'
    ? allErrors
    : allErrors.filter(e => getCategory(e) === activeCategory);

  // Summary from AI
  const summaryResult = presentation?.check_results?.find(r => r.error_type === 'ci_summary');
  const overallFeedback = summaryResult?.description;
  let categoryScores: Record<string, number> = {};
  try {
    if (summaryResult?.suggestion) categoryScores = JSON.parse(summaryResult.suggestion);
  } catch {}

  // Error counts per category
  const catCounts: Record<string, number> = { all: allErrors.length };
  allErrors.forEach(e => {
    const cat = getCategory(e);
    catCounts[cat] = (catCounts[cat] || 0) + 1;
  });

  // Errors grouped by page
  const errorsByPage: Record<number, CheckResult[]> = {};
  filteredErrors.forEach(e => {
    if (!errorsByPage[e.slide_number]) errorsByPage[e.slide_number] = [];
    errorsByPage[e.slide_number].push(e);
  });

  const score = presentation?.score || 0;
  const scoreColor = score >= 80 ? 'var(--color-success)' : score >= 50 ? 'var(--color-warning)' : 'var(--color-error)';

  return (
    <div>
      {error && (
        <div className="alert alert-error">
          <span>&#9888;</span> {error}
        </div>
      )}

      {/* Step 1: Select Template */}
      {step === 'select-template' && (
        <>
          <div className="page-header">
            <h2>CI-Pruefung</h2>
            <p>PDF-Dokument gegen Corporate Identity Richtlinien pruefen</p>
          </div>
          <div className="card">
            <div className="card-header">
              <h2>CI-Template auswaehlen</h2>
              <p>Gegen welche CI-Richtlinie soll geprueft werden?</p>
            </div>
            <div className="card-body">
              {templates.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">&#128203;</div>
                  <p>Noch keine Templates vorhanden.</p>
                  <p style={{ marginTop: 'var(--space-sm)', color: 'var(--text-tertiary)' }}>
                    Admin muss zuerst ein CI-Template hochladen.
                  </p>
                </div>
              ) : (
                <div className="template-grid">
                  {templates.map(t => (
                    <div
                      key={t.id}
                      className={`template-card ${selectedTemplate?.id === t.id ? 'selected' : ''}`}
                      onClick={() => handleTemplateSelect(t)}
                    >
                      <h3>{t.name}</h3>
                      {t.department && <div className="template-meta">{t.department}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Step 2: Upload PDF */}
      {step === 'upload' && selectedTemplate && (
        <>
          <div className="page-header">
            <h2>CI-Pruefung</h2>
            <p>PDF-Dokument gegen Corporate Identity Richtlinien pruefen</p>
          </div>
          <div className="card">
            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2>PDF-Dokument hochladen</h2>
                <p>Template: {selectedTemplate.name}</p>
              </div>
              <button className="btn btn-secondary" onClick={() => setStep('select-template')}>
                Template aendern
              </button>
            </div>
            <div className="card-body">
              <UploadZone
                onFile={handleUpload}
                accept=".pdf"
                label="PDF hierher ziehen"
                sublabel="Dokument wird visuell und inhaltlich gegen die CI-Richtlinien geprueft"
              />
            </div>
          </div>
        </>
      )}

      {/* Step 3: Checking Progress */}
      {step === 'checking' && (
        <div className="card" style={{ marginTop: 'var(--space-xl)' }}>
          <CheckProgressView progress={progress} />
        </div>
      )}

      {/* Step 4: Results */}
      {step === 'results' && presentation && (
        <div className="results-page">
          {/* Top bar: Info */}
          <div className="results-top-bar">
            <div className="results-file-info">
              <strong>{presentation.filename}</strong>
              <span>Template: {selectedTemplate?.name}</span>
            </div>
            <div className="results-cat-scores">
              {Object.entries(CATEGORIES).filter(([k]) => k !== 'all').map(([key, label]) => (
                <div key={key} className="cat-score-mini">
                  <span className="cat-label">{label}</span>
                  <span className="cat-val" style={{
                    color: categoryScores[key] != null
                      ? (categoryScores[key] >= 80 ? 'var(--color-success)' :
                         categoryScores[key] >= 50 ? 'var(--color-warning)' : 'var(--color-error)')
                      : 'var(--text-tertiary)'
                  }}>
                    {categoryScores[key] != null ? `${categoryScores[key]}%` : '–'}
                  </span>
                </div>
              ))}
            </div>
            <button className="btn btn-secondary" onClick={handleReset} style={{ fontSize: '13px' }}>
              Neue Pruefung
            </button>
          </div>

          {/* AI Feedback */}
          {overallFeedback && (
            <div className="ai-feedback" style={{ margin: 'var(--space-md) 0' }}>
              <div className="ai-feedback-label">KI-Feedback</div>
              <p>{overallFeedback}</p>
            </div>
          )}

          {/* Category filter tabs */}
          <div className="filter-bar" style={{ marginBottom: 'var(--space-md)' }}>
            {Object.entries(CATEGORIES).map(([key, label]) => (
              <button
                key={key}
                className={`filter-btn ${activeCategory === key ? 'active' : ''}`}
                onClick={() => setActiveCategory(key)}
              >
                {label} ({catCounts[key] || 0})
              </button>
            ))}
          </div>

          {/* Main content: PDF viewer + error annotations */}
          <div className="pdf-results-layout">
            {/* PDF Viewer */}
            <div className="pdf-viewer">
              {pages.length === 0 ? (
                <div className="empty-state">
                  <div className="spinner" />
                  <p>PDF-Seiten werden geladen...</p>
                </div>
              ) : (
                pages.map(page => (
                  <div
                    key={page.page_number}
                    ref={el => { pageRefs.current[page.page_number] = el; }}
                    className={`pdf-page-container ${activePage === page.page_number ? 'active' : ''}`}
                    onClick={() => setActivePage(page.page_number)}
                  >
                    <div className="pdf-page-label">Seite {page.page_number}</div>
                    <img
                      src={`data:image/png;base64,${page.image_base64}`}
                      alt={`Seite ${page.page_number}`}
                      className="pdf-page-img"
                    />
                    {/* Error markers on the page */}
                    {(errorsByPage[page.page_number] || []).length > 0 && (
                      <div className="pdf-page-error-badge">
                        {(errorsByPage[page.page_number] || []).length}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Error annotations sidebar */}
            <div className="error-sidebar">
              {filteredErrors.length === 0 ? (
                <div className="empty-state" style={{ padding: 'var(--space-xl)' }}>
                  <p style={{ color: 'var(--color-success)' }}>Keine Fehler in dieser Kategorie</p>
                </div>
              ) : (
                filteredErrors.map((err, i) => (
                  <div
                    key={err.id || i}
                    className={`error-annotation ${activePage === err.slide_number ? 'highlight' : ''}`}
                    onClick={() => scrollToPage(err.slide_number)}
                  >
                    <div className="error-annotation-header">
                      <span className="error-severity-badge" style={{
                        background: severityColor(err.severity),
                      }}>
                        {severityLabel(err.severity)}
                      </span>
                      <span className="error-page-badge">S. {err.slide_number}</span>
                    </div>
                    <p className="error-desc">{err.description}</p>
                    {err.suggestion && (
                      <p className="error-suggestion">{err.suggestion}</p>
                    )}
                    {err.current_value && (
                      <div className="error-current">
                        <span className="error-current-label">Aktuell:</span> {err.current_value}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
