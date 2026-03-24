<template>
  <section class="carousel-wrap">
    <div
      ref="carouselContainerRef"
      class="carousel-container"
      @wheel.prevent="handleScroll"
      @touchstart.passive="handleTouchStart"
      @touchmove.prevent="handleTouchMove"
      @touchend="handleTouchEnd"
      @touchcancel="handleTouchEnd"
    >
      <article
        v-for="(handCard, index) in handCards"
        :key="String(handCard.id)"
        class="card"
        :class="{ selected: isSelected(handCard) }"
        :style="getCardStyle(index)"
        @click="emitSelect(handCard)"
      >
        <p>{{ getCardText(handCard.card_id) }}</p>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
type HandCard = {
  id: string | number;
  card_id: string;
};

type CollectionCard = {
  id: string;
  text: string;
};

type DraggableInstance = {
  kill: () => void;
};

const props = defineProps<{
  handCards: HandCard[];
  collectionCards: CollectionCard[];
  selectedCardIds?: Array<string | number>;
}>();

const emit = defineEmits<{
  (event: "select-card", card: HandCard): void;
}>();

const carouselContainerRef = ref<HTMLDivElement | null>(null);
const current = ref(0);
const scrollLockMs = 120;
let lastScrollAt = 0;
const isMobile = ref(false);
let draggable: DraggableInstance | null = null;
let touchStartX = 0;
let dragStartIndex = 0;
let isTouchDragging = false;

const gsap = useGSAP();
const spacing = 75;

const maxIndex = computed(() => Math.max(0, props.handCards.length - 1));

const cardTextById = computed(() => {
  const map = new Map<string, string>();
  for (const card of props.collectionCards) {
    map.set(card.id, card.text);
  }
  return map;
});

const getCardText = (cardId: string) =>
  cardTextById.value.get(cardId) ?? "Loading...";

const isSelected = (card: HandCard) =>
  !!props.selectedCardIds?.some((id) => String(id) === String(card.id));

const emitSelect = (card: HandCard) => {
  if (isTouchDragging) {
    isTouchDragging = false;
    return;
  }

  emit("select-card", card);
};

const getCardStyle = (index: number) => {
  const offsetFromCenter = index - current.value;
  const zIndex =
    offsetFromCenter === 0 ? 1000 : 100 - Math.abs(offsetFromCenter);
  const translateX = offsetFromCenter * spacing;
  const rotationDeg = offsetFromCenter * 10;

  return {
    zIndex: String(zIndex),
    transform: `rotateZ(${rotationDeg}deg) translateX(${translateX}px)`,
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

const killDraggable = () => {
  if (!draggable) return;
  draggable.kill();
  draggable = null;
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

const initializeDraggable = () => {
  if (!isMobile.value) return;
  if (!carouselContainerRef.value) return;

  killDraggable();

  const DraggablePlugin = gsap.core.globals().Draggable as
    | {
        create: (
          target: Element,
          vars: Record<string, unknown>,
        ) => DraggableInstance[];
      }
    | undefined;

  if (!DraggablePlugin) return;

  let dragStartIndex = 0;

  draggable = DraggablePlugin.create(carouselContainerRef.value, {
    type: "x",
    edgeResistance: 0.85,
    bounds: {
      minX: -(maxIndex.value * spacing),
      maxX: 0,
    },
    onPress: () => {
      dragStartIndex = current.value;
    },
    onDrag: function (this: { x: number }) {
      const movement = Math.round(this.x / spacing);
      const nextIndex = Math.max(
        0,
        Math.min(dragStartIndex - movement, maxIndex.value),
      );
      current.value = nextIndex;
    },
    onRelease: function (this: { target: EventTarget | null }) {
      if (!(this.target instanceof Element)) return;
      gsap.to(this.target, { x: 0, duration: 0.25, ease: "power2.out" });
    },
  })[0];
};

const handleResize = () => {
  const wasMobile = isMobile.value;
  isMobile.value = window.innerWidth < 640;

  if (!wasMobile && isMobile.value) {
    initializeDraggable();
    return;
  }

  if (wasMobile && !isMobile.value) {
    killDraggable();
  }
};

watch(
  () => props.handCards.length,
  async () => {
    current.value = Math.min(current.value, maxIndex.value);
    if (!isMobile.value) return;
    await nextTick();
    initializeDraggable();
  },
);

onMounted(async () => {
  current.value = Math.floor(maxIndex.value / 2);
  isMobile.value = window.innerWidth < 640;

  await nextTick();

  if (carouselContainerRef.value) {
    gsap.fromTo(
      carouselContainerRef.value,
      { autoAlpha: 0, y: 12 },
      { autoAlpha: 1, y: 0, duration: 0.28, ease: "power2.out" },
    );
  }

  if (isMobile.value) {
    initializeDraggable();
  }

  window.addEventListener("resize", handleResize);
});

onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
  killDraggable();
});
</script>

<style scoped>
.carousel-wrap {
  width: 100%;
  height: 30rem;
  padding: 2rem 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.carousel-container {
  position: relative;
  width: 13rem;
  height: 16rem;
  touch-action: none;
}

.card {
  position: absolute;
  top: 0;
  left: 0;
  width: 13rem;
  height: 16rem;
  flex-shrink: 0;
  border-radius: 0.5rem;
  padding: 1.5rem;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.16);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    opacity 300ms ease,
    border-color 200ms ease,
    transform 300ms ease;
  transform-origin: center center;
  user-select: none;
}

.card:hover {
  opacity: 0.9;
}

.card.selected {
  border-color: #60a5fa;
  background: #eff6ff;
  box-shadow:
    0 0 0 2px #bfdbfe,
    0 12px 30px rgba(15, 23, 42, 0.16);
}

.card p {
  margin: 0;
  color: #1f2937;
  font-weight: 700;
  line-height: 1.35;
  text-align: center;
  pointer-events: none;
}
</style>
