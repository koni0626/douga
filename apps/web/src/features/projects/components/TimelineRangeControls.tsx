export interface TimelineRangeControlsProps {
  cancelLabel: string;
  deleteRangeActive: boolean;
  deleteRangeDurationMs: number;
  deleteRangeInstruction: string;
  deleteRangeLabel: string;
  formatDeleteRangeConfirmLabel: (durationMs: number) => string;
  formatInsertRangeConfirmLabel: (atMs: number, durationMs: number) => string;
  insertRangeActive: boolean;
  insertRangeAtMs: number;
  insertRangeDurationLabel: string;
  insertRangeDurationMs: number;
  insertRangeInstruction: string;
  insertRangeLabel: string;
  maximumInsertDurationMs: number;
  onDeleteRangeCancel: () => void;
  onDeleteRangeConfirm: () => void;
  onDeleteRangeStart: () => void;
  onInsertRangeCancel: () => void;
  onInsertRangeConfirm: () => void;
  onInsertRangeDurationChange: (durationMs: number) => void;
  onInsertRangeStart: () => void;
}

export function TimelineRangeControls({
  cancelLabel,
  deleteRangeActive,
  deleteRangeDurationMs,
  deleteRangeInstruction,
  deleteRangeLabel,
  formatDeleteRangeConfirmLabel,
  formatInsertRangeConfirmLabel,
  insertRangeActive,
  insertRangeAtMs,
  insertRangeDurationLabel,
  insertRangeDurationMs,
  insertRangeInstruction,
  insertRangeLabel,
  maximumInsertDurationMs,
  onDeleteRangeCancel,
  onDeleteRangeConfirm,
  onDeleteRangeStart,
  onInsertRangeCancel,
  onInsertRangeConfirm,
  onInsertRangeDurationChange,
  onInsertRangeStart,
}: TimelineRangeControlsProps) {
  if (deleteRangeActive) {
    return (
      <div className="timeline-delete-range-controls" role="status">
        <span>
          {deleteRangeDurationMs > 0
            ? formatDeleteRangeConfirmLabel(deleteRangeDurationMs)
            : deleteRangeInstruction}
        </span>
        <button
          type="button"
          className="timeline-delete-range-confirm"
          disabled={deleteRangeDurationMs <= 0}
          onClick={onDeleteRangeConfirm}
        >
          {deleteRangeLabel}
        </button>
        <button type="button" onClick={onDeleteRangeCancel}>
          {cancelLabel}
        </button>
      </div>
    );
  }

  if (insertRangeActive) {
    return (
      <div className="timeline-insert-range-controls" role="status">
        <span>
          {formatInsertRangeConfirmLabel(
            insertRangeAtMs,
            insertRangeDurationMs,
          ) || insertRangeInstruction}
        </span>
        <label>
          <span>{insertRangeDurationLabel}</span>
          <input
            aria-label={insertRangeDurationLabel}
            max={maximumInsertDurationMs / 1000}
            min={0.05}
            onChange={(event) =>
              onInsertRangeDurationChange(
                Math.round(Number(event.target.value) * 1000),
              )
            }
            step={0.05}
            type="number"
            value={insertRangeDurationMs / 1000}
          />
          <span>s</span>
        </label>
        <button
          type="button"
          className="timeline-insert-range-confirm"
          disabled={insertRangeDurationMs <= 0 || maximumInsertDurationMs <= 0}
          onClick={onInsertRangeConfirm}
        >
          {insertRangeLabel}
        </button>
        <button type="button" onClick={onInsertRangeCancel}>
          {cancelLabel}
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className="timeline-delete-range-button"
        onClick={onDeleteRangeStart}
        title={deleteRangeLabel}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 5v14M19 5v14M9 12h6" />
        </svg>
        <span>{deleteRangeLabel}</span>
      </button>
      <button
        type="button"
        className="timeline-insert-range-button"
        disabled={maximumInsertDurationMs <= 0}
        onClick={onInsertRangeStart}
        title={insertRangeLabel}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 5v14M17 5v14M12 8v8M8 12h8" />
        </svg>
        <span>{insertRangeLabel}</span>
      </button>
    </>
  );
}
