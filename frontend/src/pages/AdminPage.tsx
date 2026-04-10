import { useState, useEffect } from 'react';
import { UploadZone } from '../components/UploadZone';
import { useTemplates } from '../hooks/useApi';

export function AdminPage() {
  const { templates, loading, load, upload } = useTemplates();
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
    setName(file.name.replace('.pptx', ''));
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
          <h2>Neues Template hochladen</h2>
          <p>PPTX-Vorlage hochladen, CD-Regeln werden automatisch extrahiert</p>
        </div>
        <div className="card-body">
          {!showForm ? (
            <UploadZone
              onFile={handleFile}
              label="Master-PPTX hochladen"
              sublabel="CD-Vorlage als Referenz für Prüfungen"
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
                  placeholder="z.B. MHP Standard 2024"
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
                <div key={t.id} className="template-card">
                  <h3>{t.name}</h3>
                  {t.department && <div className="template-meta">{t.department}</div>}
                  <div className="template-meta" style={{ marginTop: 'var(--space-xs)' }}>
                    Erstellt: {new Date(t.created_at).toLocaleDateString('de-DE')}
                  </div>
                  <div className="template-rules">
                    {t.rules.allowed_fonts?.slice(0, 3).map(f => (
                      <span key={f} className="rule-tag">{f}</span>
                    ))}
                    {t.rules.color_palette?.slice(0, 4).map(c => (
                      <span key={c} className="rule-tag" style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px'
                      }}>
                        <span style={{
                          width: '10px', height: '10px', borderRadius: '2px',
                          background: `#${c}`, display: 'inline-block',
                          border: '1px solid rgba(0,0,0,0.1)',
                        }} />
                        #{c}
                      </span>
                    ))}
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
