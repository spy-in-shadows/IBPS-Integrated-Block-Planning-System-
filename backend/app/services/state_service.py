"""
State Service - In-Memory Deterministic State Manager.
Maintains active dataset, current baseline & optimized plans, and adapters.
"""

from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime
import threading

from app.domain.models import (
    MaintenanceTask,
    BlockWindow,
    TrainMovement,
    GoodsForecast,
    BlockPlan,
)
from app.domain.enums import PlanHorizon
from app.data.generator import get_demo_fixture_data, generate_full_synthetic_dataset
from app.scoring.priority_engine import PriorityEngine
from app.optimization.baseline import BaselineScheduler
from app.optimization.optimizer import BlockPlanOptimizer
from app.metrics.evaluator import MetricsEvaluator
from app.adapters.synthetic import (
    SyntheticTMSAdapter,
    SyntheticSMMSAdapter,
    SyntheticTDMSAdapter,
    SyntheticCOAAdapter,
)


class StateService:
    """Singleton in-memory state manager for IBPS prototype."""
    _instance: Optional["StateService"] = None
    _lock: threading.RLock = threading.RLock()

    def __init__(self):
        self.active_dataset_type: str = "demo_fixture"
        self.tasks: List[MaintenanceTask] = []
        self.blocks: List[BlockWindow] = []
        self.trains: List[TrainMovement] = []
        self.goods: List[GoodsForecast] = []
        self.emergency_task: Optional[MaintenanceTask] = None

        # Adapters
        self.tms_adapter = SyntheticTMSAdapter()
        self.smms_adapter = SyntheticSMMSAdapter()
        self.tdms_adapter = SyntheticTDMSAdapter()
        self.coa_adapter = SyntheticCOAAdapter()

        # Cached Plans, Plan Registry & Evaluator
        self.baseline_plan: Optional[BlockPlan] = None
        self.optimized_plan: Optional[BlockPlan] = None
        self.plans_registry: Dict[str, BlockPlan] = {}
        self.plan_tasks_registry: Dict[str, List[MaintenanceTask]] = {}
        self.plan_sequence: int = 0
        self.latest_cleaning_report: Optional[Dict[str, Any]] = None
        self.evaluator: Optional[MetricsEvaluator] = None
        self.priority_engine = PriorityEngine()

        # Initialize with demo fixture
        self.load_dataset("demo_fixture")

    @classmethod
    def get_instance(cls) -> "StateService":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    def load_dataset(self, dataset_type: str = "demo_fixture") -> None:
        """Loads and scores dataset, resetting plan caches."""
        with self._lock:
            self.active_dataset_type = dataset_type
            self.baseline_plan = None
            self.optimized_plan = None
            self.plans_registry.clear()
            self.plan_tasks_registry.clear()
            self.plan_sequence = 0
            self.latest_cleaning_report = None
            if dataset_type == "full_dataset":
                t, b, tr, g = generate_full_synthetic_dataset(seed=42)
                _, _, _, _, em = get_demo_fixture_data()
                self.tasks = t
                self.blocks = b
                self.trains = tr
                self.goods = g
                self.emergency_task = em
            else:
                t, b, tr, g, em = get_demo_fixture_data()
                self.tasks = t
                self.blocks = b
                self.trains = tr
                self.goods = g
                self.emergency_task = em

            # Score all tasks
            self.priority_engine.score_all(self.tasks)
            if self.emergency_task:
                self.priority_engine.score_task(self.emergency_task)

            # Update adapters
            self.tms_adapter.set_tasks(self.tasks)
            self.smms_adapter.set_tasks(self.tasks)
            self.tdms_adapter.set_tasks(self.tasks)
            self.coa_adapter.set_data(self.blocks, self.trains, self.goods)

            # Evaluator
            self.evaluator = MetricsEvaluator(self.tasks, self.blocks, self.trains, self.goods)

            # Pre-generate deterministic baseline & optimized plans
            self._generate_initial_plans()

    def _generate_initial_plans(self) -> None:
        """Computes baseline and optimized plans deterministically."""
        # 1. Baseline
        baseline_scheduler = BaselineScheduler(self.tasks, self.blocks, self.trains, self.goods)
        self.baseline_plan = baseline_scheduler.solve(horizon=PlanHorizon.WEEKLY)
        self.evaluator.evaluate_plan(self.baseline_plan)
        if self.baseline_plan:
            self.register_plan(self.baseline_plan)

        # 2. Optimized
        optimizer = BlockPlanOptimizer(self.tasks, self.blocks, self.trains, self.goods)
        self.optimized_plan = optimizer.solve(horizon=PlanHorizon.WEEKLY, enable_objective=True)
        self.evaluator.evaluate_plan(self.optimized_plan)
        if self.optimized_plan:
            self.register_plan(self.optimized_plan, make_active=True)

    def set_user_dataset(
        self,
        tasks: List[MaintenanceTask],
        blocks: Optional[List[BlockWindow]] = None,
        trains: Optional[List[TrainMovement]] = None,
        goods: Optional[List[GoodsForecast]] = None,
        report: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Applies user-uploaded CSV dataset to state, recalculates priority and initial plans."""
        with self._lock:
            self.active_dataset_type = "user_uploaded"
            self.baseline_plan = None
            self.optimized_plan = None
            self.plans_registry.clear()
            self.plan_tasks_registry.clear()
            self.plan_sequence = 0
            self.emergency_task = None
            self.tasks = tasks
            if blocks is not None and len(blocks) > 0:
                self.blocks = blocks
            if trains is not None and len(trains) > 0:
                self.trains = trains
            if goods is not None:
                self.goods = goods

            # Score all tasks
            self.priority_engine.score_all(self.tasks)
            self.latest_cleaning_report = report

            # Update adapters
            self.tms_adapter.set_tasks(self.tasks)
            self.smms_adapter.set_tasks(self.tasks)
            self.tdms_adapter.set_tasks(self.tasks)
            self.coa_adapter.set_data(self.blocks, self.trains, self.goods)

            # Evaluator
            self.evaluator = MetricsEvaluator(self.tasks, self.blocks, self.trains, self.goods)

            # Re-generate initial plans
            self._generate_initial_plans()

    def get_plan_by_id(self, plan_id: str) -> Optional[BlockPlan]:
        """Retrieves a plan from the registry or current active plans."""
        if plan_id in self.plans_registry:
            return self.plans_registry[plan_id]
        if self.optimized_plan and self.optimized_plan.plan_id == plan_id:
            return self.optimized_plan
        if self.baseline_plan and self.baseline_plan.plan_id == plan_id:
            return self.baseline_plan
        return None

    def register_plan(
        self,
        plan: BlockPlan,
        tasks: Optional[List[MaintenanceTask]] = None,
        make_active: bool = False,
    ) -> BlockPlan:
        """Persist a plan version and the task snapshot used to produce it."""
        self.plans_registry[plan.plan_id] = plan
        self.plan_tasks_registry[plan.plan_id] = [
            task.model_copy(deep=True) for task in (tasks if tasks is not None else self.tasks)
        ]
        if make_active:
            self.optimized_plan = plan
        return plan

    def get_tasks_for_plan(self, plan_id: str) -> List[MaintenanceTask]:
        """Return the task snapshot associated with a plan version."""
        return self.plan_tasks_registry.get(plan_id, self.tasks)

    def next_plan_sequence(self) -> int:
        self.plan_sequence += 1
        return self.plan_sequence

    def list_registered_plans(self) -> List[BlockPlan]:
        """Return plan versions in generation order."""
        return list(self.plans_registry.values())


# Global singleton helper
def get_state() -> StateService:
    return StateService.get_instance()
