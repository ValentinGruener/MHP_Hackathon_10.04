import { useState, useEffect } from 'react';
import { UploadZone } from '../components/UploadZone';
import { useTemplates } from '../hooks/useApi';

export function AdminPage() {
  const { templates, loading, load, upload, remove } = useTemplates();
  const [uploading, setUploading] = useState(false);
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<number | null>(null);

  useEffect(() => { load(); }, [load]);

  const handleFile = (file: File) => {
    setPendingFile(file);
    setName(file.name.replace(/\.(yaml|yml)$/i, ''));
    setShowForm(true);
    setError(null);
  };

  const handleUpload = async () => {
    if (!pendingFile || !name.trim()) return;
    setUploading(true);
    setError(null);
    try {
      await upload(pendingFile, name.trim(), department.trim() || undefined);
      setSuccess(`Template "${name}" erfolgreich hochgeladen`);
      setShowForm(false);
      setPendingFile(null);
      setName('');
      setDepartment('');
    } catch (e: any) {
      setError(e.message || 'Upload fehlgeschlagen');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Template wirklich loeschen?')) return;
    try {
      await remove(id);
      setSuccess('Template geloescht');
      setSelectedTemplate(null);
    } catch (e: any) {
      setError(e.message || 'Loeschen fehlgeschlagen');
    }
  };

  const selectedTpl = templates.find(t => t.id === selectedTemplate);

  return (
    <div>
      <div className="page-header">
        <h2>CD-Templates verwalten</h2>
        <p>CI/CD-Vorlagen als YAML hochladen und Regeln konfigurieren</p>
      </div>

      {error && (
        <div className="alert alert-error">
          <span>&#9888;</span> {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>&#10005;</button>
        </div>
      )}
      {success && (
        <div className="alert alert-success">
          <span>&#10004;</span> {success}
          <button onClick={() => setSuccess(null)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>&#10005;</button>
        </div>
      )}

      {/* Upload Section */}
      <div className="card" style={{ marginBottom: 'var(--space-xl)' }}>
        <div className="card-header">
          <h2>Neues Template hochladen</h2>
          <p>YAML-Vorlage mit CI-Regeln hochladen</p>
        </div>
        <div className="card-body">
          {!showForm ? (
            <UploadZone
              onFile={handleFile}
              accept=".yaml,.yml"
              label="YAML-Vorlage hochladen"
              sublabel="CI-Guideline als .yaml oder .yml Datei"
            />
          ) : (
            <div style={{ maxWidth: '400px' }}>
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
                  placeholder="z.B. PPTX Praesentation"
                />
              </div>
              <div style={{ marginBottom: 'var(--space-lg)' }}>
                <label>Abteilung / Kunde</label>
                <input
                  type="text"
                  value={department}
                  onChange={e => setDepartment(e.target.value)}
                  placeholder="z.B. Automotive, optional"
                />
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
                <button
                  className="btn btn-primary"
                  onClick={handleUpload}
                  disabled={uploading || !name.trim()}
                >
                  {uploading ? 'Wird hochgeladen...' : 'Template speichern'}
                </button>
                <button className="btn btn-secondary" onClick={() => { setShowForm(false); setPendingFile(null); }}>
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
          <h2>Vorhandene Templates</h2>
        </div>
        <div className="card-body">
          {templates.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">&#128203;</div>
              <p>Noch keine Templates vorhanden</p>
            </div>
          ) : (
            <div className="template-grid">
              {templates.map(t => (
                <div
                  key={t.id}
                  className={`template-card ${selectedTemplate === t.id ? 'selected' : ''}`}
                  onClick={() => setSelectedTemplate(selectedTemplate === t.id ? null : t.id)}
                >
                  <h3>{t.name}</h3>
                  {t.department && <div className="template-meta">{t.department}</div>}
                  <div className="template-meta" style={{ marginTop: 'var(--space-xs)' }}>
                    Erstellt: {new Date(t.created_at).toLocaleDateString('de-DE')}
                  </div>
                  {selectedTemplate === t.id && (
                    <div style={{ marginTop: 'var(--space-md)', display: 'flex', gap: 'var(--space-sm)' }}>
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: '12px', padding: '6px 12px' }}
                        onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}
                      >
                        Loeschen
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* YAML Preview */}
      {selectedTpl && (
        <div className="card" style={{ marginTop: 'var(--space-xl)' }}>
          <div className="card-header">
            <h2>Vorlage: {selectedTpl.name}</h2>
          </div>
          <div className="card-body">
            <pre style={{
              background: 'var(--mhp-dark)',
              padding: 'var(--space-lg)',
              borderRadius: 'var(--radius-md)',
              overflow: 'auto',
              maxHeight: '500px',
              fontSize: '12px',
              lineHeight: '1.6',
              color: 'var(--text-secondary)',
              fontFamily: "'SF Mono', 'JetBrains Mono', monospace",
            }}>
              {JSON.stringify(selectedTpl.rules, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
