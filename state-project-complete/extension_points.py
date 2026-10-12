"""Named extension points for composing Baseline Setup into State (#502).

A module that lets another module change one of its behaviours declares an
``ExtensionPoint`` for it and calls the point instead of a plain function.
Composition (``baseline_composition.compose_baseline_runtime``) adds each layer
once, at startup. Nobody reassigns another module's globals, and a module that
imported the point early still runs the fully composed behaviour, so import
order can no longer silently decide which function runs.

A layer is a factory: ``wrap(inner) -> callable``. It receives the behaviour
composed so far, exactly like the old ``original = module.fn`` captures did, so
layers apply in the order they are added.
"""
from __future__ import annotations

import threading
from typing import Any, Callable


class ExtensionPoint:
    def __init__(self, name: str, base: Callable[..., Any]):
        self.name = name
        self._base = base
        self._composed = base
        self._layers: list[str] = []
        self._lock = threading.Lock()

    @property
    def layers(self) -> tuple[str, ...]:
        """Names of the layers added so far, innermost first."""
        return tuple(self._layers)

    def add_layer(self, name: str, wrap: Callable[[Callable[..., Any]], Callable[..., Any]]) -> bool:
        """Wrap the current behaviour once; adding the same layer name again is a no-op."""
        with self._lock:
            if name in self._layers:
                return False
            self._composed = wrap(self._composed)
            self._layers.append(name)
            return True

    def __call__(self, *args: Any, **kwargs: Any) -> Any:
        return self._composed(*args, **kwargs)

    def __repr__(self) -> str:
        return f"<ExtensionPoint {self.name} layers={self._layers}>"
