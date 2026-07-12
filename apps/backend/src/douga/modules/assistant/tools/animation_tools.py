from copy import deepcopy
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field

from douga.core.errors import ConflictError
from douga.modules.assistant.tools.project_tool_service import (
    ProjectToolService,
    StrictToolArgs,
    find_layer,
    model_parameters,
    mutation_result,
    validate_time_range,
)
from douga.modules.assistant.tools.registry import (
    ToolContext,
    ToolDefinition,
    ToolExecutionResult,
    ToolHandler,
)

AnimationPreset = Literal[
    "slide_left",
    "slide_right",
    "slide_up",
    "slide_down",
    "zoom_in",
    "pop",
    "bounce",
    "shake",
    "spin",
    "pulse",
    "float",
    "fade_in",
    "fade_out",
    "blink",
    "flash",
]
EffectPreset = Literal["fade_in", "fade_out", "blink", "flash"]
CameraPreset = Literal[
    "handheld",
    "walk",
    "breathe",
    "float",
    "sway",
    "slow_rotate",
    "zoom_pulse",
    "heartbeat",
]
Easing = Literal["linear", "ease_in", "ease_out", "ease_in_out", "bounce", "step"]


class ApplyAnimationArgs(StrictToolArgs):
    clip_id: str = Field(min_length=1, max_length=100)
    preset: AnimationPreset
    time_ms: int = Field(ge=0, le=3_600_000)
    duration_ms: int = Field(ge=100, le=60_000)


class ApplyEffectArgs(StrictToolArgs):
    clip_id: str = Field(min_length=1, max_length=100)
    preset: EffectPreset
    time_ms: int = Field(ge=0, le=3_600_000)
    duration_ms: int = Field(ge=100, le=60_000)


class ClearAnimationArgs(StrictToolArgs):
    clip_id: str = Field(min_length=1, max_length=100)


class ApplyCameraArgs(StrictToolArgs):
    preset: CameraPreset
    start_ms: int = Field(ge=0, le=3_600_000)
    end_ms: int = Field(gt=0, le=3_600_000)
    intensity: float = Field(ge=0.1, le=3)
    period_ms: int = Field(ge=100, le=60_000)


def scaled(layer: dict[str, Any], scale: float) -> dict[str, Any]:
    result = deepcopy(layer)
    width = float(layer["width"]) * scale
    height = float(layer["height"]) * scale
    result.update(
        {
            "x": float(layer["x"]) + (float(layer["width"]) - width) / 2,
            "y": float(layer["y"]) + (float(layer["height"]) - height) / 2,
            "width": width,
            "height": height,
        }
    )
    return result


def keyframe(layer: dict[str, Any], time_ms: int, easing: Easing) -> dict[str, Any]:
    result = {
        "id": str(uuid4()),
        "time_ms": max(0, round(time_ms / 50) * 50),
        "easing": easing,
        "x": layer["x"],
        "y": layer["y"],
        "width": layer["width"],
        "height": layer["height"],
        "rotation": layer["rotation"],
        "opacity": layer["opacity"],
        "flip_x": bool(layer.get("flip_x", False)),
        "flip_y": bool(layer.get("flip_y", False)),
    }
    if layer.get("type") == "shape":
        result["fill"] = layer["fill"]
    if layer.get("type") == "text":
        result["color"] = layer["color"]
        result["font_size"] = layer["font_size"]
    return result


