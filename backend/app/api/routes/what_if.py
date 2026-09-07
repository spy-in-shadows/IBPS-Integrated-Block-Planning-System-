"""
API Router - What-If Scenario Modeling & Emergency Defect Re-planning.
"""

from fastapi import APIRouter, HTTPException, status
from app.schemas.what_if import WhatIfReplanRequest, WhatIfReplanResponse
from app.services.what_if_service import WhatIfService

router = APIRouter(tags=["What-If Re-planning"])


@router.post(
    "/plans/what-if",
    response_model=WhatIfReplanResponse,
    status_code=status.HTTP_200_OK,
    summary="Inject Emergency Defect & Trigger Dynamic Contingency Re-plan",
    description="Injects an urgent maintenance defect into the scheduling pool, soft-pins existing commitments to avoid needless churn, and computes a structured before-vs-after diff.",
    responses={
        400: {"description": "Invalid emergency task payload"},
    },
)
@router.post(
    "/plans/contingency",
    response_model=WhatIfReplanResponse,
    status_code=status.HTTP_200_OK,
    summary="Inject Emergency Defect & Trigger Contingency Re-plan",
)
def what_if_emergency_replan(request: WhatIfReplanRequest):
    if not request.task or not request.task.task_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Emergency task payload must include a valid task_id.",
        )
    return WhatIfService.replan_emergency_task(request)


@router.post(
    "/plans/what-if/export/csv",
    summary="Export Contingency Replan Diff as CSV",
    description="Runs contingency re-planning and exports the resulting disruption diff report as downloadable CSV.",
)
@router.post(
    "/plans/contingency/export/csv",
    summary="Export Contingency Replan Diff as CSV",
)
def export_contingency_diff_csv(request: WhatIfReplanRequest):
    from fastapi import Response
    from app.services.export_service import ExportService

    if not request.task or not request.task.task_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Emergency task payload must include a valid task_id.",
        )
    result = WhatIfService.replan_emergency_task(request)
    csv_data = ExportService.export_replan_diff_csv(result.diff.model_dump())
    filename = f"ibps_contingency_diff_{request.task.task_id.lower()}.csv"

    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
