import type { RemoteCommand } from "./RemotePairingService";
import type { RemotePresentationState } from "./RemoteTransportServer";

/**
 * Deterministic Presenter-side fixture for remote protocol verification.
 * It expresses a realistic worship flow without touching a person's saved
 * presentations or requiring a live desktop window in CI.
 */
export const cultoQaFixture = {
  show: { id: "culto-qa", title: "Culto QA" },
  slides: ["Bienvenida", "Canción", "Lectura", "Prédica", "Cierre"],
} as const;

export function createCultoQaState(): RemotePresentationState {
  return {
    show: { ...cultoQaFixture.show },
    current: {
      itemIndex: 0,
      slideIndex: 0,
      slideCount: cultoQaFixture.slides.length,
    },
    output: { isLive: true, isCleared: false },
  };
}

export function applyCultoQaCommand(
  state: RemotePresentationState,
  command: RemoteCommand,
  slideIndex?: number,
): RemotePresentationState {
  if (!state.current) throw new Error("no_presentation");
  const current = state.current;
  const boundedIndex = (index: number) =>
    Math.max(0, Math.min(current.slideCount - 1, index));
  const nextIndex =
    command === "next"
      ? boundedIndex(current.slideIndex + 1)
      : command === "previous"
        ? boundedIndex(current.slideIndex - 1)
        : command === "goTo"
          ? boundedIndex(slideIndex ?? 0)
          : current.slideIndex;

  return {
    ...state,
    current: { ...current, slideIndex: nextIndex },
    output: {
      ...state.output,
      isCleared:
        command === "clear"
          ? true
          : command === "restore"
            ? false
            : state.output.isCleared,
    },
  };
}
