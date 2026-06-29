"""
Dedicated thread pool for CPU-bound file parsing.

Login's bcrypt check and file parsing both run via thread-offloading to stay off the
event loop, but they must NOT share asyncio's default executor: a few seconds-long file
parse can fully occupy every worker thread in that pool, and a login request arriving
during that window has nowhere to run its bcrypt check until a worker frees up — measured
at 13.5s of added login latency on a small pool versus 91ms with no contention. A separate,
small pool for parsing guarantees the default executor (and anything else relying on it,
like login) is never starved by a heavy upload.
"""
from concurrent.futures import ThreadPoolExecutor

file_parsing_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="file-parse")
