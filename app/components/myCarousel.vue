<template>
  <div class="carousel-wrap">
    <div ref="carouselContainerRef" class="carousel-container" @wheel.prevent="handleScroll"
      @touchstart.passive="handleTouchStart" @touchmove.prevent="handleTouchMove" @touchend="handleTouchEnd"
      @touchcancel="handleTouchEnd">
      <article v-for="(item, index) in items" :key="String(item.id)" class="card"
        :class="isSelected(item) ? (selectedClass || 'selected') : ''" :style="getCardStyle(item, index)"
        @click="emitSelect(item)">
        <div class="font-semibold">{{ getCardText(item.card_id) }}</div>
      </article>
    </div>
  </div>
</template>

<script setup lang="ts">

const props = defineProps<{
  items: any[];
  lookupCards: any[];
  selectedIds?: Array<string>;
  selectedClass?: string;
}>();

const emit = defineEmits<{
  (event: "select-item", item: any): void;
}>();

const carouselContainerRef = ref<HTMLDivElement | null>(null);
const current = ref(0);
const scrollLockMs = 150;
let lastScrollAt = 0;
const isMobile = ref(false);
let touchStartX = 0;
let dragStartIndex = 0;
let isTouchDragging = false;
const spacing = 75;

const maxIndex = computed(() => Math.max(0, props.items.length - 1));

const cardTextById = computed(() => {
  const map = new Map<string, string>();
  for (const card of props.lookupCards) {
    map.set(card.id, card.text);
  }
  return map;
});

const getCardText = (cardId: string) =>
  cardTextById.value.get(cardId) ?? "Loading...";

const isSelected = (item: any) =>
  !!props.selectedIds?.some((id) => String(id) === String(item.id));

const emitSelect = (item: any) => {
  if (isTouchDragging) {
    isTouchDragging = false;
    return;
  }

  emit("select-item", item);
};

const getCardStyle = (item: any, index: number) => {
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
  @apply absolute w-52 h-64 rounded-xl shadow-xl bg-white cursor-pointer flex items-start justify-start border-black p-6;
  border: 3px solid;
  transition: border-color 200ms ease, background-color 200ms ease, transform 300ms ease;
}

.card.selected {
  @apply bg-violet-500 border-violet-700 text-white;

}
</style>
