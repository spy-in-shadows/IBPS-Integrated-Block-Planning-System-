import { apiFetch } from './client';
import type { CleaningReportResponse, IngestCsvResponse, EmergencyTaskInput } from './types';

const BASE = import.meta.env.VITE_API_BASE_URL ?? '/api';

export async function ingestCsv(payload: {
  tasks_csv: string;
  blocks_csv?: string;
  trains_csv?: string;
}): Promise<IngestCsvResponse> {
  return apiFetch<IngestCsvResponse>('/ingest/csv', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchCleaningReport(): Promise<CleaningReportResponse> {
  return apiFetch<CleaningReportResponse>('/ingest/cleaning-report');
}

export async function resetToDemo(): Promise<{ status: string; message: string }> {
  return apiFetch<{ status: string; message: string }>('/ingest/reset-demo', {
    method: 'POST',
  });
}

export function getTemplateDownloadUrl(entity: 'tasks' | 'blocks' | 'trains'): string {
  return `${BASE}/ingest/templates/${entity}`;
}

export function getPlanScheduleCsvUrl(planType: 'optimized' | 'baseline' = 'optimized'): string {
  return `${BASE}/plans/export/csv?plan_type=${planType}`;
}

export function getSpecificPlanScheduleCsvUrl(planId: string): string {
  return `${BASE}/plans/${encodeURIComponent(planId)}/export/csv`;
}

export function getPlanExportJsonUrl(planId?: string): string {
  return planId
    ? `${BASE}/plans/${encodeURIComponent(planId)}/export/json`
    : `${BASE}/plans/export/json?plan_type=optimized`;
}

export async function downloadContingencyDiffCsv(task: EmergencyTaskInput): Promise<void> {
  const url = `${BASE}/plans/contingency/export/csv`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task }),
  });
  if (!resp.ok) {
    throw new Error(`Failed to download disruption diff: HTTP ${resp.status}`);
  }
  const blob = await resp.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = `ibps_contingency_diff_${task.task_id.toLowerCase()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(downloadUrl);
}
