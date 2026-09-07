"""
Data Ingestion, Cleaning, and Validation Engine for IBPS.
Parses CSV uploads from Railway Officials, normalizes field formats,
detects integrity errors / cycles, and generates a detailed audit report.
"""

from datetime import datetime, timedelta
import csv
import io
import re
from typing import List, Dict, Any, Tuple, Optional, Set

from app.domain.models import MaintenanceTask, BlockWindow, TrainMovement, GoodsForecast
from app.domain.enums import (
    Department,
    Severity,
    TaskStatus,
    TrainType,
    Direction,
    TrafficDensity,
)


class DataCleaningReport:
    """Detailed audit report of data cleaning and verification operations."""
    def __init__(self, entity_type: str = "tasks"):
        self.entity_type = entity_type
        self.total_rows: int = 0
        self.valid_rows: int = 0
        self.auto_corrected_count: int = 0
        self.warnings_count: int = 0
        self.rejected_count: int = 0
        self.corrections: List[Dict[str, Any]] = []
        self.warnings: List[Dict[str, Any]] = []
        self.rejected_rows: List[Dict[str, Any]] = []

    def to_dict(self) -> Dict[str, Any]:
        return {
            "entity_type": self.entity_type,
            "total_rows": self.total_rows,
            "valid_rows": self.valid_rows,
            "auto_corrected_count": self.auto_corrected_count,
            "warnings_count": self.warnings_count,
            "rejected_count": self.rejected_count,
            "corrections": self.corrections[:50],
            "warnings": self.warnings[:50],
            "rejected_rows": self.rejected_rows[:50],
        }


