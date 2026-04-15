<template>
  <div class="carousel-wrap">
    <div ref="carouselContainerRef" class="carousel-container" @wheel.prevent="handleScroll"
      @touchstart.passive="handleTouchStart" @touchmove="handleTouchMove" @touchend="handleTouchEnd"
      @touchcancel="handleTouchEnd">
      <article v-for="(item, index) in items" :key="String(item.id)" class="card" :style="getCardStyle(item, index)"
        @click="handleCardClick(index)">
        <div class="card-inner">
          <div class="card-index">{{ index + 1 }}</div>
          <textarea :value="getCardText(item)" class="card-input" placeholder="Your answer..."
            :ref="(el) => setTextareaRef(el, index)" @focus="emit('focus-input')" @blur="emit('blur-input')"
            @input="onCardInput(index, item, $event)" />
        </div>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">
// TYPES
// ============================================================
type CreativeInputItem = {
  id: string | number;
  text?: string;
};

// PROPS / EMITS
// ============================================================
const props = defineProps<{
  items: CreativeInputItem[];
  selectedIds?: Array<string>;
}>();

const emit = defineEmits<{
  (event: "update-item-text", payload: { index: number; id: string; text: string }): void;
  (event: "focus-input"): void;
  (event: "blur-input"): void;
}>();

// STATE
// ============================================================
const isMobile = ref(false);
const carouselContainerRef = ref<HTMLDivElement | null>(null);
const textareaRefs = ref<Array<HTMLTextAreaElement | null>>([]);
const current = ref(0);
const scrollLockMs = 150;
const spacing = 75;

let lastScrollAt = 0;
let touchStartX = 0;
let dragStartIndex = 0;
let isTouchDragging = false;

// COMPUTED
// ============================================================
const maxIndex = computed(() => Math.max(0, props.items.length - 1));

// HELPERS
// ============================================================
const getCardText = (item: CreativeInputItem) => item.text ?? "";

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

const getCardStyle = (item: CreativeInputItem, index: number) => {
  const offsetFromCenter = index - current.value;
  const zIndex =
    offsetFromCenter === 0 ? 30 : Math.max(1, 30 - Math.abs(offsetFromCenter));
  const translateX = offsetFromCenter * spacing;
  const rotationDeg = offsetFromCenter * 10;
  const translateY = "0px";

  return {
    zIndex: String(zIndex),
    transform: `rotateZ(${rotationDeg}deg) translateX(${translateX}px) translateY(${translateY})`,
    transformOrigin: "50% 100%",
  };
};

// HANDLERS
// ============================================================
const handleCardClick = async (index: number) => {
  setCurrent(index);
  await nextTick();
  textareaRefs.value[index]?.focus();
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

  const dominant = Math.abs(event.deltaX) > Math.abs(event.deltaY)
    ? event.deltaX
    : event.deltaY;

  if (dominant === 0) return;
  const delta = dominant > 0 ? 1 : -1;

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

// WATCHERS
// ============================================================
watch(
  () => props.items.length,
  () => {
    current.value = Math.min(current.value, maxIndex.value);
  },
);

// LIFECYCLE
// ============================================================
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


.card-inner {
  @apply w-full h-full flex flex-col gap-2;
}

.card-index {
  @apply fixed top-2 right-2 size-8 bg-black flex items-center justify-center rounded-full text-xs font-black text-white;
}

.card {
  @apply absolute w-52 h-64 bg-white rounded-lg border-black p-4 shadow-lg cursor-pointer overflow-y-auto;
  border: 2px solid;
  transition: border-color 200ms ease, background-color 200ms ease, transform 300ms ease;
}

.card-input {
  @apply w-full h-full bg-transparent text-gray-900 font-medium text-base outline-none overflow-y-auto;
  border: 0;
  resize: none;
  pointer-events: none;
  overflow-wrap: anywhere;
  word-break: break-word;
  white-space: pre-wrap;
}
</style>
