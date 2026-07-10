import { Application } from "./app/Application";
import { RendererSpike } from "./features/editor/components/RendererSpike";

export function App() {
  const renderMode =
    new URLSearchParams(globalThis.location.search).get("render") === "1";
  return renderMode ? <RendererSpike renderMode /> : <Application />;
}
