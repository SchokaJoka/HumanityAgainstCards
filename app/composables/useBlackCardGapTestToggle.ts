import { ref } from "vue";

type BlackCardLike = {
  text?: string | null;
  number_of_gaps?: number | null;
  [key: string]: any;
};

type UseBlackCardGapTestToggleOptions = {
  gapToken: string;
  minGaps?: number;
};

export const useBlackCardGapTestToggle = (
  options: UseBlackCardGapTestToggleOptions,
) => {
  const isEnabled = ref(false);
  const minGaps = Number(options.minGaps ?? 2);

  const countGapsInText = (text: string) => {
    if (!text) return 0;
    return text.split(options.gapToken).length - 1;
  };

  const forceMinimumGaps = (card: BlackCardLike) => {
    if (!card || typeof card.text !== "string") return card;

    const fromField = Number(card.number_of_gaps ?? 0);
    const fromText = countGapsInText(card.text);
    const current = Math.max(fromField, fromText);
    const target = Math.max(current, minGaps);

    if (target === current) {
      return {
        ...card,
        number_of_gaps: target,
      };
    }

    let text = card.text;
    for (let i = current; i < target; i += 1) {
      text += ` ${options.gapToken}`;
    }

    return {
      ...card,
      text,
      number_of_gaps: target,
    };
  };

  const applyIfEnabled = (card: BlackCardLike) => {
    if (!isEnabled.value) return card;
    return forceMinimumGaps(card);
  };

  const setEnabled = (enabled: boolean) => {
    isEnabled.value = enabled;
  };

  const toggle = () => {
    isEnabled.value = !isEnabled.value;
  };

  return {
    isEnabled,
    minGaps,
    setEnabled,
    toggle,
    applyIfEnabled,
  };
};