class DataIngestionService:
    """Service to parse, sanitize, clean, and validate Railway CSV datasets."""

    TASK_HEADER_ALIASES: Dict[str, List[str]] = {
        "task_id": ["task_id", "taskid", "task id", "id", "task_no", "work_id"],
        "department": ["department", "dept", "dept_code", "wing", "discipline"],
        "asset_id": ["asset_id", "assetid", "asset id", "asset", "track_id", "point_id", "ohe_mast"],
        "asset_type": ["asset_type", "assettype", "type", "equipment"],
        "corridor_id": ["corridor_id", "corridor", "section", "route", "corridor id"],
        "location": ["location", "km", "chainage", "yard", "station", "loc"],
        "defect_type": ["defect_type", "defect", "activity", "work_nature", "fault", "issue"],
        "severity": ["severity", "priority", "criticality_level", "urgency"],
        "criticality": ["criticality", "asset_criticality", "importance", "criticality_score"],
        "safety_risk": ["safety_risk", "safety", "risk", "hazard_rating", "risk_score"],
        "overdue_days": ["overdue_days", "overdue", "days_overdue", "delay_days"],
        "estimated_duration_min": ["estimated_duration_min", "duration_min", "duration", "duration_minutes", "duration (min)", "estimated_duration"],
        "crew_required": ["crew_required", "crew", "gang_size", "manpower", "staff_required"],
        "resource_requirements": ["resource_requirements", "resources", "machinery", "tools", "equipment_needed"],
        "precedence": ["precedence", "prerequisite", "depends_on", "predecessor", "pred"],
        "incompatible_tasks": ["incompatible_tasks", "incompatible", "conflicts_with", "mutual_exclusion"],
        "earliest_start": ["earliest_start", "start_time", "valid_from", "from_time", "earliest start"],
        "deadline": ["deadline", "target_date", "valid_to", "to_time", "due_date"],
        "traffic_criticality": ["traffic_criticality", "traffic_impact", "line_importance"],
    }

    BLOCK_HEADER_ALIASES: Dict[str, List[str]] = {
        "block_id": ["block_id", "blockid", "block id", "id", "window_id", "slot_id"],
        "corridor_id": ["corridor_id", "corridor", "section", "route"],
        "start_time": ["start_time", "start", "from", "window_start", "from_time"],
        "end_time": ["end_time", "end", "to", "window_end", "to_time"],
        "available_capacity": ["available_capacity", "capacity", "slots", "max_tasks", "task_capacity"],
        "resource_capacity": ["resource_capacity", "crew_capacity", "max_crew", "gang_capacity", "manpower_limit"],
        "safety_constraints": ["safety_constraints", "safety", "permissions", "possession_type", "block_type"],
        "permitted_departments": ["permitted_departments", "departments", "allowed_depts", "depts"],
        "traffic_density": ["traffic_density", "density", "traffic", "traffic_level"],
    }

    TRAIN_HEADER_ALIASES: Dict[str, List[str]] = {
        "train_id": ["train_id", "train_no", "train id", "train", "train_number", "id"],
        "corridor_id": ["corridor_id", "corridor", "section", "route"],
        "train_type": ["train_type", "type", "category", "service_type"],
        "direction": ["direction", "dir", "line", "movement"],
        "start_time": ["start_time", "start", "entry_time", "departure"],
        "end_time": ["end_time", "end", "exit_time", "arrival"],
        "operational_priority": ["operational_priority", "priority", "importance", "rank"],
        "disruption_penalty": ["disruption_penalty", "penalty", "disruption_cost", "delay_cost"],
    }

    @staticmethod
    def _fuzzy_map_headers(fieldnames: List[str], alias_map: Dict[str, List[str]]) -> Dict[str, str]:
        mapping: Dict[str, str] = {}
        for raw in fieldnames:
            normalized_raw = re.sub(r"[\s-]+", "_", raw.strip().lower())
            matched_attr = None
            for attr, aliases in alias_map.items():
                normalized_aliases = {re.sub(r"[\s-]+", "_", alias.strip().lower()) for alias in aliases}
                if normalized_raw in normalized_aliases:
                    matched_attr = attr
                    break
            if matched_attr:
                mapping[raw] = matched_attr
        return mapping

    @staticmethod
    def parse_datetime(raw_value: Any) -> Optional[datetime]:
        if not raw_value:
            return None
        if isinstance(raw_value, datetime):
            return raw_value

        val_str = str(raw_value).strip()
        formats = [
            "%Y-%m-%dT%H:%M:%S",
            "%Y-%m-%dT%H:%M",
            "%Y-%m-%d %H:%M:%S",
            "%Y-%m-%d %H:%M",
            "%d/%m/%Y %H:%M:%S",
            "%d/%m/%Y %H:%M",
            "%d-%m-%Y %H:%M:%S",
            "%d-%m-%Y %H:%M",
            "%Y-%m-%d",
            "%d/%m/%Y",
            "%d-%m-%Y",
        ]
        for fmt in formats:
            try:
                return datetime.strptime(val_str, fmt)
            except ValueError:
                continue
        try:
            return datetime.fromisoformat(val_str)
        except Exception:
            return None

    @staticmethod
    def parse_department(val: Any) -> Department:
        s = str(val or "").strip().upper()
        if "ENG" in s or "CIVIL" in s or "P-WAY" in s or "PWAY" in s or "TRACK" in s or "BRIDGE" in s:
            return Department.ENGINEERING
        if "S&T" in s or "SIGNAL" in s or "TELECOM" in s or "ST" in s or "SIG" in s:
            return Department.S_AND_T
        if "TRD" in s or "OHE" in s or "TRACTION" in s or "ELECT" in s or "POWER" in s:
            return Department.TRD
        return Department.ENGINEERING

    @staticmethod
    def parse_severity(val: Any) -> Severity:
        s = str(val or "").strip().upper()
        if "CRIT" in s or s in ("1", "P1", "EMERGENCY", "VERY HIGH"):
            return Severity.CRITICAL
        if "MAJ" in s or s in ("2", "P2", "HIGH"):
            return Severity.MAJOR
        if "MIN" in s or s in ("3", "P3", "MEDIUM"):
            return Severity.MINOR
        return Severity.ROUTINE

    @staticmethod
    def parse_list(val: Any) -> List[str]:
        if not val:
            return []
        if isinstance(val, list):
            return [str(x).strip() for x in val if str(x).strip()]
        val_str = str(val).strip().strip("[]\"'")
        if not val_str:
            return []
        items = re.split(r"[,;|/]", val_str)
        return [i.strip() for i in items if i.strip()]

    def clean_and_parse_tasks(self, csv_content: str, default_base_time: Optional[datetime] = None) -> Tuple[List[MaintenanceTask], DataCleaningReport]:
        report = DataCleaningReport(entity_type="tasks")
        tasks: List[MaintenanceTask] = []
        base_t = default_base_time or datetime(2026, 9, 1, 0, 0, 0)

        reader = csv.DictReader(io.StringIO(csv_content))
        if not reader.fieldnames:
            report.rejected_rows.append({"row": 0, "reason": "Empty CSV or no header row found."})
            return [], report

        header_map = self._fuzzy_map_headers(reader.fieldnames, self.TASK_HEADER_ALIASES)
        seen_ids: Set[str] = set()

        for row_idx, raw_row in enumerate(reader, start=2):
            report.total_rows += 1
            row_data: Dict[str, Any] = {}
            for col_name, raw_val in raw_row.items():
                if col_name in header_map:
                    row_data[header_map[col_name]] = (raw_val or "").strip()

            task_id = row_data.get("task_id")
            if not task_id:
                task_id = f"TASK-GEN-{row_idx:03d}"
                report.auto_corrected_count += 1
                report.corrections.append({
                    "row": row_idx,
                    "field": "task_id",
                    "original": "",
                    "corrected": task_id,
                    "reason": "Missing task ID, auto-generated unique identifier."
                })

            if task_id in seen_ids:
                report.rejected_count += 1
                report.rejected_rows.append({
                    "row": row_idx,
                    "task_id": task_id,
                    "reason": f"Duplicate task ID '{task_id}'. Task IDs must be unique."
                })
                continue
            seen_ids.add(task_id)

            raw_dept = row_data.get("department")
            dept = self.parse_department(raw_dept)
            if raw_dept and raw_dept.upper() != dept.value:
                report.auto_corrected_count += 1
                report.corrections.append({
                    "row": row_idx,
                    "field": "department",
                    "original": raw_dept,
                    "corrected": dept.value,
                    "reason": "Standardized department naming."
                })

            raw_sev = row_data.get("severity")
            sev = self.parse_severity(raw_sev)

            corridor = row_data.get("corridor_id", "").strip().upper()
            if not corridor:
                corridor = "CSTM-KYN"
                report.warnings_count += 1
                report.warnings.append({
                    "row": row_idx,
                    "task_id": task_id,
                    "message": "Missing corridor_id, defaulted to 'CSTM-KYN'."
                })

            earliest_start = self.parse_datetime(row_data.get("earliest_start"))
            deadline = self.parse_datetime(row_data.get("deadline"))
            if not earliest_start:
                earliest_start = base_t
                report.auto_corrected_count += 1
                report.corrections.append({
                    "row": row_idx,
                    "field": "earliest_start",
                    "original": row_data.get("earliest_start", ""),
                    "corrected": earliest_start.isoformat(),
                    "reason": "Invalid or missing earliest_start; defaulted to horizon base."
                })
            if not deadline or deadline <= earliest_start:
                deadline = earliest_start + timedelta(days=3)
                report.auto_corrected_count += 1
                report.corrections.append({
                    "row": row_idx,
                    "field": "deadline",
                    "original": row_data.get("deadline", ""),
                    "corrected": deadline.isoformat(),
                    "reason": "Deadline was missing or earlier than start; adjusted to +3 days."
                })

            def parse_num(key: str, default: float, min_val: float, max_val: float) -> float:
                raw = row_data.get(key, "")
                cleaned = re.sub(r"[^\d.]", "", str(raw))
                try:
                    num = float(cleaned) if cleaned else default
                except ValueError:
                    num = default
                return max(min_val, min(max_val, num))

            criticality = parse_num("criticality", 60.0 if sev == Severity.CRITICAL else 40.0, 0.0, 100.0)
            safety_risk = parse_num("safety_risk", 75.0 if sev == Severity.CRITICAL else 35.0, 0.0, 100.0)
            overdue_days = int(parse_num("overdue_days", 0.0, 0.0, 365.0))
            duration = int(parse_num("estimated_duration_min", 120.0, 15.0, 720.0))
            crew = int(parse_num("crew_required", 4.0, 1.0, 50.0))
            traffic_crit = parse_num("traffic_criticality", 50.0, 0.0, 100.0)

            precedence = self.parse_list(row_data.get("precedence"))
            incompatible = self.parse_list(row_data.get("incompatible_tasks"))

            task = MaintenanceTask(
                task_id=task_id,
                department=dept,
                asset_id=row_data.get("asset_id") or f"AST-{corridor[:3]}-{row_idx:02d}",
                asset_type=row_data.get("asset_type") or "RAIL_ASSET",
                corridor_id=corridor,
                location=row_data.get("location") or "KM 0/0",
                defect_type=row_data.get("defect_type") or "ROUTINE_INSPECTION",
                severity=sev,
                criticality=criticality,
                safety_risk=safety_risk,
                overdue_days=overdue_days,
                estimated_duration_min=duration,
                crew_required=crew,
                resource_requirements=self.parse_list(row_data.get("resource_requirements")),
                precedence=precedence,
                incompatible_tasks=incompatible,
                earliest_start=earliest_start,
                deadline=deadline,
                status=TaskStatus.PENDING,
                traffic_criticality=traffic_crit,
            )
            tasks.append(task)
            report.valid_rows += 1

        task_id_set = {t.task_id for t in tasks}
        precedence_graph: Dict[str, List[str]] = {t.task_id: [] for t in tasks}
        for t in tasks:
            for pred in t.precedence:
                if pred not in task_id_set:
                    report.warnings_count += 1
                    report.warnings.append({
                        "task_id": t.task_id,
                        "message": f"Predecessor task '{pred}' does not exist in the task backlog; dependency ignored."
                    })
                else:
                    precedence_graph[t.task_id].append(pred)

        visited: Dict[str, int] = {}
        def has_cycle(node: str) -> bool:
            visited[node] = 1
            for neighbor in precedence_graph.get(node, []):
                if visited.get(neighbor) == 1:
                    return True
                if visited.get(neighbor, 0) == 0 and has_cycle(neighbor):
                    return True
            visited[node] = 2
            return False

        cyclic_tasks = set()
        for t_id in precedence_graph:
            if visited.get(t_id, 0) == 0:
                if has_cycle(t_id):
                    cyclic_tasks.add(t_id)

        if cyclic_tasks:
            report.warnings_count += len(cyclic_tasks)
            for ct in cyclic_tasks:
                report.warnings.append({
                    "task_id": ct,
                    "message": f"Cyclic dependency detected involving task '{ct}'. Dependency relaxed to prevent solver deadlock."
                })
                for t in tasks:
                    if t.task_id == ct:
                        t.precedence = []

        return tasks, report

    def clean_and_parse_blocks(self, csv_content: str, default_base_time: Optional[datetime] = None) -> Tuple[List[BlockWindow], DataCleaningReport]:
        report = DataCleaningReport(entity_type="blocks")
        blocks: List[BlockWindow] = []
        base_t = default_base_time or datetime(2026, 9, 1, 0, 0, 0)

        reader = csv.DictReader(io.StringIO(csv_content))
        if not reader.fieldnames:
            report.rejected_rows.append({"row": 0, "reason": "Empty CSV or no header row found."})
            return [], report

        header_map = self._fuzzy_map_headers(reader.fieldnames, self.BLOCK_HEADER_ALIASES)
        seen_ids: Set[str] = set()

        for row_idx, raw_row in enumerate(reader, start=2):
            report.total_rows += 1
            row_data: Dict[str, Any] = {}
            for col_name, raw_val in raw_row.items():
                if col_name in header_map:
                    row_data[header_map[col_name]] = (raw_val or "").strip()

            block_id = row_data.get("block_id") or f"BLK-GEN-{row_idx:03d}"
            if block_id in seen_ids:
                report.rejected_count += 1
                report.rejected_rows.append({
                    "row": row_idx,
                    "block_id": block_id,
                    "reason": f"Duplicate block ID '{block_id}'."
                })
                continue
            seen_ids.add(block_id)

            corridor = row_data.get("corridor_id", "").strip().upper() or "CSTM-KYN"
            start_time = self.parse_datetime(row_data.get("start_time")) or base_t + timedelta(hours=row_idx * 2)
            end_time = self.parse_datetime(row_data.get("end_time"))
            if not end_time or end_time <= start_time:
                end_time = start_time + timedelta(hours=3, minutes=30)
                report.auto_corrected_count += 1
                report.corrections.append({
                    "row": row_idx,
                    "field": "end_time",
                    "original": row_data.get("end_time", ""),
                    "corrected": end_time.isoformat(),
                    "reason": "Invalid or missing end_time; adjusted to start_time + 3.5 hrs."
                })

            def parse_int(key: str, default: int, min_val: int) -> int:
                raw = row_data.get(key, "")
                cleaned = re.sub(r"[^\d]", "", str(raw))
                try:
                    val = int(cleaned) if cleaned else default
                except ValueError:
                    val = default
                return max(min_val, val)

            avail_cap = parse_int("available_capacity", 3, 1)
            crew_cap = parse_int("resource_capacity", 10, 1)

            raw_depts = self.parse_list(row_data.get("permitted_departments"))
            permitted: List[Department] = []
            for rd in raw_depts:
                dept = self.parse_department(rd)
                if dept not in permitted:
                    permitted.append(dept)
            if not permitted:
                permitted = [Department.ENGINEERING, Department.S_AND_T, Department.TRD]

            raw_density = (row_data.get("traffic_density") or "MEDIUM").strip().upper()
            density = TrafficDensity.HIGH if "HIGH" in raw_density else TrafficDensity.LOW if "LOW" in raw_density else TrafficDensity.MEDIUM

            safety = self.parse_list(row_data.get("safety_constraints"))
            if not safety:
                safety = ["TRAFFIC_BLOCK_GRANTED"]
                if Department.TRD in permitted:
                    safety.append("POWER_BLOCK_AVAILABLE")

            block = BlockWindow(
                block_id=block_id,
                corridor_id=corridor,
                start_time=start_time,
                end_time=end_time,
                available_capacity=avail_cap,
                resource_capacity=crew_cap,
                safety_constraints=safety,
                permitted_departments=permitted,
                traffic_density=density,
            )
            blocks.append(block)
            report.valid_rows += 1

        return blocks, report

    def clean_and_parse_trains(self, csv_content: str, default_base_time: Optional[datetime] = None) -> Tuple[List[TrainMovement], DataCleaningReport]:
        report = DataCleaningReport(entity_type="trains")
        trains: List[TrainMovement] = []
        base_t = default_base_time or datetime(2026, 9, 1, 0, 0, 0)

        reader = csv.DictReader(io.StringIO(csv_content))
        if not reader.fieldnames:
            report.rejected_rows.append({"row": 0, "reason": "Empty CSV or no header row found."})
            return [], report

        header_map = self._fuzzy_map_headers(reader.fieldnames, self.TRAIN_HEADER_ALIASES)
        seen_ids: Set[str] = set()

        for row_idx, raw_row in enumerate(reader, start=2):
            report.total_rows += 1
            row_data: Dict[str, Any] = {}
            for col_name, raw_val in raw_row.items():
                if col_name in header_map:
                    row_data[header_map[col_name]] = (raw_val or "").strip()

            train_id = row_data.get("train_id") or f"TRN-GEN-{row_idx:03d}"
            if train_id in seen_ids:
                report.rejected_count += 1
                report.rejected_rows.append({
                    "row": row_idx,
                    "train_id": train_id,
                    "reason": f"Duplicate train identifier '{train_id}'."
                })
                continue
            seen_ids.add(train_id)

            corridor = row_data.get("corridor_id", "").strip().upper() or "CSTM-KYN"
            start_time = self.parse_datetime(row_data.get("start_time")) or base_t + timedelta(hours=row_idx)
            end_time = self.parse_datetime(row_data.get("end_time"))
            if not end_time or end_time <= start_time:
                end_time = start_time + timedelta(hours=1, minutes=15)

            raw_type = (row_data.get("train_type") or "").strip().upper()
            if "VANDE" in raw_type or "VB" in raw_type:
                train_type = TrainType.VANDE_BHARAT
            elif "RAJ" in raw_type:
                train_type = TrainType.RAJDHANI_EXPRESS
            elif "GOODS" in raw_type or "FREIGHT" in raw_type:
                train_type = TrainType.FREIGHT
            elif "SUB" in raw_type or "EMU" in raw_type or "LOCAL" in raw_type:
                train_type = TrainType.PASSENGER
            else:
                train_type = TrainType.MAIL_EXPRESS

            raw_prio = re.sub(r"[^\d]", "", str(row_data.get("operational_priority", "")))
            prio = int(raw_prio) if raw_prio else (1 if train_type in (TrainType.VANDE_BHARAT, TrainType.RAJDHANI_EXPRESS) else 3)
            prio = max(1, min(5, prio))

            raw_pen = re.sub(r"[^\d.]", "", str(row_data.get("disruption_penalty", "")))
            penalty = float(raw_pen) if raw_pen else (100.0 if prio == 1 else 30.0)

            raw_dir = (row_data.get("direction") or "UP").strip().upper()
            direction = Direction.DOWN if "DN" in raw_dir or "DOWN" in raw_dir else Direction.BOTH if "BOTH" in raw_dir else Direction.UP

            trn = TrainMovement(
                train_id=train_id,
                corridor_id=corridor,
                train_type=train_type,
                direction=direction,
                start_time=start_time,
                end_time=end_time,
                operational_priority=prio,
                disruption_penalty=penalty,
            )
            trains.append(trn)
            report.valid_rows += 1

        return trains, report

    @staticmethod
    def get_sample_csv_template(entity_type: str) -> str:
        if entity_type == "tasks":
            return (
                "Task ID,Department,Asset ID,Asset Type,Corridor,Location,Defect Type,Severity,Criticality,Safety Risk,Overdue Days,Duration (min),Crew,Earliest Start,Deadline,Precedence\n"
                "TASK-ENG-101,ENGINEERING,TRK-KP-M01,TURNOUT,KYN-PUN,KM 62/14 (Kalyan Yard),Turnout Switch Rail Wear,CRITICAL,92,85,5,180,8,2026-09-01 01:00,2026-09-03 23:59,\n"
                "TASK-SNT-102,S&T,SIG-KP-A04,AXLE_COUNTER,KYN-PUN,KM 62/18 (Kalyan Outer),Digital Axle Counter Reset Drift,MAJOR,78,80,3,90,3,2026-09-01 01:00,2026-09-03 23:59,\n"
                "TASK-TRD-103,TRD,OHE-KP-C12,CONTACT_WIRE,KYN-PUN,KM 63/02,OHE Cantilever Insulator Flashover,CRITICAL,95,90,7,150,6,2026-09-01 01:00,2026-09-02 12:00,\n"
                "TASK-ENG-104,ENGINEERING,TRK-KP-M02,MAINLINE_TRACK,KYN-PUN,KM 71/08,Track Geometry Twist Defect,MAJOR,70,65,2,120,5,2026-09-01 01:00,2026-09-04 18:00,TASK-ENG-101\n"
                "TASK-SNT-105,S&T,SIG-CK-P09,POINT_MACHINE,CSTM-KYN,KM 22/04 (Kurla Yard),Point Machine Overhaul,MAJOR,72,60,1,110,4,2026-09-01 00:30,2026-09-03 18:00,\n"
                "TASK-TRD-106,TRD,OHE-CK-T08,AUTO_TENSIONER,CSTM-KYN,KM 28/10 (Thane Section),Auto Tensioning Device Check,MINOR,45,40,0,90,3,2026-09-01 01:00,2026-09-04 23:59,\n"
                "TASK-ENG-107,ENGINEERING,TRK-CK-R15,RAIL_JOINT,CSTM-KYN,KM 34/06 (Diva Junction),Fishplate Bolt Tightening & Inspection,ROUTINE,30,25,0,60,2,2026-09-01 02:00,2026-09-05 23:59,\n"
            )
        elif entity_type == "blocks":
            return (
                "Block ID,Corridor,Start Time,End Time,Available Capacity,Resource Capacity,Safety Constraints,Permitted Departments,Traffic Density\n"
                "BLK-KP-NIGHT-01,KYN-PUN,2026-09-01 01:30,2026-09-01 05:00,4,14,POWER_BLOCK_AVAILABLE;TRAFFIC_BLOCK_GRANTED,ENGINEERING;S&T;TRD,LOW\n"
                "BLK-KP-ENG-EARLY,KYN-PUN,2026-09-01 05:30,2026-09-01 07:30,2,6,TRAFFIC_BLOCK_GRANTED,ENGINEERING,MEDIUM\n"
                "BLK-KP-NIGHT-02,KYN-PUN,2026-09-02 01:30,2026-09-02 05:00,4,14,POWER_BLOCK_AVAILABLE;TRAFFIC_BLOCK_GRANTED,ENGINEERING;S&T;TRD,LOW\n"
                "BLK-CK-NIGHT-01,CSTM-KYN,2026-09-01 01:15,2026-09-01 04:15,3,10,POWER_BLOCK_AVAILABLE;TRAFFIC_BLOCK_GRANTED,ENGINEERING;S&T;TRD,LOW\n"
                "BLK-CK-NIGHT-02,CSTM-KYN,2026-09-02 01:15,2026-09-02 04:15,3,10,POWER_BLOCK_AVAILABLE;TRAFFIC_BLOCK_GRANTED,ENGINEERING;S&T;TRD,LOW\n"
            )
        elif entity_type == "trains":
            return (
                "Train ID,Corridor,Train Type,Direction,Start Time,End Time,Operational Priority,Disruption Penalty\n"
                "12123-DECCAN-QUEEN,KYN-PUN,EXPRESS,UP,2026-09-01 07:15,2026-09-01 08:30,2,45.0\n"
                "22221-VANDE-BHARAT,KYN-PUN,VANDE_BHARAT,DOWN,2026-09-01 11:30,2026-09-01 12:45,1,120.0\n"
                "BOXN-COAL-FREIGHT,KYN-PUN,GOODS,UP,2026-09-01 02:00,2026-09-01 04:30,4,20.0\n"
                "12051-JAN-SHATABDI,CSTM-KYN,EXPRESS,DOWN,2026-09-01 05:45,2026-09-01 06:40,2,50.0\n"
                "SUB-EMU-KYN-01,CSTM-KYN,SUBURBAN_EMU,UP,2026-09-01 04:30,2026-09-01 05:30,3,35.0\n"
            )
        return ""
