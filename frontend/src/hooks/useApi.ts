import { useState, useCallback } from 'react';
import type { Template, Presentation, CheckProgress, CorrectionResult } from '../types/api';

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

  return { templates, loading, load, upload };
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
    setProgress({ rules: 'pending', languagetool: 'pending', haiku: 'pending' });

    return new Promise<void>((resolve, reject) => {
      const es = new EventSource(`${API}/presentations/${id}/check`);

      es.onmessage = (event) => {
        try {
          const data: CheckProgress = JSON.parse(event.data);

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
            // Reload full results
            fetchJson<Presentation>(`${API}/presentations/${id}`).then(p => {
              setPresentation(p);
              resolve();
            });
          }
        } catch {}
      };

      es.onerror = () => {
        es.close();
        setChecking(false);
        // Try loading results anyway
        fetchJson<Presentation>(`${API}/presentations/${id}`).then(p => {
          setPresentation(p);
          resolve();
        }).catch(reject);
      };
    });
  }, []);

  const correct = useCallback(async (id: number, resultIds: number[]) => {
    const result = await fetchJson<CorrectionResult>(`${API}/presentations/${id}/correct`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ check_result_ids: resultIds }),
    });
    // Reload presentation
    const p = await fetchJson<Presentation>(`${API}/presentations/${id}`);
    setPresentation(p);
    return result;
  }, []);

  return { presentation, checking, progress, upload, check, correct, setPresentation };
}
