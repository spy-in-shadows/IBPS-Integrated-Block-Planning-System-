"""
Export Service for IBPS.
Generates downloadable CSV and JSON files for railway block dispatch schedules,
contingency re-planning diffs, and data cleaning audit reports.
"""

import csv
import io
import json
from typing import List, Dict, Any, Optional
from datetime import datetime

from app.domain.models import BlockPlan, MaintenanceTask, BlockWindow, ScheduledTask


class ExportService:
    @staticmethod
    def export_plan_json(plan: BlockPlan, tasks: List[MaintenanceTask], blocks: List[BlockWindow]) -> str:
        """Serialize a plan version with its dispatch context for audit/archive use."""
        payload = plan.model_dump(mode="json")
        payload["dispatch_context"] = {
            "tasks": [task.model_dump(mode="json") for task in tasks],
            "blocks": [block.model_dump(mode="json") for block in blocks],
        }
        return json.dumps(payload, indent=2)

    @staticmethod
    def export_schedule_csv(
        plan: BlockPlan,
        tasks: List[MaintenanceTask],
        blocks: List[BlockWindow],
    ) -> str:
        """
        Produces an official railway dispatch block schedule in CSV format.
        """
        task_map = {t.task_id: t for t in tasks}
        block_map = {b.block_id: b for b in blocks}

        output = io.StringIO()
        writer = csv.writer(output)

        # Header Comments / Metadata
        writer.writerow(["# IBPS OFFICIAL RAILWAY BLOCK DISPATCH SCHEDULE"])
        writer.writerow(["# Plan ID", plan.plan_id])
        writer.writerow(["# Generated At", plan.generated_at.isoformat()])
        writer.writerow(["# Horizon", plan.horizon.value])
        writer.writerow(["# Solver Status", plan.solver_status.value])
        writer.writerow(["# Total Tasks", plan.metrics.total_tasks])
        writer.writerow(["# Scheduled Tasks", plan.metrics.scheduled_tasks_count])
        writer.writerow(["# Unscheduled Tasks", plan.metrics.unscheduled_tasks_count])
        writer.writerow(["# Simulated Asset Availability (%)", f"{plan.metrics.simulated_asset_availability_pct:.1f}%"])
        writer.writerow([])

        # Table 1: Scheduled Tasks
        writer.writerow([
            "Task ID",
            "Department",
            "Defect / Work Nature",
            "Severity",
            "Priority Score",
            "Corridor",
            "Location / Station",
            "Asset ID",
            "Assigned Block ID",
            "Block Window Start",
            "Block Window End",
            "Task Duration (min)",
            "Crew Allocated",
            "Status",
            "Assignment Explanation",
        ])

        for st in sorted(plan.scheduled_tasks, key=lambda x: (x.block_id, x.scheduled_start)):
            t = task_map.get(st.task_id)
            b = block_map.get(st.block_id)
            dept = t.department.value if t else ""
            defect = t.defect_type if t else ""
            sev = t.severity.value if t else ""
            prio = f"{t.priority_score:.1f}" if (t and t.priority_score is not None) else ""
            corridor = t.corridor_id if t else (b.corridor_id if b else "")
            loc = t.location if t else ""
            asset = t.asset_id if t else ""
            dur = t.estimated_duration_min if t else ""
            crew = t.crew_required if t else ""
            b_start = st.scheduled_start.strftime("%Y-%m-%d %H:%M") if st.scheduled_start else ""
            b_end = st.scheduled_end.strftime("%Y-%m-%d %H:%M") if st.scheduled_end else ""

            writer.writerow([
                st.task_id,
                dept,
                defect,
                sev,
                prio,
                corridor,
                loc,
                asset,
                st.block_id,
                b_start,
                b_end,
                dur,
                crew,
                st.status.value,
                st.explanation,
            ])

        writer.writerow([])
        # Table 2: Unscheduled Tasks Summary
        writer.writerow(["# UNSCHEDULED TASKS REQUIRING CONTINGENCY ATTENTION"])
        writer.writerow(["Task ID", "Department", "Defect Type", "Severity", "Priority Score", "Corridor", "Status"])
        for u_id in plan.unscheduled_tasks:
            t = task_map.get(u_id)
            if t:
                writer.writerow([
                    t.task_id,
                    t.department.value,
                    t.defect_type,
                    t.severity.value,
                    f"{t.priority_score:.1f}" if t.priority_score is not None else "",
                    t.corridor_id,
                    "UNSCHEDULED",
                ])

        return output.getvalue()

    @staticmethod
    def export_replan_diff_csv(diff_data: Dict[str, Any]) -> str:
        """
        Produces an emergency disruption diff report in CSV format.
        """
        output = io.StringIO()
        writer = csv.writer(output)

        writer.writerow(["# IBPS CONTINGENCY RE-PLANNING DISRUPTION DIFF REPORT"])
        writer.writerow(["# Base Plan ID", diff_data.get("previous_plan_id", "")])
        writer.writerow(["# Re-planned Plan ID", diff_data.get("new_plan_id", "")])
        writer.writerow(["# Emergency Incident Task ID", diff_data.get("emergency_task_id", "")])
        writer.writerow([])

        writer.writerow([
            "Task ID",
            "Action Category",
            "Previous Block Window",
            "Revised Block Window",
            "Operational Reason / Justification",
        ])

        for group_name, action_label in [
            ("tasks_added", "NEWLY_SCHEDULED"),
            ("tasks_moved", "RESCHEDULED"),
            ("tasks_displaced", "DISPLACED / POSTPONED"),
        ]:
            items = diff_data.get(group_name, [])
            for item in items:
                writer.writerow([
                    item.get("task_id", ""),
                    action_label,
                    item.get("previous_block_id") or "UNSCHEDULED",
                    item.get("new_block_id") or "UNSCHEDULED",
                    item.get("reason", ""),
                ])

        unchanged = diff_data.get("tasks_unchanged", [])
        for task_id in unchanged:
            writer.writerow([
                task_id,
                "UNCHANGED_COMMITMENT",
                "PRESERVED",
                "PRESERVED",
                "Soft pinning kept task in approved block window to minimize operational churn.",
            ])

        return output.getvalue()
