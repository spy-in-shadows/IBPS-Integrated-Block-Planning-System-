"""
API Router - Data Ingestion, Cleaning & Template Downloads.
"""

from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Response, status
from pydantic import BaseModel

from app.services.data_ingestion_service import DataIngestionService
from app.services.state_service import get_state

router = APIRouter(tags=["Data Ingestion"])
ingestion_service = DataIngestionService()


class IngestCsvPayload(BaseModel):
    tasks_csv: str
    blocks_csv: Optional[str] = None
    trains_csv: Optional[str] = None


@router.post(
    "/ingest/csv",
    summary="Ingest CSV Data (Tasks, Blocks, Trains)",
    description="Parses, sanitizes, and cleans CSV data from railway officials. Triggers priority recalculation and initial baseline/optimized planning.",
)
async def ingest_csv_payload(payload: IngestCsvPayload):
    state = get_state()

    # 1. Parse and clean tasks
    tasks, task_report = ingestion_service.clean_and_parse_tasks(payload.tasks_csv)
    if not tasks:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to ingest tasks: {task_report.rejected_rows[0]['reason'] if task_report.rejected_rows else 'No valid task rows found.'}"
        )

    # 2. Parse blocks if provided, else keep existing corridor blocks
    blocks = None
    block_report = None
    if payload.blocks_csv and payload.blocks_csv.strip():
        blocks, block_report = ingestion_service.clean_and_parse_blocks(payload.blocks_csv)

    # 3. Parse trains if provided, else keep existing timetable
    trains = None
    train_report = None
    if payload.trains_csv and payload.trains_csv.strip():
        trains, train_report = ingestion_service.clean_and_parse_trains(payload.trains_csv)

    # Combine audit reports
    combined_report = {
        "tasks": task_report.to_dict(),
        "blocks": block_report.to_dict() if block_report else None,
        "trains": train_report.to_dict() if train_report else None,
        "summary": {
            "total_tasks_ingested": len(tasks),
            "total_blocks_available": len(blocks) if blocks else len(state.blocks),
            "total_trains_scheduled": len(trains) if trains else len(state.trains),
            "corrections_count": task_report.auto_corrected_count + (block_report.auto_corrected_count if block_report else 0) + (train_report.auto_corrected_count if train_report else 0),
            "warnings_count": task_report.warnings_count + (block_report.warnings_count if block_report else 0) + (train_report.warnings_count if train_report else 0),
            "rejected_count": task_report.rejected_count + (block_report.rejected_count if block_report else 0) + (train_report.rejected_count if train_report else 0),
        }
    }

    # Update state and pre-compute plans
    state.set_user_dataset(
        tasks=tasks,
        blocks=blocks,
        trains=trains,
        report=combined_report,
    )

    return {
        "status": "success",
        "message": f"Successfully ingested {len(tasks)} tasks and refreshed block planning state.",
        "report": combined_report,
        "baseline_plan_id": state.baseline_plan.plan_id if state.baseline_plan else None,
        "optimized_plan_id": state.optimized_plan.plan_id if state.optimized_plan else None,
    }


@router.post(
    "/ingest/upload-files",
    summary="Ingest CSV Files via Multipart Upload",
    description="Upload raw .csv files for tasks, block windows, and train timetables.",
)
async def ingest_csv_files(
    tasks_file: UploadFile = File(...),
    blocks_file: Optional[UploadFile] = File(None),
    trains_file: Optional[UploadFile] = File(None),
):
    tasks_content = (await tasks_file.read()).decode("utf-8", errors="replace")
    blocks_content = (await blocks_file.read()).decode("utf-8", errors="replace") if blocks_file else None
    trains_content = (await trains_file.read()).decode("utf-8", errors="replace") if trains_file else None

    payload = IngestCsvPayload(
        tasks_csv=tasks_content,
        blocks_csv=blocks_content,
        trains_csv=trains_content,
    )
    return await ingest_csv_payload(payload)


@router.get(
    "/ingest/templates/{entity_type}",
    summary="Download Official CSV Template",
    description="Provides downloadable sample CSV templates with correct headers and representative Indian Railways data.",
)
def download_csv_template(entity_type: str):
    entity = entity_type.lower().strip()
    if entity not in ("tasks", "blocks", "trains"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid entity type. Choose 'tasks', 'blocks', or 'trains'."
        )
    csv_text = ingestion_service.get_sample_csv_template(entity)
    filename = f"ibps_{entity}_template.csv"

    return Response(
        content=csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get(
    "/ingest/cleaning-report",
    summary="Get Latest Data Cleaning & Audit Report",
    description="Returns detailed audit logs of format corrections, warnings, and rejected rows for the active dataset.",
)
def get_cleaning_report():
    state = get_state()
    if not state.latest_cleaning_report:
        return {
            "status": "ready",
            "message": "No custom CSV uploaded yet. Active dataset is default demo fixture.",
            "report": None,
        }
    return {
        "status": "ready",
        "report": state.latest_cleaning_report,
    }


@router.post(
    "/ingest/reset-demo",
    summary="Reset to Deterministic Demo Fixture",
    description="Restores the standard 21-task Central Railway demo fixture.",
)
def reset_to_demo():
    state = get_state()
    state.load_dataset("demo_fixture")
    state.latest_cleaning_report = None
    return {
        "status": "success",
        "message": "Reset active state to standard demo fixture (21 tasks, Central Railway CSTM-KYN-PUN).",
        "baseline_plan_id": state.baseline_plan.plan_id if state.baseline_plan else None,
        "optimized_plan_id": state.optimized_plan.plan_id if state.optimized_plan else None,
    }
