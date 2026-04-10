import { useState, useEffect } from 'react';
import { UploadZone } from '../components/UploadZone';
import { ScoreDisplay } from '../components/ScoreDisplay';
import { ErrorList } from '../components/ErrorList';
import { CheckProgressView } from '../components/CheckProgress';
import { useTemplates, usePresentations } from '../hooks/useApi';
import type { Template } from '../types/api';

type Step = 'select-template' | 'upload' | 'checking' | 'results';

export function CheckerPage() {
  const { templates, load: loadTemplates } = useTemplates();
  const { presentation, checking, progress, upload, check, correct, setPresentation } = usePresentations();
  const [step, setStep] = useState<Step>('select-template');
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [correctionResult, setCorrectionResult] = useState<{ applied: number; failed: number } | null>(null);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

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

  const handleCorrect = async (ids: number[]) => {
    if (!presentation) return;
    setCorrecting(true);
    try {
      const result = await correct(presentation.id, ids);
      setCorrectionResult(result.summary);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCorrecting(false);
    }
  };

  const handleReset = () => {
    setStep('select-template');
    setSelectedTemplate(null);
    setPresentation(null);
    setError(null);
    setCorrectionResult(null);
  };

  return (
    <div>
      <div className="page-header">
        <h2>CD-Prüfung</h2>
        <p>Präsentation gegen Corporate Design prüfen und korrigieren</p>
      </div>

      {error && (
        <div className="alert alert-error">
          <span>&#9888;</span> {error}
        </div>
      )}

      {correctionResult && (
        <div className="alert alert-success">
          <span>&#10004;</span> {correctionResult.applied} Korrekturen angewandt
          {correctionResult.failed > 0 && `, ${correctionResult.failed} fehlgeschlagen`}.
          {' '}<a href={`/api/presentations/${presentation?.id}/download`} style={{ color: 'inherit', fontWeight: 600 }}>
            Korrigierte PPTX herunterladen
          </a>
        </div>
      )}

      {/* Step 1: Select Template */}
      {step === 'select-template' && (
        <div className="card">
          <div className="card-header">
            <h2>CD-Template auswählen</h2>
            <p>Gegen welches Corporate Design soll geprüft werden?</p>
          </div>
          <div className="card-body">
            {templates.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">&#128203;</div>
                <p>Noch keine Templates vorhanden.</p>
                <p style={{ marginTop: 'var(--space-sm)' }}>
                  <a href="/admin" style={{ color: 'var(--mhp-accent)' }}>Template im Admin-Bereich hochladen</a>
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
                    <div className="template-rules">
                      {t.rules.allowed_fonts?.length > 0 && (
                        <span className="rule-tag">{t.rules.allowed_fonts.length} Fonts</span>
                      )}
                      {t.rules.color_palette?.length > 0 && (
                        <span className="rule-tag">{t.rules.color_palette.length} Farben</span>
                      )}
                      {t.rules.slide_layouts?.length > 0 && (
                        <span className="rule-tag">{t.rules.slide_layouts.length} Layouts</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 2: Upload PPTX */}
      {step === 'upload' && selectedTemplate && (
        <div className="card">
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2>Präsentation hochladen</h2>
              <p>Template: {selectedTemplate.name}</p>
            </div>
            <button className="btn btn-sm btn-secondary" onClick={() => setStep('select-template')}>
              Template ändern
            </button>
          </div>
          <div className="card-body">
            <UploadZone
              onFile={handleUpload}
              label="PPTX hierher ziehen"
              sublabel="Datei wird geprüft gegen das CD-Template"
            />
          </div>
        </div>
      )}

      {/* Step 3: Checking Progress */}
      {step === 'checking' && (
        <div className="card">
          <CheckProgressView progress={progress} />
        </div>
      )}

      {/* Step 4: Results */}
      {step === 'results' && presentation && presentation.check_results && (
        <>
          <div className="results-layout">
            <div className="card">
              <ScoreDisplay
                score={presentation.score || 0}
                coverage={presentation.coverage_percent || 100}
                errorCounts={presentation.error_counts || { critical: 0, warning: 0, info: 0 }}
              />
            </div>
            <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 'var(--space-lg)' }}>
              <div style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
                <div style={{ marginBottom: 'var(--space-md)' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>{presentation.filename}</strong>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-sm)' }}>
                  <span style={{ color: 'var(--text-tertiary)' }}>Folien:</span>
                  <span>{presentation.slide_count}</span>
                  <span style={{ color: 'var(--text-tertiary)' }}>Status:</span>
                  <span style={{ color: 'var(--color-success)' }}>Geprüft</span>
                </div>
                <div style={{ marginTop: 'var(--space-lg)', display: 'flex', gap: 'var(--space-sm)' }}>
                  <a
                    href={`/api/presentations/${presentation.id}/original`}
                    className="btn btn-sm btn-secondary"
                  >
                    Original
                  </a>
                  {presentation.corrected_pptx_path && (
                    <a
                      href={`/api/presentations/${presentation.id}/download`}
                      className="btn btn-sm btn-primary"
                    >
                      Korrigierte Version
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 'var(--space-lg)' }}>
            <div className="card-header">
              <h2>Gefundene Fehler</h2>
            </div>
            <div className="card-body">
              <ErrorList
                errors={presentation.check_results}
                onCorrect={handleCorrect}
                correcting={correcting}
              />
            </div>
          </div>

          <div style={{ marginTop: 'var(--space-lg)', textAlign: 'center' }}>
            <button className="btn btn-secondary" onClick={handleReset}>
              Neue Prüfung starten
            </button>
          </div>
        </>
      )}
    </div>
  );
}
