<template>
  <button :type="type" :class="buttonClasses" :style="buttonStyle" :disabled="isDisabled" @click="handleClick">
    <span v-if="loading" class="inline-flex items-center gap-2">
      <span class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
      <slot name="loading">Loading...</slot>
    </span>
    <span v-else class="inline-flex items-center gap-2">
      <span v-if="$slots.iconLeft" class="inline-flex items-center" aria-hidden="true">
        <slot name="iconLeft" />
      </span>
      <slot />
      <span v-if="$slots.iconRight" class="inline-flex items-center" aria-hidden="true">
        <slot name="iconRight" />
      </span>
    </span>
  </button>
</template>

<script setup lang="ts">
type ButtonVariant = "primary" | "secondary" | "tertiary" | "danger" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

const props = withDefaults(
  defineProps<{
    variant?: ButtonVariant;
    size?: ButtonSize;
    block?: boolean;
    loading?: boolean;
    disabled?: boolean;
    type?: "button" | "submit" | "reset";
  }>(),
  {
    variant: "primary",
    size: "lg",
    block: false,
    loading: false,
    disabled: false,
    type: "button",
  },
);

const emit = defineEmits<{
  (event: "click", payload: MouseEvent): void;
}>();

const isDisabled = computed(() => props.disabled || props.loading);

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-white text-black border-black md:hover:bg-[#FFF766] md:hover:-translate-y-1 active:bg-[#00E1EF] active:-translate-x-1 active:-translate-y-1 focus-visible:ring-[#00E1EF]",
  secondary:
    "bg-black text-white border-white md:hover:-translate-y-1 active:bg-black/80 active:-translate-x-1 active:-translate-y-1 focus-visible:ring-neutral-300",
  tertiary:
    "bg-green-300 text-black border-black md:hover:bg-green-400 md:hover:-translate-y-1 active:bg-green-500 active:-translate-x-2 active:-translate-y-2 focus-visible:ring-green-500",
  danger:
    "bg-red-600 text-white border-black md:hover:bg-red-700 md:hover:-translate-y-1 active:bg-red-800 active:-translate-x-2 active:-translate-y-2 focus-visible:ring-red-300",
  ghost:
    "bg-transparent text-gray-700 border-black md:hover:bg-gray-100 md:hover:-translate-y-1 active:bg-gray-200 active:-translate-x-2 active:-translate-y-2 focus-visible:ring-gray-200",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-2 text-sm font-normal border-2",
  md: "px-6 py-4 text-xl font-semibold border-[3px]",
  lg: "px-6 py-6 text-3xl font-extrabold border-[5px]",
};

const variantShadowColors: Record<ButtonVariant, { "--btn-shadow-color": string; "--btn-shadow-highlight": string }> = {
  primary: {
    "--btn-shadow-color": "rgba(0,0,0,1)",
    "--btn-shadow-highlight": "rgba(255,255,255,1)",
  },
  secondary: {
    "--btn-shadow-color": "rgba(255,255,255,1)",
    "--btn-shadow-highlight": "rgba(0,0,0,1)",
  },
  tertiary: {
    "--btn-shadow-color": "rgba(20,83,45,1)",
    "--btn-shadow-highlight": "rgba(187,247,208,1)",
  },
  danger: {
    "--btn-shadow-color": "rgba(127,29,29,1)",
    "--btn-shadow-highlight": "rgba(254,202,202,1)",
  },
  ghost: {
    "--btn-shadow-color": "rgba(55,65,81,1)",
    "--btn-shadow-highlight": "rgba(243,244,246,1)",
  },
};

const sizeShadowValues: Record<ButtonSize, { "--btn-shadow": string; "--btn-shadow-active": string }> = {
  sm: {
    "--btn-shadow": "-3px -3px 0 -1px var(--btn-shadow-color), -3px -3px 0 0 var(--btn-shadow-highlight)",
    "--btn-shadow-active": "-1px -1px 0 -1px var(--btn-shadow-color), -1px -1px 0 0 var(--btn-shadow-highlight)",
  },
  md: {
    "--btn-shadow": "-5px -5px 0 -2px var(--btn-shadow-color), -5px -5px 0 0 var(--btn-shadow-highlight)",
    "--btn-shadow-active": "-2px -2px 0 -2px var(--btn-shadow-color), -2px -2px 0 0 var(--btn-shadow-highlight)",
  },
  lg: {
    "--btn-shadow": "-8px -8px 0 -4px var(--btn-shadow-color), -8px -8px 0 0 var(--btn-shadow-highlight)",
    "--btn-shadow-active": "-4px -4px 0 -4px var(--btn-shadow-color), -4px -4px 0 0 var(--btn-shadow-highlight)",
  },
};

const buttonStyle = computed(() => ({
  ...variantShadowColors[props.variant],
  ...sizeShadowValues[props.size],
}));

const buttonClasses = computed(() => [
  "btn-base inline-flex items-center justify-center p-2.5 transform-gpu will-change-transform transition-[background-color,box-shadow,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
  "focus-visible:outline-none focus-visible:ring-2",
  "disabled:cursor-not-allowed disabled:opacity-60",
  props.block ? "w-full" : "w-fit",
  variantClasses[props.variant],
  sizeClasses[props.size],
]);

const handleClick = (event: MouseEvent) => {
  if (isDisabled.value) {
    event.preventDefault();
    return;
  }

  emit("click", event);
};
</script>

<style scoped>
.btn-base {
  box-shadow: var(--btn-shadow);
}

.btn-base:active {
  box-shadow: var(--btn-shadow-active);
}

/* Improve mobile touch feedback */
@media (hover: none) and (pointer: coarse) {
  .btn-base:active {
    transition-duration: 100ms;
  }
}
</style>