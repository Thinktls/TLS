"""
Guardrail: statically detect blocking calls inside async route handlers.

This codifies the manual audit that found three real production bugs (login lag from
thread-pool contention, the AI chatbot blocking the backend, the inbound-email webhook
blocking on parse + SMTP). Each was the same root cause: a call that blocks the event
loop — a synchronous HTTP client, a CPU-bound parse, an unwrapped SMTP send — made
directly inside `async def`, instead of via `await`, `asyncio.to_thread`, or
`loop.run_in_executor`.

This test scans every `async def` in app/api/routes/*.py for calls matching known-blocking
patterns and fails with the exact file/line/function if one slips back in. It is a static
check, not a runtime one — false negatives are possible for patterns not in the blocklist,
but anything matching the blocklist below is a real, proven regression class.

To extend the blocklist: add new sync-client constructors, sync HTTP libraries, or known
CPU-bound functions (e.g. a new file-format parser) as they're introduced.
"""
import ast
import pathlib

ROUTES_DIR = pathlib.Path(__file__).resolve().parent.parent / "app" / "api" / "routes"

# Module-level sync HTTP calls — e.g. httpx.post(...), requests.get(...).
# httpx.AsyncClient().post(...) is fine: its func is an Attribute on a Name that is NOT
# one of these module names (it's a client instance), so it never matches here.
_SYNC_HTTP_MODULES = {"httpx", "requests", "urllib"}
_SYNC_HTTP_METHODS = {"get", "post", "put", "delete", "patch", "request"}

# Constructors for known-synchronous SDK clients. The async equivalent (AsyncAnthropic)
# is a different attribute name and never matches.
_SYNC_CLIENT_CONSTRUCTORS = {
    ("anthropic", "Anthropic"),
}

# time.sleep blocks the event loop; asyncio.sleep is the correct async equivalent and has
# a different (Name, not Attribute-on-time) call shape, so it never matches here.
_SYNC_SLEEP = {("time", "sleep")}

# Known CPU-bound entry points that must always run via asyncio.to_thread /
# loop.run_in_executor. When they're passed as a bare reference into to_thread/
# run_in_executor (the correct pattern), they appear as an ast.Name VALUE, not an
# ast.Call — so this only flags the incorrect "call it directly" usage.
_BLOCKING_BARE_FUNCTIONS = {
    "parse_master_file",
    "parse_buyer_file",
    "ai_parse_buyer_file",
    "_send",  # app.services.email_service._send — synchronous SMTP/SendGrid send
}


def _call_signature(node: ast.Call) -> tuple[str, str] | None:
    """Return (module_or_object, attr) for an Attribute call, or None for a bare Name call."""
    func = node.func
    if isinstance(func, ast.Attribute) and isinstance(func.value, ast.Name):
        return (func.value.id, func.attr)
    return None


def _find_violations(tree: ast.Module, filename: str) -> list[str]:
    violations = []

    class Visitor(ast.NodeVisitor):
        def __init__(self):
            self.async_func_stack: list[str] = []

        def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef):
            self.async_func_stack.append(node.name)
            self.generic_visit(node)
            self.async_func_stack.pop()

        def visit_Call(self, node: ast.Call):
            if self.async_func_stack:
                func_name = self.async_func_stack[-1]
                sig = _call_signature(node)
                if sig and sig[0] in _SYNC_HTTP_MODULES and sig[1] in _SYNC_HTTP_METHODS:
                    violations.append(
                        f"{filename}:{node.lineno} in async def {func_name}() — "
                        f"blocking call {sig[0]}.{sig[1]}(...) (use {sig[0]}.AsyncClient or await)"
                    )
                elif sig and sig in _SYNC_CLIENT_CONSTRUCTORS:
                    violations.append(
                        f"{filename}:{node.lineno} in async def {func_name}() — "
                        f"sync client {sig[0]}.{sig[1]}(...) (use Async{sig[1]})"
                    )
                elif sig and sig in _SYNC_SLEEP:
                    violations.append(
                        f"{filename}:{node.lineno} in async def {func_name}() — "
                        f"time.sleep(...) blocks the event loop (use asyncio.sleep)"
                    )
                elif isinstance(node.func, ast.Name) and node.func.id in _BLOCKING_BARE_FUNCTIONS:
                    violations.append(
                        f"{filename}:{node.lineno} in async def {func_name}() — "
                        f"direct call to {node.func.id}(...) must run via asyncio.to_thread "
                        f"or loop.run_in_executor, not called directly"
                    )
            self.generic_visit(node)

    Visitor().visit(tree)
    return violations


def test_no_blocking_calls_in_async_routes():
    all_violations = []
    for path in sorted(ROUTES_DIR.glob("*.py")):
        source = path.read_text(encoding="utf-8")
        tree = ast.parse(source, filename=str(path))
        all_violations.extend(_find_violations(tree, path.name))

    assert not all_violations, (
        "Found blocking call(s) inside async route handlers — these freeze the entire "
        "backend event loop for every concurrent user (this is the exact bug class behind "
        "the login-lag, chatbot-blocking, and inbound-email-blocking incidents):\n  "
        + "\n  ".join(all_violations)
    )
