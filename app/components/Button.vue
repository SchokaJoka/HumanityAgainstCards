<template>
  <button :type="type" :class="buttonClasses" :disabled="isDisabled" @click="handleClick">
    <span v-if="loading" class="inline-flex items-center gap-2">
      <span class="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden="true" />
      <slot name="loading">Loading...</slot>
    </span>
    <slot v-else />
  </button>
</template>

<script setup lang="ts">
type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
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
    "bg-neutral-200 text-black border border-transparent hover:bg-neutral-300 focus-visible:ring-neutral-300",
  secondary:
    "bg-white text-blue-700 border border-blue-300 hover:bg-blue-50 focus-visible:ring-blue-200",
  danger:
    "bg-red-600 text-white border border-red-600 hover:bg-red-700 focus-visible:ring-red-300",
  ghost:
    "bg-transparent text-gray-700 border border-gray-300 hover:bg-gray-100 focus-visible:ring-gray-200",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-2 text-sm",
  md: "px-4 py-2.5 text-base",
  lg: "px-6 py-6 text-3xl font-normal",
};

const buttonClasses = computed(() => [
  "inline-flex items-center justify-center rounded-md font-medium transition-colors duration-150",
  "focus-visible:outline-none focus-visible:ring-2",
  "disabled:cursor-not-allowed disabled:opacity-60",
  props.block ? "w-full" : "w-auto",
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