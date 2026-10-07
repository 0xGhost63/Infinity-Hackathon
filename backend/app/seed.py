"""Seed the ten demo accounts. Safe to run repeatedly: rows are matched by email.

    python -m app.seed
"""
from __future__ import annotations

import logging

from sqlalchemy import func, select

from app.db import SessionLocal, init_db
from app.models import Role, User
from app.security import hash_password

DEMO_PASSWORD = "Demo123!"

SEED_USERS = [
    ("ADMIN", "Admin", "admin@novaworks.example", Role.ADMIN, "Administrator", ["Company overview", "transcript creation"]),
    ("PM01", "Ayesha Khan", "ayesha@novaworks.example", Role.MANAGER, "Web PM", ["Web projects", "client coordination"]),
    ("PM02", "Bilal Ahmed", "bilal@novaworks.example", Role.MANAGER, "Mobile PM", ["Mobile projects", "delivery planning"]),
    ("PM03", "Hina Malik", "hina@novaworks.example", Role.MANAGER, "AI PM", ["AI projects", "requirement review"]),
    ("DEV01", "Ali Raza", "ali@novaworks.example", Role.AGENT, "Full-Stack", ["React", "frontend integration"]),
    ("DEV02", "Hamza Shah", "hamza@novaworks.example", Role.AGENT, "Full-Stack", ["Node.js", "databases", "APIs"]),
    ("DEV03", "Sara Noor", "sara@novaworks.example", Role.AGENT, "App Developer", ["Flutter", "mobile UI"]),
    ("DEV04", "Usman Tariq", "usman@novaworks.example", Role.AGENT, "App Developer", ["Flutter", "integration", "testing"]),
    ("DEV05", "Zain Abbas", "zain@novaworks.example", Role.AGENT, "AI Developer", ["LLMs", "extraction", "prompts"]),
    ("DEV06", "Maryam Asif", "maryam@novaworks.example", Role.AGENT, "AI Developer", ["Retrieval", "document processing"]),
]


def seed_demo_users() -> tuple[int, int]:
    init_db()
    created = updated = 0
    password_hash = hash_password(DEMO_PASSWORD)
    with SessionLocal() as db:
        for user_id, name, email, role, specialization, skills in SEED_USERS:
            existing = db.scalar(select(User).where(User.email == email))
            if existing is None:
                db.add(User(id=user_id, name=name, email=email, password_hash=password_hash,
                            role=role, specialization=specialization, skills=skills))
                created += 1
            else:
                existing.name = name
                existing.role = role
                existing.specialization = specialization
                existing.skills = skills
                updated += 1
        db.commit()
        total = db.scalar(select(func.count()).select_from(User)) or 0
    return created, updated, total


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    created, updated, total = seed_demo_users()
    print(f"Seed complete: created {created}, updated {updated}, total {total}")
