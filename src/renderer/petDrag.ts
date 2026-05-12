export const PET_DRAG_THRESHOLD_PX = 4;

export function hasDraggedBeyondThreshold(startX: number, startY: number, currentX: number, currentY: number): boolean {
  return Math.hypot(currentX - startX, currentY - startY) >= PET_DRAG_THRESHOLD_PX;
}
