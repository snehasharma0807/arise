from slowapi import Limiter
from slowapi.util import get_remote_address
from app.config import RATE_LIMIT_PER_MINUTE, RATE_LIMIT_PER_HOUR, RATE_LIMIT_PER_DAY

limiter = Limiter(key_func=get_remote_address)

RATE_LIMIT_STRING = (
    f"{RATE_LIMIT_PER_MINUTE}/minute;"
    f"{RATE_LIMIT_PER_HOUR}/hour;"
    f"{RATE_LIMIT_PER_DAY}/day"
)
