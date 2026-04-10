import { useState, useEffect } from 'react';
import { UploadZone } from '../components/UploadZone';
import { useTemplates } from '../hooks/useApi';

type UploadTab = 'pptx' | 'yaml';

export function AdminPage() {
  const { templates, loading, load, upload } = useTemplates();
  const [tab, setTab] = useState<UploadTab>('pptx');
  const [uploading, setUploading] = useState(false);
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => { load(); }, [load]);

  const handleFile = (file: File) => {
    setPendingFile(file);
    setName(file.name.replace(/\.(pptx|yaml|yml)$/i, ''));
    setShowForm(true);
    setError(null);
    setSuccess(null);
  };

  const handleUpload = async () => {
    if (!pendingFile || !name.trim()) return;
    setUploading(true);
    setError(null);
    try {
      if (tab === 'pptx') {
        await upload(pendingFile, name.trim(), department.trim() || undefined);
      } else {
        const fd = new FormData();
        fd.append('name', name.trim());
        if (department.trim()) fd.append('department', department.trim());
        fd.append('file', pendingFile);
        const res = await fetch('/api/templates/import-yaml', { method: 'POST', body: fd });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || 'YAML-Import fehlgeschlagen');
        }
      }
      setSuccess(`Template "${name}" erfolgreich ${tab === 'yaml' ? 'importiert' : 'hochgeladen'}`);
      setShowForm(false);
      setPendingFile(null);
      setName('');
      setDepartment('');
      load();
    } catch (e: any) {
      setError(e.message || 'Upload fehlgeschlagen');
    } finally {
      setUploading(false);
    }
  };

  const resetForm = () => {
    setShowForm(false);
    setPendingFile(null);
    setName('');
    setDepartment('');
    setError(null);
  };

  return (
    <div>
      <div className="page-header">
        <h2>CD-Templates verwalten</h2>
        <p>Corporate Design Vorlagen hochladen und Regeln konfigurieren</p>
      </div>

      {error && (
        <div className="alert alert-error">
          <span>&#9888;</span> {error}
        </div>
      )}
      {success && (
        <div className="alert alert-success">
          <span>&#10004;</span> {success}
        </div>
      )}

      {/* Upload Section */}
      <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
        <div className="card-header">
          <h2>Neues Template anlegen</h2>
          <p>CD-Regeln aus PPTX-Masterfolie extrahieren oder YAML-Config direkt importieren</p>
        </div>
        <div className="card-body">
          {/* Tab switcher */}
          <div className="tab-bar" style={{ maxWidth: '320px', marginBottom: 'var(--space-lg)' }}>
            <button
              className={`tab-btn ${tab === 'pptx' ? 'active' : ''}`}
              onClick={() => { setTab('pptx'); resetForm(); }}
            >
              PPTX-Vorlage
            </button>
            <button
              className={`tab-btn ${tab === 'yaml' ? 'active' : ''}`}
              onClick={() => { setTab('yaml'); resetForm(); }}
            >
              YAML-Config
            </button>
          </div>

          {!showForm ? (
            tab === 'pptx' ? (
              <UploadZone
                onFile={handleFile}
                label="Master-PPTX hochladen"
                sublabel="CD-Regeln (Fonts, Farben, Layouts) werden automatisch extrahiert"
                accept=".pptx"
              />
            ) : (
              <UploadZone
                onFile={handleFile}
                label="YAML-Config hochladen"
                sublabel="ci_guidelines.yaml — Schema v1.0 (Branding + Struktur + Content)"
                accept=".yaml,.yml"
              />
            )
          ) : (
            <div style={{ maxWidth: '420px' }}>
              <div style={{ marginBottom: 'var(--space-md)' }}>
                <div className="alert alert-info">
                  <span>&#128196;</span> {pendingFile?.name}
                </div>
              </div>
              <div style={{ marginBottom: 'var(--space-md)' }}>
                <label>Template-Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="z.B. MHP Standard 2024"
                />
              </div>
              <div style={{ marginBottom: 'var(--space-lg)' }}>
                <label>Abteilung / Kunde</label>
                <input
                  type="text"
                  value={department}
                  onChange={e => setDepartment(e.target.value)}
                  placeholder="z.B. Automotive (optional)"
                />
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                <button
                  className="btn btn-primary"
                  onClick={handleUpload}
                  disabled={uploading || !name.trim()}
                >
                  {uploading ? 'Wird verarbeitet...' : 'Template speichern'}
                </button>
                <button className="btn btn-secondary" onClick={resetForm}>
                  Abbrechen
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Template List */}
      <div className="card">
        <div className="card-header">
          <h2>Vorhandene Templates ({templates.length})</h2>
        </div>
        <div className="card-body">
          {loading ? (
            <div className="empty-state"><div className="spinner" /></div>
          ) : templates.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">&#128203;</div>
              <p>Noch keine Templates vorhanden</p>
            </div>
          ) : (
            <div className="template-grid">
              {templates.map(t => (
                <div key={t.id} className="template-card">
                  <h3>{t.name}</h3>
                  {t.department && <div className="template-meta">{t.department}</div>}
                  <div className="template-meta" style={{ marginTop: 'var(--space-xs)' }}>
                    {new Date(t.created_at).toLocaleDateString('de-DE')}
                  </div>
                  <div className="template-rules" style={{ marginTop: 'var(--space-md)' }}>
                    {t.rules.allowed_fonts?.slice(0, 3).map((f: string) => (
                      <span key={f} className="rule-tag">{f}</span>
                    ))}
                    {t.rules.color_palette?.slice(0, 4).map((c: string) => (
                      <span key={c} className="rule-tag" style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px'
                      }}>
                        <span style={{
                          width: '10px', height: '10px', borderRadius: '3px',
                          background: `#${c}`, display: 'inline-block',
                          border: '1px solid rgba(255,255,255,0.2)',
                        }} />
                        #{c}
                      </span>
                    ))}
                    {t.rules.required_slides?.length > 0 && (
                      <span className="rule-tag">{t.rules.required_slides.length} Pflichtfolien</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
