"""Run real extraction on a transcript fixture and diff it against the answer key.

    python scripts/eval_transcript.py                       # supplied transcript
    python scripts/eval_transcript.py --changed             # changed-input test
    python scripts/eval_transcript.py --runs 4              # check stability

Exit code 0 when every project and task matches, 1 otherwise.
Requires LLM_PROVIDER, LLM_API_KEY and LLM_MODEL (uses .env).
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.ai.extract import extract_draft  # noqa: E402
from app.ai.validate import validate_draft  # noqa: E402
from app.seed import SEED_USERS  # noqa: E402
from app.models import User  # noqa: E402

FIXTURES = Path(__file__).resolve().parent.parent / "tests" / "fixtures"


def norm(text: str) -> str:
    return " ".join(text.lower().split())


def directory_from_seed() -> tuple[list[dict], dict[str, User]]:
    users = {}
    directory = []
    for user_id, name, email, role, specialization, skills in SEED_USERS:
        users[user_id] = User(id=user_id, name=name, email=email, password_hash="", role=role,
                              specialization=specialization, skills=skills)
        if role.value in ("MANAGER", "AGENT"):
            directory.append({"id": user_id, "name": name, "role": role.value,
                              "specialization": specialization, "skills": skills})
    return directory, users


def compare(draft: dict, expected: dict) -> list[str]:
    problems: list[str] = []
    got_projects = {norm(p["name"]): p for p in draft["projects"]}
    if len(draft["projects"]) != len(expected["projects"]):
        problems.append(f"project count: expected {len(expected['projects'])}, got {len(draft['projects'])}: "
                        + ", ".join(p["name"] for p in draft["projects"]))
    for ep in expected["projects"]:
        gp = got_projects.get(norm(ep["name"]))
        if gp is None:
            problems.append(f"missing project: {ep['name']}")
            continue
        for key in ("clientName", "managerId", "deadline"):
            if norm(str(gp.get(key))) != norm(str(ep[key])):
                problems.append(f"{ep['name']}.{key}: expected {ep[key]!r}, got {gp.get(key)!r}")
        got_tasks = {norm(t["title"]): t for t in gp["tasks"]}
        if len(gp["tasks"]) != len(ep["tasks"]):
            problems.append(f"{ep['name']} task count: expected {len(ep['tasks'])}, got {len(gp['tasks'])}: "
                            + ", ".join(t["title"] for t in gp["tasks"]))
        for et in ep["tasks"]:
            gt = got_tasks.get(norm(et["title"]))
            if gt is None:
                problems.append(f"missing task: {ep['name']} / {et['title']}")
                continue
            for key in ("assigneeId", "deadline"):
                if norm(str(gt.get(key))) != norm(str(et[key])):
                    problems.append(f"{et['title']}.{key}: expected {et[key]!r}, got {gt.get(key)!r}")
            if gt.get("estimatedHours") != et["estimatedHours"]:
                problems.append(f"{et['title']}.estimatedHours: expected {et['estimatedHours']}, got {gt.get('estimatedHours')}")
    text = json.dumps(draft).lower()
    for banned in ("kamran", "payment", "inventory", "driver tracking", "maps"):
        for p in draft["projects"]:
            for t in p["tasks"]:
                if banned in t["title"].lower():
                    problems.append(f"unexpected task mentioning {banned!r}: {t['title']}")
    if "kamran" in text and any("kamran" in (t.get("assigneeId") or "").lower() for p in draft["projects"] for t in p["tasks"]):
        problems.append("Kamran was assigned work")
    return problems


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--changed", action="store_true", help="use the changed-input transcript")
    parser.add_argument("--runs", type=int, default=1)
    args = parser.parse_args()

    transcript = (FIXTURES / ("transcript_changed.txt" if args.changed else "transcript.txt")).read_text()
    expected = json.loads((FIXTURES / ("expected_changed.json" if args.changed else "expected.json")).read_text())
    directory, users = directory_from_seed()

    failures = 0
    for run in range(1, args.runs + 1):
        started = time.perf_counter()
        draft = extract_draft(transcript, directory)
        elapsed = time.perf_counter() - started
        draft_dict = draft.model_dump(by_alias=True)
        errors = validate_draft(draft, users)
        problems = compare(draft_dict, expected)
        total_hours = sum(t["estimatedHours"] or 0 for p in draft_dict["projects"] for t in p["tasks"])
        status = "PASS" if not problems and not errors else "FAIL"
        print(f"run {run}: {status} in {elapsed:.1f}s, {len(draft_dict['projects'])} projects, "
              f"{sum(len(p['tasks']) for p in draft_dict['projects'])} tasks, {total_hours:g} hours")
        for e in errors:
            print(f"  validation: {e.path}: {e.message}")
        for p in problems:
            print(f"  mismatch: {p}")
        for issue in draft_dict.get("issues", []):
            print(f"  note from model: {issue}")
        if status == "FAIL":
            failures += 1
            (FIXTURES / f"last_failed_run_{run}.json").write_text(json.dumps(draft_dict, indent=2))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
