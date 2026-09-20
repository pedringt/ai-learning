"""#138: one canonical import path for the interpretation validation package, and no dead duplicates.

The runtime used to put `interpretation_runtime/` on `sys.path` and import the package as bare
`validation.*`, while other code imported it as `interpretation_runtime.validation.*`, which gave
two distinct module objects for the same code. These checks keep it to one path.
See docs/architecture/BACKEND_RUNTIME_MAP.md.
"""
import ast
import subprocess
import sys
from pathlib import Path

SERVICE = Path(__file__).resolve().parent
NESTED = SERVICE / 'interpretation_runtime'  # the package's own tests use bare `validation.*` on purpose


def _service_modules():
    # Top level plus eval/ (the paid eval scripts had copied the shim too).
    return [p for p in [*SERVICE.glob('*.py'), *SERVICE.glob('eval/*.py')] if p.name != Path(__file__).name]


def test_no_service_module_imports_the_validation_package_by_its_bare_name():
    offenders = []
    for path in _service_modules():
        for node in ast.walk(ast.parse(path.read_text())):
            if isinstance(node, ast.ImportFrom) and node.module and node.module.split('.')[0] == 'validation' and node.level == 0:
                offenders.append(f'{path.name}:{node.lineno} from {node.module}')
            if isinstance(node, ast.Import):
                offenders += [f'{path.name}:{node.lineno} import {a.name}' for a in node.names if a.name.split('.')[0] == 'validation']
    assert offenders == [], 'import interpretation_runtime.validation.<module> instead: ' + '; '.join(offenders)


def test_no_service_module_puts_interpretation_runtime_on_sys_path():
    offenders = []
    for path in _service_modules():
        for node in ast.walk(ast.parse(path.read_text())):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr in ('insert', 'append'):
                if 'sys.path' in ast.unparse(node.func.value) and 'interpretation_runtime' in ast.unparse(node):
                    offenders.append(f'{path.name}:{node.lineno}')
    assert offenders == [], 'the sys.path shim is gone; use interpretation_runtime.validation.*: ' + ', '.join(offenders)


def test_the_dead_duplicates_stay_gone():
    assert not (SERVICE / 'fake_provider.py').exists(), 'the only golden FakeProvider lives under interpretation_runtime/validation/'
    assert not (SERVICE / 'db_wrapper.py').exists(), 'the runtime database abstraction is db.Connection'


def test_the_service_imports_from_any_directory_without_a_path_shim():
    """What Render does (`uvicorn api:app` from the service root) and what tools do from elsewhere."""
    code = (
        "import sys; sys.path.insert(0, %r); "
        "import api, anthropic_provider, openai_provider, interpretation_pipeline_integrated; "
        "from interpretation_runtime.validation.semantic_validation import InterpretationContextSnapshot; "
        "assert 'validation' not in sys.modules, 'bare validation package was imported'; print('ok')"
    ) % str(SERVICE)
    result = subprocess.run([sys.executable, '-c', code], cwd='/', capture_output=True, text=True, timeout=120)
    assert result.returncode == 0 and result.stdout.strip().endswith('ok'), result.stderr[-800:]
