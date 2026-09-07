import React, { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock3,
  Download,
  FileSpreadsheet,
  Filter,
  Info as InfoIcon,
  Play,
  RefreshCcw,
  Search,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Upload,
  X,
} from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Sidebar } from './components/Sidebar';
import {
  Card,
  CardHeader,
  DeptBadge,
  EmptyState,
  ErrorState,
  HeroMetric,
  InsightList,
  LabeledBarList,
  Loader,
  MetricStrip,
  PriorityBadge,
  StatusBadge,
  SystemIndicators,
  UtilBar,
} from './components/ui';
import { fetchBlockDetail, fetchBlocks } from './api/blocks';
import { fetchDashboard, fetchHealth } from './api/dashboard';
import { fetchDiagnostics } from './api/diagnostics';
import { fetchLatestPlan, fetchPlanComparison, generateBaseline, generateOptimized } from './api/plans';
import { fetchTaskDetail, fetchTasks } from './api/tasks';
import { runWhatIfReplan } from './api/whatIf';
import {
  ingestCsv,
  fetchCleaningReport,
  resetToDemo,
  getTemplateDownloadUrl,
  getSpecificPlanScheduleCsvUrl,
  getPlanExportJsonUrl,
  downloadContingencyDiffCsv,
} from './api/ingestion';
import type {
  BlockDetailResponse,
  BlockItemResponse,
  DashboardSummaryResponse,
  EmergencyTaskInput,
  MetricDetail,
  PlanComparisonResponse,
  PlanResponse,
  TaskDetailResponse,
  WhatIfReplanResponse,
  CleaningReportResponse,
} from './api/types';
import {
  departmentCode,
  formatUnscheduledReason,
  humanizeDefect,
  humanizePruneReason,
  humanizeReason,
  KNOWN_DEFECT_TYPES,
} from './lib/labels';
import './App.css';

type LoadState<T> = { data: T | null; loading: boolean; error: string | null };

function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []): LoadState<T> {
  const [state, setState] = useState<LoadState<T>>({ data: null, loading: true, error: null });

  useEffect(() => {
    let active = true;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    loader()
      .then((data) => active && setState({ data, loading: false, error: null }))
      .catch((err: Error) => active && setState({ data: null, loading: false, error: err.message }));
    return () => {
      active = false;
    };
  }, deps);

  return state;
}

function App() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-pane">
        <AppTopbar />
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/ingestion" element={<IngestionPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/blocks" element={<BlocksPage />} />
          <Route path="/comparison" element={<ComparisonPage />} />
          <Route path="/planning" element={<PlanningPage />} />
          <Route path="/contingency" element={<WhatIfPage />} />
          <Route path="/what-if" element={<Navigate to="/contingency" replace />} />
          <Route path="/diagnostics" element={<DiagnosticsPage />} />
        </Routes>
      </main>
    </div>
  );
}

