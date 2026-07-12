import base64
from dataclasses import dataclass
from io import BytesIO
from typing import Literal, Protocol

from openai import AsyncOpenAI
from PIL import Image, ImageDraw

from douga.core.config import Settings

ImageQuality = Literal["low", "medium", "high"]
ImageSize = Literal["1024x1024", "1024x1536", "1536x1024"]


@dataclass(frozen=True, slots=True)
class GeneratedImage:
    content: bytes
    mime_type: str


class ImageProvider(Protocol):
    async def generate(
        self, *, prompt: str, quality: ImageQuality, size: ImageSize
    ) -> GeneratedImage: ...


class OpenAIImageProvider:
    def __init__(self, settings: Settings) -> None:
        if settings.openai_api_key is None:
            raise RuntimeError("OPENAI_API_KEY is required when IMAGE_PROVIDER=openai")
        self.client = AsyncOpenAI(
            api_key=settings.openai_api_key.get_secret_value(),
            max_retries=settings.openai_max_retries,
            timeout=settings.openai_timeout_seconds,
        )
        self.model = settings.openai_image_model

    async def generate(
        self, *, prompt: str, quality: ImageQuality, size: ImageSize
    ) -> GeneratedImage:
        result = await self.client.images.generate(
            model=self.model,
            prompt=prompt,
            quality=quality,
            size=size,
            output_format="png",
        )
        encoded = result.data[0].b64_json if result.data else None
        if not encoded:
            raise RuntimeError("OpenAI returned no image data")
        return GeneratedImage(base64.b64decode(encoded, validate=True), "image/png")


class FakeImageProvider:
    async def generate(
        self, *, prompt: str, quality: ImageQuality, size: ImageSize
    ) -> GeneratedImage:
        width, height = (int(value) for value in size.split("x"))
        image = Image.new("RGB", (width, height), "#17203b")
        drawing = ImageDraw.Draw(image)
        drawing.rounded_rectangle((48, 48, width - 48, height - 48), 28, fill="#25345c")
        drawing.text((80, 80), prompt[:120], fill="white")
        output = BytesIO()
        image.save(output, format="PNG", optimize=True)
        return GeneratedImage(output.getvalue(), "image/png")


def build_image_provider(settings: Settings) -> ImageProvider:
    if settings.image_provider == "openai":
        return OpenAIImageProvider(settings)
    return FakeImageProvider()
