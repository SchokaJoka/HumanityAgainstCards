import { computed, ref, shallowRef, watch, type Ref } from "vue";

type Key = string | number;

type RequiredCountInput =
  | number
  | Ref<number | null | undefined>
  | (() => number | null | undefined);

type SubmitHandler<T> = (selectedItems: T[]) => Promise<unknown> | unknown;

type SelectorMode = "queue" | "slots";

type UseSubmissionSelectorOptions<T> = {
  getKey?: (item: T) => Key;
  requiredCount?: RequiredCountInput;
  initialSelected?: T[];
  deselectOnRepeatPick?: boolean;
  mode?: SelectorMode;
};

function resolveRequiredCount(input?: RequiredCountInput): number {
  if (typeof input === "number") return Math.max(1, input);
  if (typeof input === "function") return Math.max(1, Number(input() ?? 1));
  if (input && typeof input === "object" && "value" in input) {
    return Math.max(1, Number(input.value ?? 1));
  }
  return 1;
}

export const useSubmissionSelector = <T>(
  options: UseSubmissionSelectorOptions<T> = {},
) => {
  const mode = options.mode ?? "queue";
  const deselectOnRepeatPick = options.deselectOnRepeatPick ?? true;

  const errorMessage = ref("");
  const isSubmitting = ref(false);

  const requiredCount = computed(() =>
    resolveRequiredCount(options.requiredCount),
  );

  const selectedItems = shallowRef<T[]>(options.initialSelected ?? []);
  const selectedSlots = ref<Array<T | null>>(
    mode === "slots"
      ? Array.from({ length: requiredCount.value }, () => null)
      : [],
  );

  const getKey = (item: T): Key => {
    if (options.getKey) return options.getKey(item);

    const maybeObject = item as unknown as Record<string, unknown>;
    const id = maybeObject?.id;
    if (typeof id === "string" || typeof id === "number") return id;

    return JSON.stringify(item);
  };

  const clearError = () => {
    errorMessage.value = "";
  };

  const ensureSlots = () => {
    if (mode !== "slots") return;
    const current = selectedSlots.value;
    const required = requiredCount.value;
    selectedSlots.value = Array.from(
      { length: required },
      (_, idx) => current[idx] ?? null,
    );
  };

  watch(requiredCount, () => {
    ensureSlots();
    if (mode === "slots") {
      selectedItems.value = selectedSlots.value.filter(Boolean) as T[];
    }
  });

  const resetSelection = () => {
    if (mode === "slots") {
      selectedSlots.value = Array.from(
        { length: requiredCount.value },
        () => null,
      );
    }
    selectedItems.value = [];
    clearError();
  };

  const isSelected = (item: T) => {
    const key = getKey(item);
    if (mode === "slots") {
      ensureSlots();
      return selectedSlots.value.some((i) => i && getKey(i as T) === key);
    }
    return selectedItems.value.some((i) => getKey(i) === key);
  };

  const pick = (item: T) => {
    clearError();
    const key = getKey(item);

    if (mode === "slots") {
      ensureSlots();

      const existingIdx = selectedSlots.value.findIndex(
        (i) => i && getKey(i as T) === key,
      );

      if (existingIdx !== -1) {
        if (!deselectOnRepeatPick) return;
        selectedSlots.value[existingIdx] = null;
        selectedItems.value = selectedSlots.value.filter(Boolean) as T[];
        return;
      }

      const firstEmpty = selectedSlots.value.findIndex((i) => !i);
      if (firstEmpty === -1) {
        errorMessage.value =
          "you can only pick " + requiredCount.value + " cards";
        return;
      }

      selectedSlots.value[firstEmpty] = item;
      selectedItems.value = selectedSlots.value.filter(Boolean) as T[];
      return;
    }

    const idx = selectedItems.value.findIndex((i) => getKey(i) === key);

    if (idx !== -1) {
      if (!deselectOnRepeatPick) return;
      selectedItems.value = selectedItems.value.filter((_, i) => i !== idx);
      return;
    }

    if (selectedItems.value.length === requiredCount.value) {
      selectedItems.value = [...selectedItems.value.slice(1), item];
      return;
    }

    selectedItems.value = [...selectedItems.value, item];
  };

  const getSelectedAt = (index: number) => {
    if (mode !== "slots") return null;
    ensureSlots();
    if (index < 0 || index >= selectedSlots.value.length) return null;
    return selectedSlots.value[index] ?? null;
  };

  const removeSelectedAt = (index: number) => {
    if (mode !== "slots") return;
    ensureSlots();
    if (index < 0 || index >= selectedSlots.value.length) return;
    selectedSlots.value[index] = null;
    selectedItems.value = selectedSlots.value.filter(Boolean) as T[];
    clearError();
  };

  const validateSelection = () => {
    if (selectedItems.value.length !== requiredCount.value) {
      errorMessage.value = "you have to pick " + requiredCount.value + " cards";
      return false;
    }
    clearError();
    return true;
  };

  const submitSelection = async (handler: SubmitHandler<T>) => {
    if (!validateSelection()) return false;
    if (isSubmitting.value) return false;

    isSubmitting.value = true;
    try {
      await handler([...selectedItems.value]);
      return true;
    } finally {
      isSubmitting.value = false;
    }
  };

  return {
    selectedItems,
    selectedSlots,
    errorMessage,
    isSubmitting,
    requiredCount,
    pick,
    isSelected,
    getSelectedAt,
    removeSelectedAt,
    validateSelection,
    submitSelection,
    resetSelection,
    clearError,
  };
};
