const INTERACTIVE_SELECTOR = [
  "button",
  "input",
  "select",
  "textarea",
  "a",
  "[role='button']",
  ".pet-shell",
  ".pet-talk-panel",
  ".modal-backdrop",
  ".side-panel",
  ".settings-page",
  ".onboarding-card"
].join(",");

export function isInteractiveHitTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(INTERACTIVE_SELECTOR));
}
