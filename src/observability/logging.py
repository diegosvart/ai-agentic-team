# Agentic TI OS – Structured logging (JSONL)
# Logs per run: optional file handler to logs/ when LOG_DIR or default ./logs

import json
import logging
import os
from pathlib import Path

LOGS_DIR = Path(os.environ.get("LOG_DIR", "logs"))


def get_logger(name: str) -> logging.Logger:
    """Return a logger that emits JSONL. Writes to logs/ when LOG_DIR is set or default ./logs."""
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger
    formatter = JsonFormatter()
    if os.getenv("LOG_FORMAT", "jsonl") == "jsonl":
        logger.addHandler(logging.StreamHandler())
        logger.handlers[-1].setFormatter(formatter)
        try:
            LOGS_DIR.mkdir(parents=True, exist_ok=True)
            fh = logging.FileHandler(LOGS_DIR / "run.jsonl", encoding="utf-8")
            fh.setFormatter(formatter)
            logger.addHandler(fh)
        except OSError:
            pass
    return logger


class JsonFormatter(logging.Formatter):
    _STANDARD_ATTRS = frozenset({
        "name", "msg", "args", "created", "filename", "funcName", "levelname", "levelno",
        "lineno", "module", "msecs", "pathname", "process", "processName", "relativeCreated",
        "stack_info", "exc_info", "exc_text", "message", "taskName", "thread", "threadName",
    })

    def format(self, record: logging.LogRecord) -> str:
        out = {
            "ts": self.formatTime(record),
            "level": record.levelname,
            "name": record.name,
            "message": record.getMessage(),
        }
        for k, v in record.__dict__.items():
            if k not in self._STANDARD_ATTRS and v is not None:
                out[k] = v
        return json.dumps(out)