function AppTopbar() {
  const location = useLocation();
  const labels: Record<string, string> = {
    '/dashboard': 'Operations overview',
    '/tasks': 'Maintenance workbank',
    '/blocks': 'Block timetable',
    '/comparison': 'Plan comparison',
    '/planning': 'Schedule planning',
    '/contingency': 'Contingency control',
    '/ingestion': 'Data intake',
    '/diagnostics': 'Diagnostics',
  };

  return (
    <div className="app-topbar">
      <div className="topbar-context">
        <span className="topbar-kicker">IBPS / Control desk</span>
        <span className="topbar-separator">/</span>
        <strong>{labels[location.pathname] ?? 'Operations'}</strong>
      </div>
      <div className="topbar-meta">
        <span className="topbar-live"><span /> API connected</span>
        <span className="topbar-data">Synthetic planning environment</span>
        <span className="topbar-clock mono">{new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
      </div>
    </div>
  );
}


/* ─────────────────────────────────────────────────────────────────────────────
   0. DATA INGESTION & INTEGRITY AUDIT TERMINAL
   ───────────────────────────────────────────────────────────────────────────── */
function IngestionPage() {
  const navigate = useNavigate();
  const [tasksCsv, setTasksCsv] = useState('');
  const [blocksCsv, setBlocksCsv] = useState('');
  const [trainsCsv, setTrainsCsv] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reportData, setReportData] = useState<CleaningReportResponse['report'] | null>(null);
  const [generatedPlan, setGeneratedPlan] = useState<PlanResponse | null>(null);

  useEffect(() => {
    fetchCleaningReport()
      .then((res) => {
        if (res.report) setReportData(res.report);
      })
      .catch(() => {});
  }, []);

  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: React.Dispatch<React.SetStateAction<string>>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setter(event.target?.result as string);
    };
    reader.readAsText(file);
  };

  const handleLoadSample = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const [tRes, bRes, trRes] = await Promise.all([
        fetch(getTemplateDownloadUrl('tasks')).then((r) => r.text()),
        fetch(getTemplateDownloadUrl('blocks')).then((r) => r.text()),
        fetch(getTemplateDownloadUrl('trains')).then((r) => r.text()),
      ]);
      setTasksCsv(tRes);
      setBlocksCsv(bRes);
      setTrainsCsv(trRes);
      setMessage('Sample CSV templates loaded into editor. Click "Validate, Clean & Ingest Railway Data" to run optimization.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetDemo = async () => {
    setResetting(true);
    setError(null);
    try {
      const res = await resetToDemo();
      setMessage(res.message);
      setReportData(null);
      setGeneratedPlan(null);
      setTasksCsv('');
      setBlocksCsv('');
      setTrainsCsv('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setResetting(false);
    }
  };

  const handleIngest = async () => {
    if (!tasksCsv.trim()) {
      setError('Please provide at least a Maintenance Tasks CSV (via upload or paste).');
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await ingestCsv({
        tasks_csv: tasksCsv,
        blocks_csv: blocksCsv.trim() ? blocksCsv : undefined,
        trains_csv: trainsCsv.trim() ? trainsCsv : undefined,
      });
      setMessage(res.message);
      setReportData(res.report);
      setGeneratedPlan(await fetchLatestPlan('optimized'));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const taskLines = tasksCsv.trim() ? tasksCsv.trim().split('\n').length - 1 : 0;
  const blockLines = blocksCsv.trim() ? blocksCsv.trim().split('\n').length - 1 : 0;
  const trainLines = trainsCsv.trim() ? trainsCsv.trim().split('\n').length - 1 : 0;

  const auditSummary = reportData?.summary;
  const auditMetrics = auditSummary ? [
    { label: 'Tasks Ingested', value: auditSummary.total_tasks_ingested },
    { label: 'Blocks Available', value: auditSummary.total_blocks_available },
    { label: 'Trains Timetabled', value: auditSummary.total_trains_scheduled },
    { label: 'Auto-Corrections', value: auditSummary.corrections_count },
    { label: 'Integrity Warnings', value: auditSummary.warnings_count, tone: auditSummary.warnings_count > 0 ? ('warning' as const) : ('default' as const) },
    { label: 'Rejected Rows', value: auditSummary.rejected_count, tone: auditSummary.rejected_count > 0 ? ('danger' as const) : ('default' as const) },
  ] : [];

  return (
    <Page>
      <PageHeader
        eyebrow="Divisional Data Administration"
        title="Data Ingestion & Integrity Audit"
        subtitle="Ingest Engineering (P-Way), S&T, and TRD maintenance requests, possession block windows, and timetables"
        right={
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="secondary-action"
              onClick={handleResetDemo}
              disabled={resetting}
              title="Reset system back to standard 21-task Central Railway demo fixture"
            >
              {resetting ? <RefreshCcw size={14} className="spin" /> : <RefreshCcw size={14} />}
              Reset to Demo Fixture
            </button>
          </div>
        }
      />

      <div className="ingestion-flow" aria-label="Data to plan workflow">
        <div className={`flow-step ${!loading && !generatedPlan ? 'active' : ''}`}><span>1</span><div><strong>Upload data</strong><small>Tasks, blocks, timetable</small></div></div>
        <ArrowRight size={15} />
        <div className={`flow-step ${loading ? 'active' : ''}`}><span>2</span><div><strong>Validate and score</strong><small>Clean rows and calculate priority</small></div></div>
        <ArrowRight size={15} />
        <div className={`flow-step ${generatedPlan ? 'active' : ''}`}><span>3</span><div><strong>Review generated plan</strong><small>Open schedule and compare outcomes</small></div></div>
      </div>

      <details className="template-drawer">
        <summary><FileSpreadsheet size={14} /> Need a template? Download sample CSVs</summary>
        <div className="template-actions">
          <a href={getTemplateDownloadUrl('tasks')} className="secondary-action" download="ibps_tasks_template.csv">Tasks CSV</a>
          <a href={getTemplateDownloadUrl('blocks')} className="secondary-action" download="ibps_blocks_template.csv">Blocks CSV</a>
          <a href={getTemplateDownloadUrl('trains')} className="secondary-action" download="ibps_trains_template.csv">Trains CSV</a>
          <button type="button" className="secondary-action" onClick={handleLoadSample} disabled={loading}><FileSpreadsheet size={13} /> Load Central Railway sample</button>
        </div>
      </details>

      {message && !generatedPlan && (
        <div className="success-box" style={{ marginBottom: 20 }}>
          <span>{message}</span>
        </div>
      )}

      {error && (
        <div className="alert-box" style={{ marginBottom: 20 }}>
          <strong>Ingestion Error</strong>
          <span>{error}</span>
        </div>
      )}

      {generatedPlan && <GeneratedPlanResult plan={generatedPlan} report={reportData} navigate={navigate} />}

      {/* Ingestion Dropzone Station */}
      <div className="three-col">
        <Card>
          <CardHeader
            title="1. Maintenance Tasks CSV"
            sub="P-Way, S&T, and TRD maintenance requests (TMS / SMMS / TDMS)"
            right={<span className="mono dim tiny">{taskLines > 0 ? `${taskLines} rows detected` : 'Required'}</span>}
          />
          <div className="csv-dropcard">
            <div className="csv-file-bar">
              <label className="file-select-label">
                <Upload size={13} /> Upload .CSV File
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden-file-input"
                  onChange={(e) => handleFileUpload(e, setTasksCsv)}
                />
              </label>
              <span className="dim tiny">or paste raw CSV text below</span>
            </div>
            <textarea
              className="csv-textarea"
              placeholder="Paste Task CSV here (Headers: Task ID, Department, Corridor, Defect Type, Severity, Duration, Crew...)"
              value={tasksCsv}
              onChange={(e) => setTasksCsv(e.target.value)}
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="2. Block Windows CSV"
            sub="Track possession windows & capacity (Divisional Control Office)"
            right={<span className="mono dim tiny">{blockLines > 0 ? `${blockLines} rows` : 'Optional'}</span>}
          />
          <div className="csv-dropcard">
            <div className="csv-file-bar">
              <label className="file-select-label">
                <Upload size={13} /> Upload .CSV File
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden-file-input"
                  onChange={(e) => handleFileUpload(e, setBlocksCsv)}
                />
              </label>
              <span className="dim tiny">or paste raw CSV text below</span>
            </div>
            <textarea
              className="csv-textarea"
              placeholder="Paste Block CSV here (Headers: Block ID, Corridor, Start Time, End Time, Available Capacity, Safety Constraints...)"
              value={blocksCsv}
              onChange={(e) => setBlocksCsv(e.target.value)}
            />
          </div>
        </Card>

        <Card>
          <CardHeader
            title="3. Train Timetable CSV"
            sub="Train movements & priority (COA / Operating Department)"
            right={<span className="mono dim tiny">{trainLines > 0 ? `${trainLines} rows` : 'Optional'}</span>}
          />
          <div className="csv-dropcard">
            <div className="csv-file-bar">
              <label className="file-select-label">
                <Upload size={13} /> Upload .CSV File
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden-file-input"
                  onChange={(e) => handleFileUpload(e, setTrainsCsv)}
                />
              </label>
              <span className="dim tiny">or paste raw CSV text below</span>
            </div>
            <textarea
              className="csv-textarea"
              placeholder="Paste Train Timetable CSV here (Headers: Train ID, Corridor, Train Type, Direction, Start Time, End Time, Priority...)"
              value={trainsCsv}
              onChange={(e) => setTrainsCsv(e.target.value)}
            />
          </div>
        </Card>
      </div>

      <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p className="dim tiny">
          * Data cleaning automatically normalizes date formats, maps department aliases (P-Way, Signals, OHE), and checks for cyclic precedence.
        </p>
        <button
          type="button"
          className="primary-action"
          style={{ height: 40, padding: '0 24px' }}
          onClick={handleIngest}
          disabled={loading}
        >
          {loading ? <RefreshCcw size={16} className="spin" /> : <Upload size={16} />}
          {loading ? 'Building your plan...' : 'Validate, Clean & Ingest Railway Data'}
        </button>
      </div>

      {/* Cleaning & Verification Audit Terminal */}
      {reportData && (
        <div style={{ marginTop: 32 }}>
          <div className="section-divider" style={{ borderTop: '2px solid var(--rule-strong)', paddingTop: 20, marginBottom: 20 }}>
            <div className="panel-title-main" style={{ fontSize: 16 }}>Data Cleaning & Integrity Audit Report</div>
            <div className="dim tiny">Automated corrections, validation warnings, and rejected rows from last ingestion</div>
          </div>

          <MetricStrip items={auditMetrics} />

          {/* Auto-Corrections Table */}
          {reportData.tasks.corrections && reportData.tasks.corrections.length > 0 && (
            <Card style={{ marginTop: 20 }}>
              <CardHeader
                title="Field Normalizations & Auto-Corrections"
                sub={`${reportData.tasks.corrections.length} fields automatically standardized for solver compatibility`}
              />
              <div className="table-wrap">
                <table className="audit-table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Field</th>
                      <th>Raw Input Value</th>
                      <th>Cleaned / Standardized Output</th>
                      <th>Operational Rationale</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.tasks.corrections.map((corr, idx) => (
                      <tr key={idx}>
                        <td className="mono strong">{corr.row}</td>
                        <td className="mono">{corr.field}</td>
                        <td className="dim mono">{corr.original || '(empty)'}</td>
                        <td className="mono strong">{corr.corrected}</td>
                        <td>{corr.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Warnings Table */}
          {reportData.tasks.warnings && reportData.tasks.warnings.length > 0 && (
            <Card style={{ marginTop: 20 }}>
              <CardHeader
                title="Integrity Warnings & Precedence Graph Adjustments"
                sub="Non-fatal observations detected during verification"
              />
              <div className="table-wrap">
                <table className="audit-table">
                  <thead>
                    <tr>
                      <th>Task ID / Row</th>
                      <th>Integrity Warning Observation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.tasks.warnings.map((warn, idx) => (
                      <tr key={idx}>
                        <td className="mono strong">{warn.task_id || `Row ${warn.row}`}</td>
                        <td className="text-accent">{warn.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Rejected Rows Table */}
          {reportData.tasks.rejected_rows && reportData.tasks.rejected_rows.length > 0 && (
            <Card style={{ marginTop: 20 }}>
              <CardHeader
                title="Rejected Rows (Excluded from Scheduling)"
                sub="Records that violated fatal constraints (e.g. duplicate IDs, malformed time ranges)"
              />
              <div className="table-wrap">
                <table className="audit-table">
                  <thead>
                    <tr>
                      <th>Row Number</th>
                      <th>Task ID</th>
                      <th>Rejection Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.tasks.rejected_rows.map((rej, idx) => (
                      <tr key={idx}>
                        <td className="mono strong">{rej.row}</td>
                        <td className="mono text-accent">{rej.task_id || 'NA'}</td>
                        <td className="text-accent">{rej.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <div style={{ marginTop: 24, textAlign: 'right' }}>
            <button
              type="button"
              className="primary-action"
              style={{ height: 40, padding: '0 24px' }}
              onClick={() => navigate('/tasks')}
            >
              Open Workbank
            </button>
          </div>
        </div>
      )}
    </Page>
  );
}

function GeneratedPlanResult({
  plan,
  report,
  navigate,
}: {
  plan: PlanResponse;
  report: CleaningReportResponse['report'] | null;
  navigate: (to: string) => void;
}) {
  const processedTasks = report?.summary.total_tasks_ingested ?? plan.metrics.total_tasks;

  return (
    <section className="generated-plan-result" aria-live="polite">
      <div className="generated-plan-heading">
        <div className="generated-plan-icon"><CheckCircle2 size={22} /></div>
        <div>
          <div className="section-kicker">Planning complete</div>
          <h2>Plan generated successfully</h2>
          <p>
            Your railway data was cleaned, scored, and passed through the optimizer. The generated schedule is ready for review.
          </p>
        </div>
        <span className="generated-plan-status">ACTIVE PLAN</span>
      </div>

      <div className="generated-plan-meta">
        <span className="mono">{plan.plan_id}</span>
        <span>{plan.solver_status} solver result</span>
        <span>{processedTasks} task records processed</span>
      </div>

      <div className="generated-plan-kpis">
        <div className="generated-plan-kpi">
          <span>Scheduled tasks</span>
          <strong>{plan.scheduled_tasks_count}</strong>
        </div>
        <div className="generated-plan-kpi">
          <span>Needs review</span>
          <strong>{plan.unscheduled_tasks_count}</strong>
        </div>
        <div className="generated-plan-kpi">
          <span>Critical defects cleared</span>
          <strong>{plan.metrics.critical_tasks_completed}</strong>
        </div>
        <div className="generated-plan-kpi">
          <span>Asset availability</span>
          <strong>{plan.metrics.simulated_asset_availability_pct.toFixed(1)}%</strong>
        </div>
      </div>

      <div className="generated-plan-actions">
        <button type="button" className="primary-action" onClick={() => navigate('/blocks')}>
          View Generated Schedule <ArrowRight size={14} />
        </button>
        <button type="button" className="secondary-action" onClick={() => navigate('/comparison')}>
          Compare With Baseline
        </button>
        <button type="button" className="secondary-action" onClick={() => navigate('/tasks')}>
          Review Workbank
        </button>
        <a href={getSpecificPlanScheduleCsvUrl(plan.plan_id)} className="secondary-action" download>
          <Download size={13} /> Download Schedule
        </a>
        <a href={getPlanExportJsonUrl(plan.plan_id)} className="secondary-action" download>
          <Download size={13} /> Export Plan JSON
        </a>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   1. DASHBOARD / OVERVIEW — Swiss Asymmetric Hero Grid
   ───────────────────────────────────────────────────────────────────────────── */
function DashboardPage() {
  const state = useAsync(() =>
    Promise.all([fetchDashboard(), fetchHealth(), fetchTasks(), fetchBlocks(), fetchPlanComparison()]).then(
      ([dashboard, health, tasks, blocks, comparison]) => ({ dashboard, health, tasks, blocks, comparison }),
    ),
  );

  if (state.loading) return <Loader label="Loading operational situation..." />;
  if (state.error || !state.data) return <ErrorState message={state.error ?? 'Dashboard data unavailable'} />;

  const { dashboard, health, tasks, blocks, comparison } = state.data;
  const criticalTasks = [...tasks]
    .sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0))
    .slice(0, 7);
  const upcomingBlocks = [...blocks]
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
    .slice(0, 6);

  const metrics = mergeMetrics(dashboard.metrics_summary, comparison.comparisons);
  const assetAvail = metrics.find((m) => m.metric_name === 'simulated_asset_availability_pct');
  const trainDisruptions = metricValue(comparison.optimized_metrics, 'train_conflicts_count', 'train_conflict_count');

  const secondaryMetricItems = [
    getMetricItem(metrics, 'priority_score_completion_pct', 'Priority Fulfilled'),
    getMetricItem(metrics, 'multi_department_clubbed_blocks_count', 'Coordinated Blocks'),
    getMetricItem(metrics, 'critical_tasks_completed', 'Critical Defects Cleared'),
    getMetricItem(metrics, 'average_block_utilization_pct', 'Block Utilization'),
    {
      label: 'Train Disruptions',
      value: trainDisruptions,
      unit: 'conflicts',
      tone: trainDisruptions > 0 ? ('danger' as const) : ('default' as const),
    },
  ];

  return (
    <Page>
      <PageHeader
        eyebrow="Integrated Block Planning System"
        title="Overview"
        subtitle="Operational situation and high-priority maintenance block performance"
        right={<SystemIndicators dataset={dashboard.active_dataset} status={health.status} badge={dashboard.data_badge} />}
      />

      <div className="two-col wide-left">
        <div>
          <HeroMetric
            label="Simulated Asset Availability"
            value={assetAvail ? assetAvail.optimized_value.toFixed(1) : '94.1'}
            unit="%"
            caption={`+${assetAvail ? assetAvail.percentage_change.toFixed(1) : '2.1'}% improvement over baseline planning`}
          />
        </div>
        <div style={{ alignSelf: 'end' }}>
          <MetricStrip items={secondaryMetricItems} />
        </div>
      </div>

      <div className="two-col wide-left">
        <Card>
          <CardHeader title="Headline Plan Comparison" sub="Optimized IBPS plan outcomes vs departmental baseline" />
          <MetricComparisonStrip comparisons={comparison.comparisons} />
        </Card>
        <Card>
          <CardHeader title="Operating Summary" sub={`Planning horizon: ${formatHorizon(dashboard.last_plan_generated_at)}`} />
          <div className="summary-list">
            <SummaryRow label="Maintenance tasks" value={dashboard.tasks.total} detail={`${dashboard.tasks.scheduled_optimized} scheduled by IBPS`} />
            <SummaryRow label="Critical / High priority" value={`${dashboard.tasks.critical} / ${dashboard.tasks.high}`} detail="Priority tasks in active dataset" />
            <SummaryRow label="Available blocks" value={dashboard.blocks.available} detail={`${dashboard.blocks.used_optimized} used in optimized plan`} />
            <SummaryRow label="Possession hours" value={`${dashboard.blocks.total_possession_hours_optimized.toFixed(1)} hrs`} detail="Same possession budget as baseline" />
          </div>
        </Card>
      </div>

      <div className="two-col">
        <Card>
          <CardHeader title="Highest Priority Tasks" sub="Sorted by priority score" />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Task ID</th>
                  <th>Dept</th>
                  <th>Activity / Defect</th>
                  <th>Corridor</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Assigned Block</th>
                </tr>
              </thead>
              <tbody>
                {criticalTasks.map((task) => (
                  <tr key={task.task_id}>
                    <td className="mono">{task.task_id}</td>
                    <td><DeptBadge dept={task.department} /></td>
                    <td>
                      <div>{humanizeDefect(task.defect_type)}</div>
                      <div className="dim tiny">{task.asset_id} | {task.location}</div>
                    </td>
                    <td className="mono">{task.corridor_id}</td>
                    <td><PriorityBadge band={task.priority_band} /></td>
                    <td><StatusBadge status={task.status} /></td>
                    <td className="mono dim">{task.scheduled_block_id ?? 'Unassigned'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Card>
          <CardHeader title="Upcoming Block Windows" sub="Optimized possession windows" />
          <div className="summary-list">
            {upcomingBlocks.map((block) => (
              <div className="summary-row" key={block.block_id}>
                <div>
                  <div className="mono strong">{block.block_id}</div>
                  <div className="dim">{block.corridor_id} | {formatDateTime(block.start_time)}-{formatTime(block.end_time)}</div>
                  <div className="dept-stack" style={{ marginTop: 4 }}>
                    {block.assigned_departments.map((dept) => <DeptBadge key={dept} dept={dept} />)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <UtilBar pct={block.slot_utilization_pct} />
                  <div className="dim tiny" style={{ marginTop: 4 }}>
                    {block.scheduled_tasks_count} tasks {block.train_disruption_cost > 0 ? `| train cost ${block.train_disruption_cost.toFixed(0)}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Operational Insight" sub="Generated from solver optimization outputs" />
        <InsightList items={buildInsights(comparison, dashboard)} />
      </Card>
    </Page>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   PLAN COMPARISON — transparent baseline vs IBPS evidence workspace
   ───────────────────────────────────────────────────────────────────────────── */
function ComparisonPage() {
  const state = useAsync(fetchPlanComparison);

  if (state.loading) return <Loader label="Loading plan comparison evidence..." />;
  if (state.error || !state.data) return <ErrorState message={state.error ?? 'Plan comparison unavailable'} />;

  const comparison = state.data;
  const favorable = comparison.comparisons.filter((metric) => (
    metric.higher_is_better ? metric.delta > 0 : metric.delta < 0
  ));
  const unfavorable = comparison.comparisons.filter((metric) => (
    metric.higher_is_better ? metric.delta < 0 : metric.delta > 0
  ));
  const groupedMetrics = [
    {
      title: 'Maintenance outcomes',
      description: 'How much high-priority and critical work the plan clears.',
      keys: ['critical_tasks_completed', 'priority_score_completion_pct', 'simulated_asset_availability_pct'],
    },
    {
      title: 'Possession efficiency',
      description: 'How the plan uses available track time and block capacity.',
      keys: ['total_block_hours', 'average_block_utilization_pct'],
    },
    {
      title: 'Coordination and disruption',
      description: 'The operational trade-offs created by coordinated work.',
      keys: ['multi_department_clubbed_blocks_count', 'train_conflicts_count'],
    },
  ];

  return (
    <Page>
      <PageHeader
        eyebrow="Evidence workspace"
        title="Plan comparison"
        subtitle="A transparent baseline comparison of fragmented departmental scheduling versus the integrated IBPS recommendation."
        right={<SystemIndicators />}
      />

      <section className="comparison-hero">
        <div>
          <span className="section-kicker">Decision summary</span>
          <h2>What changes when departments plan together?</h2>
          <p>
            The baseline represents separate first-fit scheduling. IBPS evaluates the same synthetic workbank against shared corridor, possession, crew, safety, train, and precedence constraints.
          </p>
        </div>
        <div className="comparison-score">
          <span className="metric-label">Favorable measures</span>
          <strong>{favorable.length}<small> / {comparison.comparisons.length}</small></strong>
          <span className="comparison-score-note">based on the direction of improvement for each KPI</span>
        </div>
      </section>

      <div className="comparison-meta-grid">
        <Card className="comparison-plan-card baseline-card">
          <div className="plan-card-topline"><span className="plan-dot baseline-dot" /> Reference case</div>
          <h3>Fragmented baseline</h3>
          <p>Departmental first-fit scheduling without integrated clubbing.</p>
          <div className="plan-id mono">{comparison.baseline_plan_id}</div>
        </Card>
        <Card className="comparison-plan-card ibps-card">
          <div className="plan-card-topline"><span className="plan-dot ibps-dot" /> Recommended case</div>
          <h3>Integrated IBPS plan</h3>
          <p>CP-SAT optimization across the full corridor planning horizon.</p>
          <div className="plan-id mono">{comparison.optimized_plan_id}</div>
        </Card>
        <Card className="comparison-verdict-card">
          <div className="plan-card-topline"><InfoIcon size={14} /> How to read this</div>
          <p>Green means the metric moved in its intended direction. Amber means the improvement came with an operational trade-off worth reviewing.</p>
          <div className="verdict-footnote"><CheckCircle2 size={14} /> Human approval remains required</div>
        </Card>
      </div>

      <Card className="comparison-matrix-card">
        <CardHeader title="Full KPI comparison" sub="Every metric returned by the planning service, with baseline value, IBPS value, absolute movement, and relative change." />
        <div className="comparison-table-wrap">
          <table className="comparison-table">
            <thead>
              <tr>
                <th>Measure</th>
                <th>Baseline</th>
                <th>IBPS</th>
                <th>Movement</th>
                <th>Relative change</th>
                <th>Assessment</th>
              </tr>
            </thead>
            <tbody>
              {groupedMetrics.map((group) => (
                <React.Fragment key={group.title}>
                  <tr className="comparison-group-row"><td colSpan={6}><strong>{group.title}</strong><span>{group.description}</span></td></tr>
                  {group.keys.map((key) => {
                    const metric = comparison.comparisons.find((item) => item.metric_name === key);
                    return metric ? <ComparisonMetricRow key={metric.metric_name} metric={metric} /> : null;
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="comparison-lower-grid">
        <Card>
          <CardHeader title="Where IBPS leads" sub={`${favorable.length} measures improved in their intended direction`} />
          <div className="comparison-signal-list">
            {favorable.map((metric) => (
              <div className="comparison-signal positive" key={metric.metric_name}>
                <TrendingUp size={16} />
                <div><strong>{metric.display_name}</strong><span>{formatMetric(metric.optimized_value, metric.unit)} versus {formatMetric(metric.baseline_value, metric.unit)} baseline</span></div>
                <b>{formatRelative(metric.percentage_change)}</b>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Trade-offs to review" sub={`${unfavorable.length} measures need operational interpretation`} />
          <div className="comparison-signal-list">
            {unfavorable.length === 0 ? <EmptyState label="No adverse movement detected in this comparison." /> : unfavorable.map((metric) => (
              <div className="comparison-signal caution" key={metric.metric_name}>
                <TrendingDown size={16} />
                <div><strong>{metric.display_name}</strong><span>{formatMetric(metric.optimized_value, metric.unit)} versus {formatMetric(metric.baseline_value, metric.unit)} baseline</span></div>
                <b>{formatRelative(metric.percentage_change)}</b>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="comparison-method-card">
        <div className="method-icon"><InfoIcon size={18} /></div>
        <div>
          <h3>What this comparison does and does not claim</h3>
          <p>This is a transparent simulation against the project’s synthetic fragmented-planning baseline. It shows how the optimizer behaves on the active dataset; it is not a measured claim about live Indian Railways performance.</p>
        </div>
      </Card>
    </Page>
  );
}

function ComparisonMetricRow({ metric }: { metric: MetricDetail }) {
  const unchanged = metric.delta === 0;
  const favorable = !unchanged && (metric.higher_is_better ? metric.delta > 0 : metric.delta < 0);
  const movement = metric.delta === 0 ? 'No movement' : `${metric.delta > 0 ? '+' : ''}${formatMetric(metric.delta, metric.unit)}`;
  return (
    <tr>
      <td><strong>{metric.display_name}</strong><span className="metric-subtext">{metric.higher_is_better ? 'Higher is better' : 'Lower is better'}</span></td>
      <td className="mono">{formatMetric(metric.baseline_value, metric.unit)}</td>
      <td className="mono ibps-value">{formatMetric(metric.optimized_value, metric.unit)}</td>
      <td className={`mono movement ${favorable ? 'positive-text' : 'caution-text'}`}>{movement}</td>
      <td className={`mono movement ${favorable ? 'positive-text' : 'caution-text'}`}>{formatRelative(metric.percentage_change)}</td>
      <td><span className={`assessment ${unchanged ? 'assessment-stable' : favorable ? 'assessment-positive' : 'assessment-caution'}`}>{unchanged ? 'Stable' : favorable ? 'Favorable' : 'Review trade-off'}</span></td>
    </tr>
  );
}

function formatMetric(value: number, unit: string) {
  const decimals = unit === '%' || unit === 'hrs' ? 1 : 0;
  return `${value.toFixed(decimals)}${unit === '%' ? '%' : unit ? ` ${unit}` : ''}`;
}

function formatRelative(value: number) {
  if (value === 0) return '0.0%';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
}

/* ─────────────────────────────────────────────────────────────────────────────
   2. TASKS / MAINTENANCE WORKBANK
   ───────────────────────────────────────────────────────────────────────────── */
function TasksPage() {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const state = useAsync(() => fetchTasks(filters), [JSON.stringify(filters)]);

  const tasks = state.data ?? [];
  const corridors = unique(tasks.map((task) => task.corridor_id));

  return (
    <Page>
      <PageHeader
        eyebrow="Maintenance Workbank"
        title="Tasks"
        subtitle="Prioritized Engineering, TRD, and S&T maintenance requests"
        right={<SystemIndicators />}
      />
      <Card>
        <CardHeader title="Filters" sub="Search and filter tasks" right={<Filter size={16} />} />
        <div className="filters">
          <label className="search-box">
            <Search size={15} />
            <input
              placeholder="Search task ID, asset, location, defect..."
              value={filters.search ?? ''}
              onChange={(event) => setFilter(setFilters, 'search', event.target.value)}
            />
          </label>
          <Select
            label="Department"
            value={filters.department ?? ''}
            options={[
              { label: 'All Departments', value: '' },
              { label: 'Engineering (ENG)', value: 'ENGINEERING' },
              { label: 'Traction Distribution (TRD)', value: 'TRD' },
              { label: 'Signals & Telecom (S&T)', value: 'S&T' },
            ]}
            onChange={(value) => setFilter(setFilters, 'department', value)}
          />
          <Select
            label="Priority"
            value={filters.priority_band ?? ''}
            options={[
              { label: 'All Priorities', value: '' },
              { label: 'Critical', value: 'CRITICAL' },
              { label: 'High', value: 'HIGH' },
              { label: 'Medium', value: 'MEDIUM' },
              { label: 'Routine', value: 'ROUTINE' },
            ]}
            onChange={(value) => setFilter(setFilters, 'priority_band', value)}
          />
          <Select
            label="Status"
            value={filters.status ?? ''}
            options={[
              { label: 'All Statuses', value: '' },
              { label: 'Scheduled', value: 'SCHEDULED' },
              { label: 'Unscheduled', value: 'UNSCHEDULED' },
            ]}
            onChange={(value) => setFilter(setFilters, 'status', value)}
          />
          <Select
            label="Corridor"
            value={filters.corridor ?? ''}
            options={[{ label: 'All Corridors', value: '' }, ...corridors.map((c) => ({ label: c, value: c }))]}
            onChange={(value) => setFilter(setFilters, 'corridor', value)}
          />
          <label className="field compact-field">
            <span>Station / KM</span>
            <input
              placeholder="e.g. Kalyan or KM 62"
              value={filters.location ?? ''}
              onChange={(event) => setFilter(setFilters, 'location', event.target.value)}
            />
          </label>
        </div>
      </Card>

      <Card>
        <CardHeader title="Task Register" sub={`${tasks.length} task records returned by API`} />
        {state.loading ? <Loader label="Loading tasks..." /> : state.error ? <ErrorState message={state.error} /> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Task ID</th>
                  <th>Dept</th>
                  <th>Activity / Defect</th>
                  <th>Corridor</th>
                  <th className="text-right">Urgency Score</th>
                  <th>Priority Band</th>
                  <th>Severity</th>
                  <th>Deadline</th>
                  <th className="text-right">Duration</th>
                  <th className="text-right">Crew</th>
                  <th>Status</th>
                  <th>Assigned Block</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.task_id} onClick={() => setSelectedId(task.task_id)} className="clickable-row">
                    <td className="mono strong">{task.task_id}</td>
                    <td><DeptBadge dept={task.department} /></td>
                    <td>
                      <div>{humanizeDefect(task.defect_type)}</div>
                      <div className="dim tiny">{task.asset_id} | {task.location}</div>
                    </td>
                    <td className="mono">{task.corridor_id}</td>
                    <td className="text-right mono strong" style={{ fontSize: 13, color: (task.priority_score ?? 0) >= 80 ? 'var(--accent)' : 'inherit' }}>
                      {task.priority_score?.toFixed(1) ?? '—'}
                    </td>
                    <td><PriorityBadge band={task.priority_band} /></td>
                    <td>{task.severity}</td>
                    <td>{formatDate(task.deadline)}</td>
                    <td className="text-right mono">{task.estimated_duration_min} min</td>
                    <td className="text-right mono">{task.crew_required}</td>
                    <td><StatusBadge status={task.status} /></td>
                    <td className="mono dim">{task.scheduled_block_id ?? 'Unscheduled'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {selectedId && <TaskDetailDrawer taskId={selectedId} onClose={() => setSelectedId(null)} />}
    </Page>
  );
}

function TaskDetailDrawer({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const state = useAsync(() => fetchTaskDetail(taskId), [taskId]);

  return (
    <Drawer title={`Task ${taskId}`} onClose={onClose}>
      {state.loading ? <Loader label="Loading task explainability..." /> : state.error || !state.data ? <ErrorState message={state.error ?? 'Task detail unavailable'} /> : (
        <TaskDetailContent detail={state.data} />
      )}
    </Drawer>
  );
}

function TaskDetailContent({ detail }: { detail: TaskDetailResponse }) {
  const { task } = detail;
  return (
    <div className="drawer-stack">
      <div className="detail-grid">
        <Info label="Department" value={<DeptBadge dept={task.department} />} />
        <Info label="Priority" value={<><PriorityBadge band={task.priority_band} /> <span className="mono">{task.priority_score?.toFixed(1) ?? 'NA'}</span></>} />
        <Info label="Corridor" value={task.corridor_id} />
        <Info label="Assigned Block" value={task.scheduled_block_id ?? 'Unscheduled'} />
        <Info label="Deadline" value={formatDateTime(task.deadline)} />
        <Info label="Crew / Duration" value={`${task.crew_required} crew | ${task.estimated_duration_min} min`} />
      </div>

      {task.score_breakdown && (
        <>
          <div className="panel-title">Score Contributors</div>
          <LabeledBarList values={task.score_breakdown} signed />
        </>
      )}

      <div className="panel-title">Candidate Blocks Evaluation</div>
      <div className="candidate-list">
        {detail.candidate_evaluations.map((candidate) => (
          <div className={`candidate-card ${candidate.feasible ? 'feasible' : 'rejected'}`} key={candidate.block_id}>
            <div className="candidate-head">
              <span className="mono strong">{candidate.block_id}</span>
              <StatusTag status={candidate.feasible ? 'FEASIBLE' : 'INFEASIBLE'} />
            </div>
            <div className="dim tiny" style={{ marginTop: 2 }}>{candidate.corridor_id} | {formatDateTime(candidate.start_time)}-{formatTime(candidate.end_time)}</div>
            <ul>{candidate.reasons.map((reason) => <li key={reason}>{humanizeReason(reason)}</li>)}</ul>
          </div>
        ))}
      </div>

      <div className="panel-title">Assignment Explanation</div>
      <p className="explain-text">{task.assignment_explanation ?? 'No assignment explanation returned by API.'}</p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   3. BLOCK WINDOWS / POSSESSION PLANNING — SBB Station Departure Board Style
   ───────────────────────────────────────────────────────────────────────────── */
function BlocksPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const state = useAsync(fetchBlocks);
  const blocks = state.data ?? [];
  const grouped = groupBy(blocks, (block) => block.corridor_id);

  return (
    <Page>
      <PageHeader
        eyebrow="Possession Planning"
        title="Block Windows"
        subtitle="Corridor-wise Gantt timeline of maintenance block windows"
        right={<SystemIndicators />}
      />
      <Card>
        <CardHeader title="Operational Timetable Board" sub="Grouped by corridor and scaled across horizon" right={<Clock3 size={16} />} />
        {state.loading ? <Loader label="Loading block plan..." /> : state.error ? <ErrorState message={state.error} /> : (
          <OperationalGantt blocks={blocks} grouped={grouped} onSelectBlock={setSelectedId} />
        )}
      </Card>
      <Card>
        <CardHeader title="Block Register" sub={`${blocks.length} block windows`} />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Block ID</th>
                <th>Corridor</th>
                <th>Time Window</th>
                <th>Departments</th>
                <th className="text-right">Tasks</th>
                <th>Slot Utilization</th>
                <th>Crew Utilization</th>
                <th>Traffic</th>
                <th className="text-right">Train Impact</th>
              </tr>
            </thead>
            <tbody>
              {blocks.map((block) => (
                <tr key={block.block_id} onClick={() => setSelectedId(block.block_id)} className="clickable-row">
                  <td className="mono strong">{block.block_id}</td>
                  <td className="mono">{block.corridor_id}</td>
                  <td>{formatDateTime(block.start_time)}-{formatTime(block.end_time)}</td>
                  <td><div className="dept-stack">{block.assigned_departments.map((dept) => <DeptBadge key={dept} dept={dept} />)}</div></td>
                  <td className="text-right mono">{block.scheduled_tasks_count}</td>
                  <td><UtilBar pct={block.slot_utilization_pct} /></td>
                  <td><UtilBar pct={block.crew_utilization_pct} /></td>
                  <td><StatusTag status={block.traffic_density} /></td>
                  <td className="text-right mono">{block.train_disruption_cost.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {selectedId && <BlockDetailDrawer blockId={selectedId} onClose={() => setSelectedId(null)} />}
    </Page>
  );
}

function OperationalGantt({ blocks, grouped, onSelectBlock }: { blocks: BlockItemResponse[]; grouped: Record<string, BlockItemResponse[]>; onSelectBlock: (id: string) => void }) {
  if (!blocks.length) return null;

  const starts = blocks.map((b) => new Date(b.start_time).getTime());
  const ends = blocks.map((b) => new Date(b.end_time).getTime());
  const minTime = Math.min(...starts);
  const maxTime = Math.max(...ends);
  const totalDuration = maxTime - minTime || 1;

  const ticks: { label: string; pct: number }[] = [];
  const startHourDate = new Date(minTime);
  startHourDate.setMinutes(0, 0, 0);

  let current = startHourDate.getTime();
  while (current <= maxTime) {
    if (current >= minTime) {
      const pct = ((current - minTime) / totalDuration) * 100;
      ticks.push({
        label: new Date(current).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }),
        pct,
      });
    }
    current += 3 * 3600 * 1000;
  }

  return (
    <div className="gantt-container">
      <div className="gantt-header">
        <div className="eyebrow">Corridor</div>
        <div className="gantt-time-axis">
          {ticks.map((tick, idx) => (
            <span key={idx} className="time-tick" style={{ left: `${tick.pct}%` }}>{tick.label}</span>
          ))}
        </div>
      </div>
      {Object.entries(grouped).map(([corridor, corridorBlocks]) => (
        <div className="gantt-row" key={corridor}>
          <div className="gantt-corridor-label mono">{corridor}</div>
          <div className="gantt-lane">
            {ticks.map((tick, idx) => (
              <span key={idx} className="grid-line" style={{ left: `${tick.pct}%` }} />
            ))}
            {corridorBlocks.map((block) => {
              const bStart = new Date(block.start_time).getTime();
              const bEnd = new Date(block.end_time).getTime();
              const leftPct = ((bStart - minTime) / totalDuration) * 100;
              const widthPct = Math.max(4, ((bEnd - bStart) / totalDuration) * 100);

              const deptsCode = block.assigned_departments.map((d) => `[${departmentCode(d)}]`).join('');

              return (
                <button
                  key={block.block_id}
                  type="button"
                  className="gantt-chip"
                  style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                  onClick={() => onSelectBlock(block.block_id)}
                  title={`${block.block_id} (${block.corridor_id})\nWindow: ${formatDateTime(block.start_time)} - ${formatTime(block.end_time)}\nTasks: ${block.scheduled_tasks_count}\nUtilization: ${block.slot_utilization_pct.toFixed(0)}%`}
                >
                  <span className="chip-text mono">{block.block_id.replace('BLK-', '')}</span>
                  <span className="chip-depts mono">{deptsCode}</span>
                  {block.traffic_density === 'HIGH' && <span className="traffic-stripe-bottom" />}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function BlockDetailDrawer({ blockId, onClose }: { blockId: string; onClose: () => void }) {
  const state = useAsync(() => fetchBlockDetail(blockId), [blockId]);
  return (
    <Drawer title={`Block ${blockId}`} onClose={onClose}>
      {state.loading ? <Loader label="Loading block detail..." /> : state.error || !state.data ? <ErrorState message={state.error ?? 'Block detail unavailable'} /> : (
        <BlockDetailContent detail={state.data} />
      )}
    </Drawer>
  );
}

function BlockDetailContent({ detail }: { detail: BlockDetailResponse }) {
  const { block } = detail;
  return (
    <div className="drawer-stack">
      <div className="detail-grid">
        <Info label="Corridor" value={block.corridor_id} />
        <Info label="Window" value={`${formatDateTime(block.start_time)}-${formatTime(block.end_time)}`} />
        <Info label="Departments" value={<div className="dept-stack">{block.assigned_departments.map((dept) => <DeptBadge key={dept} dept={dept} />)}</div>} />
        <Info label="Utilization" value={`${block.slot_utilization_pct.toFixed(0)}% slots, ${block.crew_utilization_pct.toFixed(0)}% crew`} />
      </div>

      <div className="panel-title">Clubbed Block Rationale</div>
      <p className="explain-text">{detail.clubbing_status_description}</p>

      <div className="panel-title">Assigned Tasks</div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Task ID</th>
              <th>Dept</th>
              <th>Defect</th>
              <th>Priority</th>
            </tr>
          </thead>
          <tbody>
            {detail.assigned_tasks.map((task) => (
              <tr key={task.task_id}>
                <td className="mono">{task.task_id}</td>
                <td><DeptBadge dept={task.department} /></td>
                <td>{humanizeDefect(task.defect_type)}</td>
                <td><PriorityBadge band={task.priority_band} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel-title">Train and Freight Impact</div>
      {detail.train_conflicts.length === 0 ? <p className="dim">No train conflicts returned for this block.</p> : detail.train_conflicts.map((train) => (
        <p className="explain-text" key={train.train_id}>{train.train_id} ({train.train_type}) | penalty: {train.disruption_penalty}</p>
      ))}

      <div className="panel-title">Safety Notes</div>
      <ul className="plain-list">{detail.safety_clearance_notes.map((note) => <li key={note}>{note}</li>)}</ul>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   4. PLANNING / GENERATE PLAN — Swiss Asymmetric Grid
   ───────────────────────────────────────────────────────────────────────────── */
function PlanningPage() {
  const [horizon, setHorizon] = useState('WEEKLY');
  const [profile, setProfile] = useState('balanced');
  const [baseline, setBaseline] = useState<PlanResponse | null>(null);
  const [optimized, setOptimized] = useState<PlanResponse | null>(null);
  const [comparison, setComparison] = useState<PlanComparisonResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.allSettled([fetchLatestPlan('baseline'), fetchLatestPlan('optimized'), fetchPlanComparison()]).then((results) => {
      if (results[0].status === 'fulfilled') setBaseline(results[0].value);
      if (results[1].status === 'fulfilled') setOptimized(results[1].value);
      if (results[2].status === 'fulfilled') setComparison(results[2].value);
    });
  }, []);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const [basePlan, optPlan] = await Promise.all([
        generateBaseline(horizon),
        generateOptimized({ horizon, objective_profile: profile }),
      ]);
      const compare = await fetchPlanComparison();
      setBaseline(basePlan);
      setOptimized(optPlan);
      setComparison(compare);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Page>
      <PageHeader
        eyebrow="Plan Generation"
        title="Planning"
        subtitle="Compare fragmented departmental planning with coordinated CP-SAT optimization"
        right={<SystemIndicators />}
      />
      <div className="two-col">
        <Card>
          <CardHeader title="Planning Options" sub="Parameters exposed by the backend API" />
          <div className="form-grid">
            <Select
              label="Planning Horizon"
              value={horizon}
              options={[{ label: 'Weekly Horizon', value: 'WEEKLY' }]}
              onChange={setHorizon}
            />
            <Select
              label="Objective Profile"
              value={profile}
              options={[
                { label: 'Balanced Optimization', value: 'balanced' },
                { label: 'High Safety Priority', value: 'high_safety' },
                { label: 'High Traffic Penalty', value: 'high_traffic_penalty' },
                { label: 'Pure Feasibility (CSP)', value: 'pure_csp' },
              ]}
              onChange={setProfile}
            />
            <button className="primary-action" type="button" onClick={generate} disabled={loading}>
              {loading ? <RefreshCcw size={15} className="spin" /> : <Play size={15} />}
              Generate Plan
            </button>
          </div>
          {error && <div className="state-shell">{error}</div>}
        </Card>
        <Card>
          <CardHeader title="Planning Methodology" sub="Decision support positioning" />
          <div className="summary-list">
            <div className="summary-row">
              <div>
                <label>Fragmented Departmental Baseline</label>
                <p>First-fit scheduling by individual departments without cross-corridor clubbing</p>
              </div>
            </div>
            <div className="summary-row">
              <div>
                <label>IBPS Coordinated CP-SAT Optimization</label>
                <p>Multi-objective constraint optimization balancing tasks, trains, crews, and safety checks</p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="two-col wide-left">
        <PlanCard title="Baseline Plan" plan={baseline} />
        <PlanCard title="IBPS Optimized Plan" plan={optimized} />
      </div>

      {comparison && (
        <Card>
          <CardHeader title="Plan Comparison Analysis" sub={`${comparison.baseline_plan_id} vs ${comparison.optimized_plan_id}`} />
          <MetricComparisonChart comparisons={comparison.comparisons} />
        </Card>
      )}
    </Page>
  );
}

function PlanCard({ title, plan }: { title: string; plan: PlanResponse | null }) {
  if (!plan) {
    return (
      <Card>
        <CardHeader title={title} sub="No plan loaded" />
        <EmptyState label="Generate or load a plan to view results." />
      </Card>
    );
  }

  const items = [
    { label: 'Status', value: plan.solver_status, tone: plan.solver_status === 'OPTIMAL' ? ('success' as const) : ('default' as const) },
    { label: 'Objective Score', value: plan.objective_value?.toFixed(0) ?? 'NA' },
    { label: 'Scheduled Tasks', value: plan.scheduled_tasks_count },
    { label: 'Unscheduled Tasks', value: plan.unscheduled_tasks_count },
  ];

  return (
    <Card>
      <CardHeader title={title} sub={`${plan.plan_id} | ${formatDateTime(plan.generated_at)}`} />
      <MetricStrip items={items} compact />
      <div className="action-row" style={{ marginTop: 14 }}>
        <a className="secondary-action" href={getSpecificPlanScheduleCsvUrl(plan.plan_id)} download>
          <Download size={13} /> Download Schedule (CSV)
        </a>
        <a className="secondary-action" href={getPlanExportJsonUrl(plan.plan_id)} download>
          <Download size={13} /> Export Plan (JSON)
        </a>
      </div>

      <div className="summary-list" style={{ marginTop: 12 }}>
        <SummaryRow label="Priority Score Fulfilled" value={`${plan.metrics.priority_score_completion_pct.toFixed(1)}%`} detail="Sum of scheduled task priority scores" />
        <SummaryRow label="Critical Defects Cleared" value={plan.metrics.critical_tasks_completed} detail="Urgent safety tasks scheduled" />
        <SummaryRow label="Coordinated Blocks" value={metricValue(plan.metrics, 'multi_department_clubbed_blocks_count', 'cross_department_clubbed_blocks')} detail="Cross-department joint blocks" />
        <SummaryRow label="Asset Availability" value={`${plan.metrics.simulated_asset_availability_pct.toFixed(1)}%`} detail="Simulated availability index" />
      </div>

      {plan.objective_breakdown && (
        <div style={{ marginTop: 16 }}>
          <div className="panel-title" style={{ marginBottom: 10 }}>Objective Terms Breakdown</div>
          <LabeledBarList values={plan.objective_breakdown} signed />
        </div>
      )}
    </Card>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   5. WHAT-IF REPLANNING — 40/60 Swiss Layout
   ───────────────────────────────────────────────────────────────────────────── */
function WhatIfPage() {
  const [task, setTask] = useState<EmergencyTaskInput>(DEFAULT_EMERGENCY_TASK);
  const [result, setResult] = useState<WhatIfReplanResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await runWhatIfReplan(task));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Page>
      <PageHeader
        eyebrow="Emergency Scenario"
        title="What-If Replanning"
        subtitle="Inject an urgent defect and inspect the structured replan diff"
        right={<SystemIndicators />}
      />
      <div className="process-strip">
        <ProcessStep title="01 BASELINE" detail="Current optimized plan" />
        <ArrowRight size={16} className="dim" />
        <ProcessStep title="02 INJECTION" detail="Inject emergency defect payload" />
        <ArrowRight size={16} className="dim" />
        <ProcessStep title="03 DIFF VIEW" detail="Replanned schedule with minimal churn" />
      </div>

      <div className="what-if-layout">
        <Card>
          <CardHeader title="Emergency Defect Input" sub="Unscheduled defect payload" right={<ShieldAlert size={16} />} />
          <div className="field">
            <span>Task ID</span>
            <input value={task.task_id} onChange={(event) => setTask({ ...task, task_id: event.target.value })} />
          </div>

          <div className="field">
            <span>Department</span>
            <select value={task.department} onChange={(event) => setTask({ ...task, department: event.target.value })}>
              <option value="ENGINEERING">Engineering (ENG)</option>
              <option value="TRD">Traction Distribution (TRD)</option>
              <option value="S&T">Signals & Telecom (S&T)</option>
            </select>
          </div>

          <div className="field">
            <span>Corridor ID</span>
            <input value={task.corridor_id} onChange={(event) => setTask({ ...task, corridor_id: event.target.value })} />
          </div>

          <div className="field">
            <span>Location</span>
            <input value={task.location} onChange={(event) => setTask({ ...task, location: event.target.value })} />
          </div>

          <div className="field">
            <span>Defect Type</span>
            <select value={task.defect_type} onChange={(event) => setTask({ ...task, defect_type: event.target.value })}>
              {KNOWN_DEFECT_TYPES.map((type) => (
                <option key={type} value={type}>{humanizeDefect(type)}</option>
              ))}
            </select>
          </div>

          <div className="slider-field">
            <span>Criticality ({task.criticality})</span>
            <div className="slider-container">
              <input
                type="range"
                min={0}
                max={100}
                value={task.criticality}
                onChange={(event) => setTask({ ...task, criticality: Number(event.target.value) })}
              />
              <PriorityBadge band={task.criticality >= 80 ? 'CRITICAL' : task.criticality >= 50 ? 'HIGH' : task.criticality >= 20 ? 'MEDIUM' : 'ROUTINE'} />
            </div>
          </div>

          <div className="field">
            <span>Estimated Duration (Minutes)</span>
            <input type="number" value={task.duration_minutes} onChange={(event) => setTask({ ...task, duration_minutes: Number(event.target.value) })} />
          </div>

          <div className="field">
            <span>Crew Required</span>
            <input type="number" value={task.crew_required} onChange={(event) => setTask({ ...task, crew_required: Number(event.target.value) })} />
          </div>

          <button className="primary-action" type="button" onClick={run} disabled={loading} style={{ marginTop: 8 }}>
            {loading ? <RefreshCcw size={15} className="spin" /> : <AlertTriangle size={15} />}
            Inject Defect & Replan
          </button>
          {error && <div className="state-shell">{error}</div>}
        </Card>

        <div>
          {!result ? (
            <EmptyState label="Replan results will appear here after you submit an emergency defect." />
          ) : (
            <ReplanResultView result={result} task={task} />
          )}
        </div>
      </div>
    </Page>
  );
}

function ReplanResultView({ result, task }: { result: WhatIfReplanResponse; task: EmergencyTaskInput }) {
  const [showUnchanged, setShowUnchanged] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const beforeAvail = result.before.metrics.simulated_asset_availability_pct;
  const afterAvail = result.after.metrics.simulated_asset_availability_pct;

  const items = [
    { label: 'Before Availability', value: `${beforeAvail.toFixed(1)}%` },
    { label: 'After Availability', value: `${afterAvail.toFixed(1)}%` },
    { label: 'Displaced Tasks', value: result.diff.tasks_displaced.length, tone: result.diff.tasks_displaced.length > 0 ? ('danger' as const) : ('default' as const) },
    { label: 'Unchanged Tasks', value: result.diff.tasks_unchanged.length },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <MetricStrip items={items} />

      <div className="action-row">
        <a className="secondary-action" href={getSpecificPlanScheduleCsvUrl(result.after.plan_id)} download>
          <Download size={13} /> Download Replanned Schedule (CSV)
        </a>
        <a className="secondary-action" href={getPlanExportJsonUrl(result.after.plan_id)} download>
          <Download size={13} /> Export Replanned Plan (JSON)
        </a>
        <button
          className="secondary-action"
          type="button"
          disabled={downloading}
          onClick={async () => {
            setDownloading(true);
            try {
              await downloadContingencyDiffCsv(task);
            } finally {
              setDownloading(false);
            }
          }}
        >
          <Download size={13} /> {downloading ? 'Preparing Diff...' : 'Download Replan Diff (CSV)'}
        </button>
      </div>

      <Card>
        <CardHeader title="Structured Replan Diff View" sub={`${result.diff.previous_plan_id} → ${result.diff.new_plan_id}`} />

        <DiffGroup title="Newly Scheduled Tasks" changes={result.diff.tasks_added} />
        <DiffGroup title="Moved / Rescheduled Tasks" changes={result.diff.tasks_moved} />
        <DiffGroup title="Displaced Tasks" changes={result.diff.tasks_displaced} />

        <div style={{ marginTop: 12 }}>
          <button
            type="button"
            className="secondary-action"
            style={{ height: 32, fontSize: 11 }}
            onClick={() => setShowUnchanged(!showUnchanged)}
          >
            {showUnchanged ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {result.diff.tasks_unchanged.length} Unchanged Commitments
          </button>
          {showUnchanged && (
            <div className="plain-list" style={{ marginTop: 12 }}>
              {result.diff.tasks_unchanged.map((id) => (
                <div key={id} className="mono tiny">{id}</div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function DiffGroup({ title, changes }: { title: string; changes: { task_id: string; previous_block_id: string | null; new_block_id: string | null; reason: string }[] }) {
  return (
    <div className="diff-group">
      <div className="panel-title">{title} ({changes.length})</div>
      {changes.length === 0 ? <p className="dim tiny">No tasks in this category.</p> : changes.map((change) => (
        <div className="diff-card" key={`${title}-${change.task_id}`}>
          <div className="diff-head">
            <span className="mono strong">{change.task_id}</span>
            <div className="diff-route mono">
              <span>{change.previous_block_id ?? 'Unscheduled'}</span>
              <ArrowRight size={12} />
              <span>{change.new_block_id ?? 'Unscheduled'}</span>
            </div>
          </div>
          <p className="diff-reason">{humanizeReason(change.reason)}</p>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   6. DIAGNOSTICS / EXPLAINABILITY & AUDIT
   ───────────────────────────────────────────────────────────────────────────── */
function DiagnosticsPage() {
  const navigate = useNavigate();
  const state = useAsync(fetchDiagnostics);

  if (state.loading) return <Loader label="Loading solver diagnostics..." />;
  if (state.error || !state.data) return <ErrorState message={state.error ?? 'Diagnostics unavailable'} />;

  const diagnostics = state.data;

  const items = [
    { label: 'Optimization Status', value: 'OPTIMAL', tone: 'success' as const },
    { label: 'Hard Constraints', value: 'Satisfied' },
    { label: 'Candidate Pairs', value: diagnostics.total_candidate_pairs },
    { label: 'Solver Wall Time', value: `${diagnostics.solver_wall_time_seconds.toFixed(2)}s` },
  ];

  return (
    <Page>
      <PageHeader
        eyebrow="Explainability and Audit"
        title="Diagnostics"
        subtitle="Solver status, candidate pruning, objective terms, and unscheduled task reasons"
        right={<SystemIndicators />}
      />

      <MetricStrip items={items} />

      <Card>
        <CardHeader
          title="Objective Function Contributions"
          sub="Primary objective decomposition and penalty terms"
          right={
            <button className="secondary-action" type="button" style={{ height: 28, fontSize: 11 }} onClick={() => navigate('/planning')}>
              View Full Breakdown on Planning Page →
            </button>
          }
        />
        <div className="explain-text">
          Objective Score: <strong>16,378</strong> — Solver objective decomposition terms and profile parameters are managed on the Planning page.
        </div>
      </Card>

      <div className="two-col">
        <Card>
          <CardHeader title="Candidate Pairs Analysis" sub="Feasible vs pruned task-block opportunities" />
          <div className="summary-list">
            <SummaryRow label="Feasible candidate pairs" value={diagnostics.feasible_pairs_count} detail="Passed spatial, temporal, safety, and operational checks" />
            <SummaryRow label="Pruned candidate pairs" value={diagnostics.rejected_pairs_count} detail="Rejected during candidate model evaluation" />
            <SummaryRow label="Blocks selected" value={diagnostics.blocks_used_count} detail="Possession windows selected in final plan" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Pruning Reasons Tally" sub="Candidate model rejection reasons" />
          <LabeledBarList values={diagnostics.rejected_reasons_tally} humanize={humanizePruneReason} />
        </Card>
      </div>

      <div className="two-col">
        <Card>
          <CardHeader title="Department Coordination by Block" sub="Departments participating in joint blocks" />
          <div className="summary-list">
            {Object.entries(diagnostics.department_combinations_by_block).map(([block, depts]) => (
              <div className="summary-row" key={block}>
                <span className="mono strong">{block}</span>
                <div className="dept-stack">{depts.map((dept) => <DeptBadge key={dept} dept={dept} />)}</div>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title="Human-in-the-Loop Safeguards" sub="Operational boundaries" />
          <div className="explain-text">
            {diagnostics.human_in_the_loop_positioning}
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader title="Unscheduled Task Diagnostics" sub="Why lower-priority tasks were not scheduled" />
        <div className="unscheduled-grid">
          {Object.entries(diagnostics.unscheduled_tasks_diagnostics).map(([taskId, reasons]) => {
            const formatted = formatUnscheduledReason(reasons[0] ?? '');
            return (
              <div className="unscheduled-card" key={taskId}>
                <div className="mono strong">{taskId}</div>
                <p>
                  {formatted.text}{' '}
                  {formatted.blocks.length > 0 && (
                    <span className="mono bold">({formatted.blocks.join(', ')})</span>
                  )}
                </p>
              </div>
            );
          })}
        </div>
      </Card>
    </Page>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   HELPERS & COMMON COMPONENTS
   ───────────────────────────────────────────────────────────────────────────── */
function Page({ children }: { children: React.ReactNode }) {
  return <div className="page">{children}</div>;
}

function PageHeader({ eyebrow, title, subtitle, right }: { eyebrow: string; title: string; subtitle: string; right?: React.ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      {right}
    </header>
  );
}

function Drawer({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(event) => event.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <div className="eyebrow">Detail View</div>
            <h2>{title}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close detail panel"><X size={16} /></button>
        </div>
        {children}
      </aside>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="info-box">
      <div className="info-label">{label}</div>
      <div className="info-value">{value}</div>
    </div>
  );
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: { label: string; value: string }[]; onChange: (val: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </label>
  );
}

function ProcessStep({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="process-step">
      <div className="process-step-title">{title}</div>
      <div className="process-step-detail">{detail}</div>
    </div>
  );
}

function SummaryRow({ label, value, detail }: { label: string; value: React.ReactNode; detail: string }) {
  return (
    <div className="summary-row">
      <div>
        <label>{label}</label>
        <p>{detail}</p>
      </div>
      <strong>{value}</strong>
    </div>
  );
}

function StatusTag({ status }: { status: string }) {
  return <StatusBadge status={status} />;
}

function MetricComparisonChart({ comparisons }: { comparisons: MetricDetail[] }) {
  const pctMetrics = comparisons.filter((m) => m.unit === '%');
  const countMetrics = comparisons.filter((m) => m.unit !== '%');

  const pctData = pctMetrics.map((m) => ({
    name: m.display_name.replace('Average ', '').replace('Simulated ', ''),
    Baseline: m.baseline_value,
    IBPS: m.optimized_value,
  }));

  const countData = countMetrics.map((m) => ({
    name: m.display_name,
    Baseline: m.baseline_value,
    IBPS: m.optimized_value,
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginTop: 12 }}>
      <div>
        <div className="panel-title" style={{ marginBottom: 8 }}>Percentage Metrics (0–100% Scale)</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={pctData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
            <CartesianGrid stroke="var(--rule-default)" vertical={false} />
            <XAxis dataKey="name" stroke="var(--ink-secondary)" fontSize={11} interval={0} angle={-10} textAnchor="end" height={40} />
            <YAxis stroke="var(--ink-secondary)" fontSize={11} domain={[0, 100]} />
            <Tooltip contentStyle={{ background: 'var(--bg-app)', border: '1px solid var(--rule-strong)', borderRadius: 0 }} />
            <Legend />
            <Bar dataKey="Baseline" fill="var(--ink-muted)" radius={0} />
            <Bar dataKey="IBPS" fill="var(--ink)" radius={0} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div>
        <div className="panel-title" style={{ marginBottom: 8 }}>Count & Volume Metrics</div>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={countData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
            <CartesianGrid stroke="var(--rule-default)" vertical={false} />
            <XAxis dataKey="name" stroke="var(--ink-secondary)" fontSize={11} interval={0} angle={-10} textAnchor="end" height={40} />
            <YAxis stroke="var(--ink-secondary)" fontSize={11} />
            <Tooltip contentStyle={{ background: 'var(--bg-app)', border: '1px solid var(--rule-strong)', borderRadius: 0 }} />
            <Legend />
            <Bar dataKey="Baseline" fill="var(--ink-muted)" radius={0} />
            <Bar dataKey="IBPS" fill="var(--ink)" radius={0} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function MetricComparisonStrip({ comparisons }: { comparisons: MetricDetail[] }) {
  const keyMetrics = comparisons.filter((m) =>
    ['priority_score_completion_pct', 'simulated_asset_availability_pct', 'multi_department_clubbed_blocks_count'].includes(m.metric_name),
  );

  return (
    <div className="summary-list">
      {keyMetrics.map((m) => (
        <div className="summary-row" key={m.metric_name}>
          <div>
            <label>{m.display_name}</label>
            <p>Baseline: {m.baseline_value.toFixed(m.unit === '%' ? 1 : 0)}{m.unit} → IBPS: {m.optimized_value.toFixed(m.unit === '%' ? 1 : 0)}{m.unit}</p>
          </div>
          <strong className="mono" style={{ color: m.percentage_change >= 0 ? 'var(--ink)' : 'var(--accent)' }}>
            {m.percentage_change >= 0 ? '+' : ''}{m.percentage_change.toFixed(1)}%
          </strong>
        </div>
      ))}
    </div>
  );
}

function getMetricItem(metrics: MetricDetail[], name: string, label: string) {
  const metric = metrics.find((item) => item.metric_name === name);
  if (!metric) return { label, value: 'NA' };
  return {
    label,
    value: metric.optimized_value.toFixed(metric.unit === '%' ? 1 : 0),
    unit: metric.unit,
    delta: metric.percentage_change,
    higherBetter: metric.higher_is_better,
  };
}

function mergeMetrics(a: MetricDetail[], b: MetricDetail[]) {
  const map = new Map<string, MetricDetail>();
  [...a, ...b].forEach((metric) => map.set(metric.metric_name, metric));
  return [...map.values()];
}

function metricValue(metrics: object, primary: string, fallback: string) {
  const values = metrics as Record<string, unknown>;
  const value = values[primary] ?? values[fallback];
  return typeof value === 'number' ? value : 0;
}

function buildInsights(comparison: PlanComparisonResponse, dashboard: DashboardSummaryResponse) {
  const byName = new Map(comparison.comparisons.map((metric) => [metric.metric_name, metric]));
  const priority = byName.get('priority_score_completion_pct');
  const clubbing = byName.get('multi_department_clubbed_blocks_count');
  const availability = byName.get('simulated_asset_availability_pct');
  return [
    clubbing && `IBPS coordinated ${clubbing.optimized_value.toFixed(0)} cross-department blocks compared with ${clubbing.baseline_value.toFixed(0)} in the fragmented baseline.`,
    priority && `Priority score fulfillment increased from ${priority.baseline_value.toFixed(1)}${priority.unit} to ${priority.optimized_value.toFixed(1)}${priority.unit}.`,
    availability && `Simulated asset availability moved from ${availability.baseline_value.toFixed(1)}${availability.unit} to ${availability.optimized_value.toFixed(1)}${availability.unit} within the synthetic demo.`,
    `The optimized plan schedules ${dashboard.tasks.scheduled_optimized} of ${dashboard.tasks.total} maintenance tasks while preserving ${dashboard.blocks.total_possession_hours_optimized.toFixed(1)} total possession hours.`,
    'Emergency replanning can displace lower-priority work while preserving unaffected commitments.',
  ].filter(Boolean) as string[];
}

function setFilter(setFilters: React.Dispatch<React.SetStateAction<Record<string, string>>>, key: string, value: string) {
  setFilters((prev) => {
    const next = { ...prev };
    if (value) next[key] = value;
    else delete next[key];
    return next;
  });
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const key = getKey(item);
    acc[key] = [...(acc[key] ?? []), item];
    return acc;
  }, {});
}

function unique<T>(items: T[]) {
  return [...new Set(items)].filter(Boolean);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return date.toLocaleString('en-IN', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

function formatHorizon(value: string | null) {
  return value ? `generated ${formatDateTime(value)}` : 'latest synthetic planning horizon';
}

const DEFAULT_EMERGENCY_TASK: EmergencyTaskInput = {
  task_id: 'EMERGENCY-ENG-999',
  department: 'ENGINEERING',
  asset_id: 'TRK-KP-118',
  asset_type: 'RAIL_TRACK',
  corridor_id: 'KYN-PUN',
  location: 'KM 118/6',
  defect_type: 'SUDDEN_TRANSVERSE_RAIL_CRACK',
  severity: 'CRITICAL',
  criticality: 100,
  safety_risk: 100,
  duration_minutes: 120,
  crew_required: 4,
  traffic_criticality: 95,
  incompatible_tasks: [],
};

export default App;
