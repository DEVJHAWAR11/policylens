"""Retry decorator w/ exponential backoff."""

import functools
import re
import time
from typing import Callable, ParamSpec, Tuple, Type, TypeVar

from rag_engine.infra.llm_guard import ServiceBusy

from .logger import get_logger

logger = get_logger(__name__)

_TRY_AGAIN = re.compile(r"try again in ([\d.]+)\s*(ms|s)", re.IGNORECASE)
_MAX_SERVER_HINT = 30.0


def _server_suggested_delay(exc: BaseException) -> float:
    """Delay the provider asked for (Retry-After header or "try again in 7.2s"), else 0."""
    response = getattr(exc, "response", None)
    headers = getattr(response, "headers", None) or {}
    try:
        value = headers.get("retry-after") or headers.get("Retry-After")
        if value:
            return min(float(value), _MAX_SERVER_HINT)
    except (TypeError, ValueError):
        pass
    match = _TRY_AGAIN.search(str(exc))
    if match:
        seconds = float(match.group(1)) / (1000.0 if match.group(2).lower() == "ms" else 1.0)
        return min(seconds, _MAX_SERVER_HINT)
    return 0.0


P = ParamSpec("P")
R = TypeVar("R")


def with_retry(
    max_retries: int = 3,
    delay: float = 1.0,
    backoff: float = 2.0,
    exceptions: Tuple[Type[BaseException], ...] = (Exception,),
) -> Callable[[Callable[P, R]], Callable[P, R]]:
    def decorator(func: Callable[P, R]) -> Callable[P, R]:
        @functools.wraps(func)
        def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
            current_delay = delay
            last_exception: BaseException | None = None

            for attempt in range(1, max_retries + 1):
                try:
                    return func(*args, **kwargs)  # type: ignore[arg-type]
                except ServiceBusy:
                    raise  # deliberate backpressure — callers turn it into a 503, retrying defeats it
                except exceptions as exc:
                    last_exception = exc
                    if attempt == max_retries:
                        logger.error(
                            "Function '%s' failed after %d attempts: %s",
                            func.__name__,
                            max_retries,
                            exc,
                        )
                        raise
                    logger.warning(
                        "Function '%s' attempt %d/%d failed: %s — retrying in %.1fs",
                        func.__name__,
                        attempt,
                        max_retries,
                        exc,
                        current_delay,
                    )
                    # a provider that says "try again in 7s" knows better than our backoff
                    sleep_for = max(current_delay, _server_suggested_delay(exc) + 0.25)
                    time.sleep(sleep_for)
                    current_delay *= backoff

            raise last_exception  # type: ignore[misc]

        return wrapper  # type: ignore[return-value]

    return decorator