def frames(
    layer: dict[str, Any],
    preset: AnimationPreset,
    time_ms: int,
    duration_ms: int,
    width: int,
    height: int,
) -> list[tuple[dict[str, Any], int, Easing]]:
    end = time_ms + duration_ms
    base = deepcopy(layer)
    if preset == "slide_left":
        return [({**base, "x": -float(base["width"])}, time_ms, "linear"), (base, end, "ease_out")]
    if preset == "slide_right":
        return [({**base, "x": width}, time_ms, "linear"), (base, end, "ease_out")]
    if preset == "slide_up":
        return [({**base, "y": -float(base["height"])}, time_ms, "linear"), (base, end, "ease_out")]
    if preset == "slide_down":
        return [({**base, "y": height}, time_ms, "linear"), (base, end, "ease_out")]
    if preset == "zoom_in":
        return [(scaled(base, 0.12), time_ms, "linear"), (base, end, "ease_out")]
    if preset == "pop":
        return [
            (scaled(base, 0.55), time_ms, "linear"),
            (scaled(base, 1.12), time_ms + round(duration_ms * 0.72), "ease_out"),
            (base, end, "ease_out"),
        ]
    if preset == "fade_in":
        return [({**base, "opacity": 0}, time_ms, "linear"), (base, end, "ease_out")]
    if preset == "fade_out":
        return [(base, time_ms, "linear"), ({**base, "opacity": 0}, end, "ease_in_out")]
    if preset == "bounce":
        return [
            (base, time_ms, "linear"),
            (
                {**base, "y": float(base["y"]) - float(base["height"]) * 0.18},
                time_ms + round(duration_ms * 0.45),
                "ease_out",
            ),
            (base, end, "bounce"),
        ]
    if preset == "shake":
        return [
            (base, time_ms, "linear"),
            (
                {**base, "x": float(base["x"]) - float(base["width"]) * 0.06},
                time_ms + duration_ms // 4,
                "linear",
            ),
            (
                {**base, "x": float(base["x"]) + float(base["width"]) * 0.06},
                time_ms + duration_ms // 2,
                "linear",
            ),
            (
                {**base, "x": float(base["x"]) - float(base["width"]) * 0.03},
                time_ms + duration_ms * 3 // 4,
                "linear",
            ),
            (base, end, "ease_out"),
        ]
    if preset == "spin":
        return [
            (base, time_ms, "linear"),
            ({**base, "rotation": float(base["rotation"]) + 360}, end, "linear"),
        ]
    if preset in {"pulse", "float"}:
        middle = (
            scaled(base, 1.15)
            if preset == "pulse"
            else {
                **base,
                "y": float(base["y"]) - float(base["height"]) * 0.08,
            }
        )
        return [
            (base, time_ms, "linear"),
            (middle, time_ms + duration_ms // 2, "ease_in_out"),
            (base, end, "ease_in_out"),
        ]
    if preset == "blink":
        return [
            (
                {**base, "opacity": base["opacity"] if index % 2 == 0 else 0},
                time_ms + duration_ms * index // 4,
                "step",
            )
            for index in range(5)
        ]
    return [
        (base, time_ms, "linear"),
        ({**base, "opacity": 0.2}, time_ms + round(duration_ms * 0.35), "ease_out"),
        (base, end, "ease_in"),
    ]


async def apply_preset(
    context: ToolContext,
    clip_id: str,
    preset: AnimationPreset,
    time_ms: int,
    duration_ms: int,
    summary: str,
) -> ToolExecutionResult:
    def mutate(document: dict[str, Any]) -> None:
        layer = find_layer(document, clip_id)
        if layer.get("locked"):
            raise ConflictError("LAYER_LOCKED", "errors.layerLocked")
        end_ms = time_ms + duration_ms
        required_duration = min(3_600_000, ((end_ms + 4999) // 5000) * 5000)
        document["video"]["duration_ms"] = max(
            int(document["video"].get("duration_ms", 5000)), required_duration
        )
        existing = {int(item["time_ms"]): item for item in layer.get("keyframes", [])}
        for state, frame_time, easing in frames(
            layer,
            preset,
            time_ms,
            duration_ms,
            int(document["video"]["width"]),
            int(document["video"]["height"]),
        ):
            frame = keyframe(state, min(frame_time, required_duration - 1), easing)
            existing[int(frame["time_ms"])] = frame
        layer["keyframes"] = sorted(existing.values(), key=lambda item: int(item["time_ms"]))

    detail, run = await ProjectToolService(context).mutate(mutate, summary)
    return mutation_result(detail, run, {"clip_id": clip_id, "preset": preset})


async def apply_animation(context: ToolContext, arguments: dict[str, Any]) -> ToolExecutionResult:
    values = ApplyAnimationArgs.model_validate(arguments)
    return await apply_preset(
        context,
        values.clip_id,
        values.preset,
        values.time_ms,
        values.duration_ms,
        "AI: apply animation",
    )


async def apply_effect(context: ToolContext, arguments: dict[str, Any]) -> ToolExecutionResult:
    values = ApplyEffectArgs.model_validate(arguments)
    return await apply_preset(
        context,
        values.clip_id,
        values.preset,
        values.time_ms,
        values.duration_ms,
        "AI: apply effect",
    )


async def clear_animation(context: ToolContext, arguments: dict[str, Any]) -> ToolExecutionResult:
    values = ClearAnimationArgs.model_validate(arguments)

    def mutate(document: dict[str, Any]) -> None:
        layer = find_layer(document, values.clip_id)
        if layer.get("locked"):
            raise ConflictError("LAYER_LOCKED", "errors.layerLocked")
        layer["keyframes"] = []

    detail, run = await ProjectToolService(context).mutate(mutate, "AI: clear animation")
    return mutation_result(detail, run, {"clip_id": values.clip_id})


async def apply_camera_effect(
    context: ToolContext, arguments: dict[str, Any]
) -> ToolExecutionResult:
    values = ApplyCameraArgs.model_validate(arguments)
    validate_time_range(values.start_ms, values.end_ms)
    effect_id = str(uuid4())

    def mutate(document: dict[str, Any]) -> None:
        document.setdefault("camera_effects", []).append(
            {"id": effect_id, **values.model_dump(mode="json")}
        )

    detail, run = await ProjectToolService(context).mutate(mutate, "AI: apply camera effect")
    return mutation_result(detail, run, {"camera_effect_id": effect_id})


def definition(
    name: str, description: str, model: type[BaseModel], handler: ToolHandler
) -> ToolDefinition:
    return ToolDefinition(
        name=name,
        description=description,
        parameters=model_parameters(model),
        handler=handler,
    )


def animation_tool_definitions() -> tuple[ToolDefinition, ...]:
    return (
        definition(
            "apply_animation",
            "Apply one keyframe animation preset to a layer.",
            ApplyAnimationArgs,
            apply_animation,
        ),
        definition(
            "apply_effect", "Apply fade, blink or flash to a layer.", ApplyEffectArgs, apply_effect
        ),
        definition(
            "clear_animation",
            "Remove all keyframes from one unlocked layer.",
            ClearAnimationArgs,
            clear_animation,
        ),
        definition(
            "apply_camera_effect",
            "Apply a looping whole-canvas camera effect.",
            ApplyCameraArgs,
            apply_camera_effect,
        ),
    )
