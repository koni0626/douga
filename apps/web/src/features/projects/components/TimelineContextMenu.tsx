import { useDismissibleMenu } from "../hooks/useDismissibleMenu";

export type TimelineMenuState = {
  kind: "add" | "camera" | "audio";
  x: number;
  y: number;
};

export interface TimelineContextMenuProps {
  addAudioLabel: string;
  addCameraLabel: string;
  addCaptionLabel: string;
  addImageLabel: string;
  addShapeLabel: string;
  addTextHorizontalLabel: string;
  addTextVerticalLabel: string;
  captionSettingsLabel: string;
  menu?: TimelineMenuState;
  onAddAudio: () => void;
  onAddCamera: () => void;
  onAddCaption: () => void;
  onAddImage: () => void;
  onAddShape: () => void;
  onAddTextHorizontal: () => void;
  onAddTextVertical: () => void;
  onClose: () => void;
  onOpenAudioSettings: () => void;
  onOpenCameraSettings: () => void;
  onOpenCaptionSettings: () => void;
  settingsLabel: string;
}

export function TimelineContextMenu({
  addAudioLabel,
  addCameraLabel,
  addCaptionLabel,
  addImageLabel,
  addShapeLabel,
  addTextHorizontalLabel,
  addTextVerticalLabel,
  captionSettingsLabel,
  menu,
  onAddAudio,
  onAddCamera,
  onAddCaption,
  onAddImage,
  onAddShape,
  onAddTextHorizontal,
  onAddTextVertical,
  onClose,
  onOpenAudioSettings,
  onOpenCameraSettings,
  onOpenCaptionSettings,
  settingsLabel,
}: TimelineContextMenuProps) {
  const menuRef = useDismissibleMenu<HTMLDivElement>(Boolean(menu), onClose);
  if (!menu) return null;
  const action = (callback: () => void) => () => {
    callback();
    onClose();
  };
  return (
    <div
      ref={menuRef}
      className="timeline-clip-menu"
      role="menu"
      style={{ left: menu.x, top: menu.y }}
    >
      {menu.kind === "add" ? (
        <>
          <MenuItem label={addCameraLabel} onClick={action(onAddCamera)} />
          <MenuItem label={addCaptionLabel} onClick={action(onAddCaption)} />
          <MenuItem
            label={addTextHorizontalLabel}
            onClick={action(onAddTextHorizontal)}
          />
          <MenuItem
            label={addTextVerticalLabel}
            onClick={action(onAddTextVertical)}
          />
          <MenuItem label={addShapeLabel} onClick={action(onAddShape)} />
          <MenuItem label={addImageLabel} onClick={action(onAddImage)} />
          <MenuItem label={addAudioLabel} onClick={action(onAddAudio)} />
          <MenuItem
            label={captionSettingsLabel}
            onClick={action(onOpenCaptionSettings)}
          />
        </>
      ) : (
        <MenuItem
          label={settingsLabel}
          onClick={action(
            menu.kind === "camera" ? onOpenCameraSettings : onOpenAudioSettings,
          )}
        />
      )}
    </div>
  );
}

function MenuItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" onClick={onClick}>
      {label}
    </button>
  );
}
