"""
Unit tests for Data Ingestion, CSV Parsing, Cleaning, and Export Services.
"""

from app.services.data_ingestion_service import DataIngestionService
from app.services.export_service import ExportService
from app.domain.enums import Department, Severity, TrainType


def test_clean_and_parse_tasks_valid_csv():
    service = DataIngestionService()
    template_csv = service.get_sample_csv_template("tasks")
    tasks, report = service.clean_and_parse_tasks(template_csv)

    assert len(tasks) == 7
    assert report.total_rows == 7
    assert report.valid_rows == 7
    assert report.rejected_count == 0
    assert tasks[0].task_id == "TASK-ENG-101"
    assert tasks[0].department == Department.ENGINEERING
    assert tasks[0].severity == Severity.CRITICAL


def test_clean_and_parse_tasks_messy_headers_and_synonyms():
    service = DataIngestionService()
    messy_csv = (
        "id,dept,equipment,route,loc,fault,urgency,criticality_score,risk,overdue,duration,manpower,from_time,due_date\n"
        "T-01,P-Way,Turnout,KYN-PUN,KM 45,Rail Fracture,P1,95,90,4,180,8,01/09/2026 02:00,02/09/2026 06:00\n"
        "T-02,OHE,Cantilever,KYN-PUN,KM 46,Flashover,P2,75,70,0,120,4,01-09-2026 03:00,03-09-2026 12:00\n"
    )
    tasks, report = service.clean_and_parse_tasks(messy_csv)

    assert len(tasks) == 2
    assert report.valid_rows == 2
    assert tasks[0].task_id == "T-01"
    assert tasks[0].department == Department.ENGINEERING
    assert tasks[0].severity == Severity.CRITICAL
    assert tasks[1].department == Department.TRD
    assert tasks[1].severity == Severity.MAJOR


def test_clean_and_parse_tasks_cycle_detection():
    service = DataIngestionService()
    cyclic_csv = (
        "Task ID,Department,Corridor,Precedence\n"
        "TASK-A,ENG,KYN-PUN,TASK-B\n"
        "TASK-B,ENG,KYN-PUN,TASK-A\n"
    )
    tasks, report = service.clean_and_parse_tasks(cyclic_csv)

    assert len(tasks) == 2
    # Cycle should be detected and broken
    assert any("Cyclic dependency detected" in w.get("message", "") for w in report.warnings)


def test_clean_and_parse_blocks_template():
    service = DataIngestionService()
    template_csv = service.get_sample_csv_template("blocks")
    blocks, report = service.clean_and_parse_blocks(template_csv)

    assert len(blocks) == 5
    assert report.valid_rows == 5
    assert blocks[0].block_id == "BLK-KP-NIGHT-01"
    assert blocks[0].available_capacity == 4
    assert Department.ENGINEERING in blocks[0].permitted_departments
    assert Department.TRD in blocks[0].permitted_departments


def test_clean_and_parse_trains_template():
    service = DataIngestionService()
    template_csv = service.get_sample_csv_template("trains")
    trains, report = service.clean_and_parse_trains(template_csv)

    assert len(trains) == 5
    assert report.valid_rows == 5
    assert trains[1].train_type == TrainType.VANDE_BHARAT
    assert trains[1].operational_priority == 1
