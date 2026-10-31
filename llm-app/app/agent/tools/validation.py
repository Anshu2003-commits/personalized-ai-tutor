from __future__ import annotations

from typing import Any


class ToolValidationError(ValueError):
    pass


def validate_tool_args(schema: dict[str, Any], args: dict[str, Any]) -> None:
    """Validate args against the JSON-schema subset used by tutor tools."""
    validate_tool_schema(schema)
    properties = schema.get("properties", {})
    required = set(schema.get("required", []))
    additional = schema.get("additionalProperties", True)

    if not isinstance(args, dict):
        raise ToolValidationError("tool arguments must be an object")

    for name in required:
        if name not in args:
            raise ToolValidationError(f"missing required argument: {name}")

    if additional is False:
        allowed = set(properties)
        for name in args:
            if name not in allowed:
                raise ToolValidationError(f"unexpected argument: {name}")

    for name, value in args.items():
        prop_schema = properties.get(name)
        if not prop_schema:
            continue
        _validate_value(name, value, prop_schema)


def validate_tool_schema(schema: dict[str, Any]) -> None:
    expected_type = schema.get("type", "object")
    if expected_type != "object":
        raise ToolValidationError("tool input_schema must have type 'object'")

    properties = schema.get("properties", {})
    required = set(schema.get("required", []))

    for name in required:
        if name not in properties:
            raise ToolValidationError(f"required argument has no schema: {name}")


def _validate_value(name: str, value: Any, schema: dict[str, Any]) -> None:
    expected = schema.get("type")
    if expected is None:
        return

    if isinstance(expected, list):
        if any(_matches_type(value, item) for item in expected):
            return
        allowed = ", ".join(expected)
        raise ToolValidationError(f"{name} must be one of: {allowed}")

    if not _matches_type(value, expected):
        raise ToolValidationError(f"{name} must be {expected}")


def _matches_type(value: Any, expected: str) -> bool:
    if expected == "string":
        return isinstance(value, str)
    if expected == "boolean":
        return isinstance(value, bool)
    if expected == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected == "number":
        return (isinstance(value, int | float)) and not isinstance(value, bool)
    if expected == "object":
        return isinstance(value, dict)
    if expected == "array":
        return isinstance(value, list)
    if expected == "null":
        return value is None
    return True
