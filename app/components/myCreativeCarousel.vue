<template>
  <div class="carousel-wrap">
    <div ref="carouselContainerRef" class="carousel-container" @wheel.prevent="handleScroll"
      @touchstart.passive="handleTouchStart" @touchmove="handleTouchMove" @touchend="handleTouchEnd"
      @touchcancel="handleTouchEnd">
      <article v-for="(item, index) in items" :key="String(item.id)" class="card"
        :style="getCardStyle(item, index)"
        @click="handleCardClick(index)">
        <div class="card-inner">
          <div class="card-index">{{ index + 1 }}</div>
          <textarea :value="getCardText(item)" class="card-input" placeholder="Your answer..."
            :ref="(el) => setTextareaRef(el, index)"
            @focus="emit('focus-input')" @blur="emit('blur-input')"
            @input="onCardInput(index, item, $event)" />
        </div>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">

type CreativeInputItem = {
  id: string | number;
  text?: string;
};

const props = defineProps<{
  items: CreativeInputItem[];
  selectedIds?: Array<string>;
}>();

const emit = defineEmits<{
  (event: "update-item-text", payload: { index: number; id: string; text: string }): void;
  (event: "focus-input"): void;
  (event: "blur-input"): void;
}>();

const carouselContainerRef = ref<HTMLDivElement | null>(null);
const textareaRefs = ref<Array<HTMLTextAreaElement | null>>([]);
const current = ref(0);
const scrollLockMs = 150;
let lastScrollAt = 0;
const isMobile = ref(false);
let touchStartX = 0;
let dragStartIndex = 0;
let isTouchDragging = false;
const spacing = 75;

const maxIndex = computed(() => Math.max(0, props.items.length - 1));

const getCardText = (item: CreativeInputItem) => item.text ?? "";

const isSelected = (item: CreativeInputItem) =>
  !!props.selectedIds?.some((id) => String(id) === String(item.id));

const setCurrent = (index: number) => {
  current.value = Math.max(0, Math.min(index, maxIndex.value));
};

const setTextareaRef = (
  el: Element | { $el?: Element } | null,
  index: number,
) => {
  const candidate = el && "$el" in el ? el.$el : el;
  textareaRefs.value[index] = candidate instanceof HTMLTextAreaElement ? candidate : null;
};

const handleCardClick = async (index: number) => {
  setCurrent(index);
  await nextTick();
  textareaRefs.value[index]?.focus();
};

const getCardStyle = (item: CreativeInputItem, index: number) => {
  const offsetFromCenter = index - current.value;
  const zIndex =
    offsetFromCenter === 0 ? 50 : 50 - Math.abs(offsetFromCenter);
  const translateX = offsetFromCenter * spacing;
  const rotationDeg = offsetFromCenter * 10;
  const translateY = "0px";

  return {
    zIndex: String(zIndex),
    transform: `rotateZ(${rotationDeg}deg) translateX(${translateX}px) translateY(${translateY})`,
    transformOrigin: "50% 100%",
  };
};

const onCardInput = (
  index: number,
  item: CreativeInputItem,
  event: Event,
) => {
  const target = event.target as HTMLTextAreaElement;
  emit("update-item-text", {
    index,
    id: String(item.id),
    text: target.value,
  });
};

const handleScroll = (event: WheelEvent) => {
  if (isMobile.value) return;

  const now = Date.now();
  if (now - lastScrollAt < scrollLockMs) return;

  const delta = event.deltaX > 0 ? 1 : -1;

  if (
    (delta === -1 && current.value <= 0) ||
    (delta === 1 && current.value >= maxIndex.value)
  ) {
    return;
  }

  current.value = Math.max(0, Math.min(current.value + delta, maxIndex.value));
  lastScrollAt = now;
};

const handleTouchStart = (event: TouchEvent) => {
  if (!isMobile.value) return;
  const touch = event.touches[0];
  if (!touch) return;

  touchStartX = touch.clientX;
  dragStartIndex = current.value;
  isTouchDragging = false;
};

const handleTouchMove = (event: TouchEvent) => {
  if (!isMobile.value) return;
  const touch = event.touches[0];
  if (!touch) return;

  event.preventDefault();

  const deltaX = touch.clientX - touchStartX;
  if (Math.abs(deltaX) > 8) {
    isTouchDragging = true;
  }

  const movement = Math.round(deltaX / spacing);
  const nextIndex = Math.max(
    0,
    Math.min(dragStartIndex - movement, maxIndex.value),
  );
  current.value = nextIndex;
};

const handleTouchEnd = () => {
  setTimeout(() => {
    isTouchDragging = false;
  }, 0);
};

const handleResize = () => {
  isMobile.value = window.innerWidth < 640;
};

watch(
  () => props.items.length,
  () => {
    current.value = Math.min(current.value, maxIndex.value);
  },
);

onMounted(() => {
  current.value = Math.floor(maxIndex.value / 2);
  isMobile.value = window.innerWidth < 640;

  window.addEventListener("resize", handleResize);
});

onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
});
</script>

<style scoped>
.carousel-wrap {
  @apply w-full h-full flex items-start justify-center overflow-y-visible overflow-x-clip;
}

.carousel-container {
  @apply relative w-52 h-64;
  touch-action: none;
}

.card {
  @apply absolute w-52 h-64 bg-white rounded-lg border-black p-4 shadow-lg cursor-pointer;
  border: 3px solid;
  transition: border-color 200ms ease, background-color 200ms ease, transform 300ms ease;
}

.card-inner {
  @apply w-full h-full flex flex-col gap-2;
}

.card-index {
  @apply fixed top-2 right-2 size-8 bg-black flex items-center justify-center rounded-full text-xs font-black text-white;
}

.card-input {
  @apply w-full h-full bg-transparent text-gray-900 font-medium text-base outline-none;
  border: 0;
  resize: none;
  pointer-events: none;
}

.card-input::placeholder {
  color: rgb(107 114 128);
}
</style>
