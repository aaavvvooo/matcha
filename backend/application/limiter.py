from slowapi import Limiter
from slowapi.util import get_remote_address

# In-memory storage: rate-limit counters reset on process restart and are not
# shared across multiple workers. Sufficient for single-process deployment;
# configure storage_uri (Redis/Memcached) if running behind a multi-worker setup.
limiter = Limiter(key_func=get_remote_address)
