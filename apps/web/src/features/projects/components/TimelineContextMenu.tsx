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
  addTextLabel: string;
  captionSettingsLabel: string;
  menu?: TimelineMenuState;
  onAddAudio: () => void;
  onAddCamera: () => void;
  onAddCaption: () => void;
  onAddImage: () => void;
  onAddShape: () => void;
  onAddText: () => void;
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
  addTextLabel,
  captionSettingsLabel,
  menu,
  onAddAudio,
  onAddCamera,
  onAddCaption,
  onAddImage,
  onAddShape,
  onAddText,
  onClose,
  onOpenAudioSettings,
  onOpenCameraSettings,
  onOpenCaptionSettings,
  settingsLabel,
}: TimelineContextMenuProps) {
  if (!menu) return null;
  const action = (callback: () => void) => () => {
    callback();
    onClose();
  };
  return (
    <div
      className="timeline-clip-menu"
      role="menu"
      style={{ left: menu.x, top: menu.y }}
    >
      {menu.kind === "add" ? (
        <>
          <MenuItem label={addCameraLabel} onClick={action(onAddCamera)} />
          <MenuItem label={addCaptionLabel} onClick={action(onAddCaption)} />
          <MenuItem label={addTextLabel} onClick={action(onAddText)} />
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
