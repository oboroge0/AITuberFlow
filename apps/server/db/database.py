import json
import os
from datetime import datetime

from sqlalchemy import Column, DateTime, String, Text, create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./aituber_flow.db")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


class WorkflowDB(Base):
    __tablename__ = "workflows"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    nodes_json = Column(Text, default="[]")
    connections_json = Column(Text, default="[]")
    character_json = Column(Text, default='{"name": "AI Assistant", "personality": "Friendly and helpful"}')
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    @property
    def nodes(self):
        return json.loads(self.nodes_json) if self.nodes_json else []

    @nodes.setter
    def nodes(self, value):
        self.nodes_json = json.dumps(value)

    @property
    def connections(self):
        return json.loads(self.connections_json) if self.connections_json else []

    @connections.setter
    def connections(self, value):
        self.connections_json = json.dumps(value)

    @property
    def character(self):
        return json.loads(self.character_json) if self.character_json else {}

    @character.setter
    def character(self, value):
        self.character_json = json.dumps(value)


def init_db():
    """Initialize database tables."""
    Base.metadata.create_all(bind=engine)


def get_db():
    """Get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
