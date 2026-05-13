export interface WindowPoint {
  x: number;
  y: number;
}

export interface WorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const FLOATING_BALL_SIZE = 76;
export const FLOATING_BALL_MARGIN = 28;

export function isWindowPoint(value: unknown): value is WindowPoint {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<WindowPoint>;
  return Number.isFinite(candidate.x) && Number.isFinite(candidate.y);
}

export function defaultFloatingBallPosition(
  workArea: WorkArea,
  size = FLOATING_BALL_SIZE,
  margin = FLOATING_BALL_MARGIN
): WindowPoint {
  return {
    x: Math.max(workArea.x + margin, workArea.x + workArea.width - size - margin),
    y: Math.max(workArea.y + margin, workArea.y + workArea.height - size - margin)
  };
}

export function clampFloatingBallPosition(
  position: WindowPoint | undefined,
  workArea: WorkArea,
  size = FLOATING_BALL_SIZE,
  margin = 12
): WindowPoint {
  const fallback = defaultFloatingBallPosition(workArea, size, FLOATING_BALL_MARGIN);
  const candidate = position && isWindowPoint(position) ? position : fallback;
  const minX = workArea.x + margin;
  const minY = workArea.y + margin;
  const maxX = Math.max(minX, workArea.x + workArea.width - size - margin);
  const maxY = Math.max(minY, workArea.y + workArea.height - size - margin);
  return {
    x: Math.min(maxX, Math.max(minX, Math.round(candidate.x))),
    y: Math.min(maxY, Math.max(minY, Math.round(candidate.y)))
  };
}
