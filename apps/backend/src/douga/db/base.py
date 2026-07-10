from sqlalchemy.orm import DeclarativeBase

from douga.db.naming import metadata


class Base(DeclarativeBase):
    metadata = metadata
