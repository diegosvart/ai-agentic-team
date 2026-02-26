# Agentic TI OS – Structured logging (JSONL)

import json
import logging
import os


def get_logger(name: str) -> logging.Logger:
    """Return a logger that emits JSONL by default when LOG_FORMAT=jsonl."""
    logger = logging.getLogger(name)
    if os.getenv("LOG_FORMAT") == "jsonl":
        handler = logging.StreamHandler()
        handler.setFormatter(JsonFormatter())
        if not logger.handlers:
            logger.addHandler(handler)
    return logger


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        return json.dumps({
            "ts": self.formatTime(record),
            "level": record.levelname,
            "name": record.name,
            "message": record.getMessage(),
        })
