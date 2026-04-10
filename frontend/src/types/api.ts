export interface Template {
  id: number;
  name: string;
  department: string | null;
  rules: TemplateRules;
  created_at: string;
}

export interface TemplateRules {
  // YAML-based rules (flexible structure)
  [key: string]: any;
}

export interface Presentation {
  id: number;
  template_id: number | null;
  filename: string;
  status: 'uploading' | 'parsing' | 'checking' | 'done' | 'error';
  score: number | null;
  coverage_percent: number | null;
  slide_count: number | null;
  corrected_pptx_path: string | null;
  uploaded_at: string;
  check_results?: CheckResult[];
  error_counts?: { critical: number; warning: number; info: number };
}

export interface CheckResult {
  id: number;
  slide_number: number;
  engine: 'rules' | 'languagetool' | 'haiku';
  error_type: string;
  severity: 'critical' | 'warning' | 'info';
  element_id: string | null;
  position_x: number | null;
  position_y: number | null;
  position_w: number | null;
  position_h: number | null;
  description: string;
  suggestion: string | null;
  auto_fixable: boolean;
  current_value: string | null;
  expected_value: string | null;
}

export interface CheckProgress {
  engine: string;
  status: 'started' | 'completed' | 'error';
  slide_number?: number;
  total_slides?: number;
  errors_found?: number;
  message?: string;
}

export interface CorrectionResult {
  corrections: {
    check_result_id: number;
    before: string | null;
    after: string | null;
    status: 'applied' | 'failed';
  }[];
  summary: {
    total: number;
    applied: number;
    failed: number;
  };
}
