"""
API Router - Plan Generation, CP-SAT Optimization, and Baseline Comparisons.
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, Query, status

from app.schemas.plans import (
    PlanGenerateRequest,
    PlanResponse,
    PlanComparisonResponse,
    PlanRegistryItem,
)
from app.domain.enums import PlanHorizon
from app.services.plan_service import PlanService

router = APIRouter(tags=["Block Planning & Optimization"])


@router.post(
    "/plans/baseline",
    response_model=PlanResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate Fragmented Baseline Schedule",
    description="Executes the uncoordinated departmental first-fit greedy scheduler simulating current manual railway practice.",
)
def generate_baseline_plan(
    horizon: PlanHorizon = Query(PlanHorizon.WEEKLY, description="Planning time horizon"),
):
    return PlanService.generate_baseline_plan(horizon=horizon)


@router.post(
    "/plans/optimize",
    response_model=PlanResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate Optimized Integrated Plan (CP-SAT)",
    description="Solves the cross-department block planning problem using Google OR-Tools CP-SAT constraint optimizer.",
)
def generate_optimized_plan(
    request: PlanGenerateRequest,
):
    return PlanService.generate_optimized_plan(request)


@router.get(
    "/plans/comparison",
    response_model=PlanComparisonResponse,
    summary="Compare Baseline vs IBPS Optimized Plan",
    description="Returns live side-by-side KPI metrics and calculated improvements (priority fulfillment, possession hours, clubbed blocks, availability proxy).",
)
def get_plan_comparison():
    return PlanService.get_plan_comparison()


@router.get(
    "/plans/latest",
    response_model=PlanResponse,
    summary="Get Latest Active Plan",
    description="Retrieves the most recently computed baseline or optimized plan.",
)
def get_latest_plan(
    plan_type: str = Query("optimized", description="'optimized' or 'baseline'"),
):
    return PlanService.get_latest_plan(plan_type=plan_type)


@router.get(
    "/plans/registry",
    response_model=list[PlanRegistryItem],
    summary="List Stored Plan Versions",
    description="Lists baseline, optimized, and contingency plan versions retained for the active corridor/division dataset.",
)
def list_plan_versions():
    from app.services.state_service import get_state

    state = get_state()
    active_id = state.optimized_plan.plan_id if state.optimized_plan else None
    return [
        PlanRegistryItem(
            plan_id=plan.plan_id,
            generated_at=plan.generated_at,
            solver_status=plan.solver_status,
            scheduled_tasks_count=len(plan.scheduled_tasks),
            unscheduled_tasks_count=len(plan.unscheduled_tasks),
            is_active=plan.plan_id == active_id,
        )
        for plan in state.list_registered_plans()
    ]


@router.get(
    "/plans/export/csv",
    summary="Export Latest Schedule as CSV",
    description="Generates and downloads an official railway block dispatch schedule in CSV format.",
)
def export_latest_schedule_csv(
    plan_type: str = Query("optimized", description="'optimized' or 'baseline'"),
):
    from fastapi import Response
    from app.services.export_service import ExportService
    from app.services.state_service import get_state

    state = get_state()
    plan = state.optimized_plan if plan_type == "optimized" else state.baseline_plan
    if not plan:
        raise HTTPException(status_code=404, detail="No plan has been generated yet.")

    csv_data = ExportService.export_schedule_csv(plan, state.get_tasks_for_plan(plan.plan_id), state.blocks)
    filename = f"ibps_schedule_{plan.plan_id.lower()}.csv"
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get(
    "/plans/{plan_id}/export/csv",
    summary="Export Specific Plan by ID as CSV",
    description="Downloads official schedule CSV for a specific plan ID.",
)
def export_plan_by_id_csv(plan_id: str):
    from fastapi import Response, HTTPException
    from app.services.export_service import ExportService
    from app.services.state_service import get_state

    state = get_state()
    plan = state.get_plan_by_id(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail=f"Plan '{plan_id}' not found.")

    csv_data = ExportService.export_schedule_csv(plan, state.get_tasks_for_plan(plan_id), state.blocks)
    filename = f"ibps_schedule_{plan_id.lower()}.csv"
    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get(
    "/plans/export/json",
    summary="Export Latest Plan as JSON",
)
def export_latest_plan_json(
    plan_type: str = Query("optimized", description="'optimized' or 'baseline'"),
):
    from fastapi import Response
    from app.services.export_service import ExportService
    from app.services.state_service import get_state

    state = get_state()
    plan = state.optimized_plan if plan_type == "optimized" else state.baseline_plan
    if not plan:
        raise HTTPException(status_code=404, detail="No plan has been generated yet.")
    json_data = ExportService.export_plan_json(plan, state.get_tasks_for_plan(plan.plan_id), state.blocks)
    return Response(
        content=json_data,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="ibps_plan_{plan.plan_id.lower()}.json"'},
    )


@router.get(
    "/plans/{plan_id}/export/json",
    summary="Export Specific Plan by ID as JSON",
)
def export_plan_by_id_json(plan_id: str):
    from fastapi import Response
    from app.services.export_service import ExportService
    from app.services.state_service import get_state

    state = get_state()
    plan = state.get_plan_by_id(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail=f"Plan '{plan_id}' not found.")
    json_data = ExportService.export_plan_json(plan, state.get_tasks_for_plan(plan_id), state.blocks)
    return Response(
        content=json_data,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="ibps_plan_{plan_id.lower()}.json"'},
    )
