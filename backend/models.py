from __future__ import annotations
import datetime
from sqlalchemy import String, Text, Integer, ForeignKey, DateTime, func, Table, Column
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base

paper_folders = Table(
    "paper_folders",
    Base.metadata,
    Column("paper_id", Integer, ForeignKey("papers.id"), primary_key=True),
    Column("folder_id", Integer, ForeignKey("folders.id"), primary_key=True),
)


class Folder(Base):
    __tablename__ = "folders"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255))
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("folders.id"), default=None)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    children: Mapped[list[Folder]] = relationship("Folder", back_populates="parent", lazy="selectin")
    parent: Mapped[Folder | None] = relationship("Folder", back_populates="children", remote_side=[id], lazy="noload")
    papers: Mapped[list[Paper]] = relationship("Paper", back_populates="folder", lazy="selectin")


class Paper(Base):
    __tablename__ = "papers"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(500))
    authors: Mapped[str | None] = mapped_column(String(1000), default=None)
    abstract: Mapped[str | None] = mapped_column(Text, default=None)
    file_path: Mapped[str | None] = mapped_column(String(1000), default=None)
    paper_dir: Mapped[str | None] = mapped_column(String(1000), default=None)
    has_markdown: Mapped[bool] = mapped_column(default=False)
    folder_id: Mapped[int | None] = mapped_column(ForeignKey("folders.id"), default=None)
    tags: Mapped[str | None] = mapped_column(String(1000), default=None)
    venue: Mapped[str | None] = mapped_column(String(500), default=None)
    publish_date: Mapped[str | None] = mapped_column(String(100), default=None)
    brief_note: Mapped[str | None] = mapped_column(Text, default=None)
    importance: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    folder: Mapped[Folder | None] = relationship("Folder", back_populates="papers", lazy="selectin")
    folders: Mapped[list[Folder]] = relationship("Folder", secondary=paper_folders, backref="papers_m2m", lazy="selectin")
    notes: Mapped[list[Note]] = relationship("Note", back_populates="paper", cascade="all, delete-orphan", lazy="selectin")


class AuthorInfo(Base):
    __tablename__ = "author_infos"

    id: Mapped[int] = mapped_column(primary_key=True)
    paper_id: Mapped[int] = mapped_column(ForeignKey("papers.id", ondelete="CASCADE"))
    author_name: Mapped[str] = mapped_column(String(300))
    affiliation: Mapped[str | None] = mapped_column(String(500), default=None)
    research_areas: Mapped[str | None] = mapped_column(Text, default=None)
    notable_works: Mapped[str | None] = mapped_column(Text, default=None)
    profile_links: Mapped[str | None] = mapped_column(Text, default=None)
    relationship_to_paper: Mapped[str | None] = mapped_column(Text, default=None)
    raw_markdown: Mapped[str] = mapped_column(Text, default="")
    explored_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())

    paper: Mapped["Paper"] = relationship("Paper", backref="author_infos")


class Note(Base):
    __tablename__ = "notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    paper_id: Mapped[int] = mapped_column(ForeignKey("papers.id", ondelete="CASCADE"))
    title: Mapped[str | None] = mapped_column(String(500), default="Untitled")
    content: Mapped[str] = mapped_column(Text, default="")
    page_number: Mapped[int | None] = mapped_column(Integer, default=None)
    selection_text: Mapped[str | None] = mapped_column(Text, default=None)
    position_data: Mapped[str | None] = mapped_column(Text, default=None)  # JSON string
    file_name: Mapped[str | None] = mapped_column(String(500), default=None)
    note_type: Mapped[str] = mapped_column(String(50), default="note")
    color: Mapped[str | None] = mapped_column(String(50), default=None)  # highlight color
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    paper: Mapped[Paper] = relationship("Paper", back_populates="notes")


class PaperReference(Base):
    __tablename__ = "paper_references"

    id: Mapped[int] = mapped_column(primary_key=True)
    source_paper_id: Mapped[int] = mapped_column(ForeignKey("papers.id", ondelete="CASCADE"))
    target_paper_id: Mapped[int] = mapped_column(ForeignKey("papers.id", ondelete="CASCADE"))
    source_page: Mapped[int | None] = mapped_column(Integer, default=None)
    description: Mapped[str | None] = mapped_column(Text, default=None)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now())

    source_paper: Mapped[Paper] = relationship("Paper", foreign_keys=[source_paper_id])
    target_paper: Mapped[Paper] = relationship("Paper", foreign_keys=[target_paper_id])


class SyncConfig(Base):
    __tablename__ = "sync_config"

    id: Mapped[int] = mapped_column(primary_key=True)
    webdav_url: Mapped[str] = mapped_column(String(500), default="https://dav.jianguoyun.com/dav/")
    username: Mapped[str] = mapped_column(String(255))
    password: Mapped[str] = mapped_column(String(1000))  # Fernet encrypted
    sync_folder: Mapped[str] = mapped_column(String(500), default="/AI4Research")
    last_sync_at: Mapped[datetime.datetime | None] = mapped_column(DateTime, default=None)


class AppSetting(Base):
    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(200), primary_key=True)
    value: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
