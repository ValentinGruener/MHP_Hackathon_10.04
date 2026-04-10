import { useState, useCallback } from 'react';
import type { Template, Presentation, CheckProgress } from '../types/api';

const API = '/api';

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Fehler');
  }
  return res.json();
}

export function useTemplates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTemplates(await fetchJson<Template[]>(`${API}/templates/`));
    } finally {
      setLoading(false);
    }
  }, []);

  const upload = useCallback(async (file: File, name: string, department?: string) => {
    const form = new FormData();
    form.append('file', file);
    form.append('name', name);
    if (department) form.append('department', department);
    const t = await fetchJson<Template>(`${API}/templates/`, { method: 'POST', body: form });
    setTemplates(prev => [t, ...prev]);
    return t;
  }, []);

  const remove = useCallback(async (id: number) => {
    await fetchJson<{ detail: string }>(`${API}/templates/${id}`, { method: 'DELETE' });
    setTemplates(prev => prev.filter(t => t.id !== id));
  }, []);

  return { templates, loading, load, upload, remove };
}

export function usePresentations() {
  const [presentation, setPresentation] = useState<Presentation | null>(null);
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState<Record<string, string>>({});

  const upload = useCallback(async (file: File, templateId: number) => {
    const form = new FormData();
    form.append('file', file);
    form.append('template_id', String(templateId));
    const p = await fetchJson<Presentation>(`${API}/presentations/`, { method: 'POST', body: form });
    setPresentation(p);
    return p;
  }, []);

  const check = useCallback(async (id: number) => {
    setChecking(true);
    setProgress({ haiku: 'pending' });

    return new Promise<void>((resolve, reject) => {
      const es = new EventSource(`${API}/presentations/${id}/check`);

      es.onmessage = (event) => {
        try {
          const data: CheckProgress = JSON.parse(event.data);
          console.log('[SSE]', data);

          if (data.engine !== 'orchestrator') {
            setProgress(prev => ({
              ...prev,
              [data.engine]: data.status === 'started' ? 'running' :
                             data.status === 'completed' ? 'done' : 'error',
            }));
          }

          if (data.engine === 'orchestrator' && data.status === 'completed') {
            es.close();
            setChecking(false);
            fetchJson<Presentation>(`${API}/presentations/${id}`).then(p => {
              setPresentation(p);
              resolve();
            });
          }

          if (data.engine === 'orchestrator' && data.status === 'error') {
            es.close();
            setChecking(false);
            reject(new Error(data.message || 'Pruefung fehlgeschlagen'));
          }
        } catch (err) {
          console.error('[SSE parse error]', err, event.data);
        }
      };

      es.onerror = (err) => {
        console.error('[SSE error]', err);
        // Don't close immediately — SSE reconnects automatically
        // Only close after a timeout
        setTimeout(() => {
          if (es.readyState === EventSource.CLOSED) return;
          es.close();
          setChecking(false);
          fetchJson<Presentation>(`${API}/presentations/${id}`).then(p => {
            setPresentation(p);
            resolve();
          }).catch(reject);
        }, 3000);
      };
    });
  }, []);

  return { presentation, checking, progress, upload, check, setPresentation };
}
