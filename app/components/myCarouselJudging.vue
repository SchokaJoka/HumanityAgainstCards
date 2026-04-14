<template>
  <div class="judging-wrap">
    <div v-for="(row, rowIndex) in rows" :key="rowIndex" class="judging-row"
      :style="{ zIndex: String(rowIndex), marginTop: rowIndex > 0 ? `-${rowOverlapPx}px` : '0px' }">
      <div class="judging-container" @wheel.prevent="handleScroll($event)"
        @touchstart.passive="handleTouchStart($event)" @touchmove.prevent="handleTouchMove($event)"
        @touchend="handleTouchEnd()" @touchcancel="handleTouchEnd()">
        <article v-for="(item, idx) in row" :key="String(item.id)" class="card"
          :class="isSelected(item) ? 'selected' : ''" :style="getCardStyle(idx, rowIndex)" @click="emitSelect(item)">
          <div class="w-full min-w-0 whitespace-pre-wrap break-words font-bold">
            {{ getCardTextForItem(item) }}
          </div>
          <div
            class="absolute top-2 right-2 size-10 rounded-full flex items-center justify-center font-semibold bg-black text-white">
            {{ rowIndex + 1 }}</div>
        </article>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// PROPS / EMITS
// ============================================================
const props = defineProps<{
  items: any[];
  lookupCards?: any[];
  selectedIds?: string[];
}>();

const emit = defineEmits<{
  (e: "select-item", item: any): void;
}>();

// STATE
// ============================================================
const isMobile = ref(false);
const sharedCurrent = ref(0);
const lastScrollAt = ref(0);
const scrollLockMs = 150;
const spacing = 75;

const touchStartX = ref<number | null>(null);
const dragStartIndexShared = ref(0);
const isTouchDragging = ref(false);

const CARD_WIDTH_PX = 208; // w-52
const CARD_PADDING_HORIZONTAL = 48;
const VISIBLE_TEXT_PX = CARD_WIDTH_PX - CARD_PADDING_HORIZONTAL;
const LINE_HEIGHT_PX = 22;
const DEFAULT_OVERLAP_PX = 128; // current -8rem
const MIN_OVERLAP_PX = 24;
const MAX_EXTRA_PX = 200;

// COMPUTED
// ============================================================
const cardTextById = computed(() => {
  const map = new Map<string, string>();
  for (const c of (props.lookupCards || [])) map.set(c.id, c.text);
  return map;
});

// group by submission.user_id (stable order)
const groups = computed(() => {
  if (!props.items || props.items.length === 0) return [];
  const hasSubmission = props.items.some((i) => !!i?.submission?.user_id);
  if (!hasSubmission) return [props.items];

  const order: string[] = [];
  const per: Record<string, any[]> = {};
  for (const it of props.items) {
    const key = String(it?.submission?.user_id ?? it?.user_id ?? "__ung");
    if (!order.includes(key)) order.push(key);
    per[key] = per[key] ?? [];
    per[key].push(it);
  }
  return order.map((k) => per[k] || []);
});

// rows: r-th card from each player
const rows = computed(() => {
  const players = groups.value;
  if (players.length === 0) return [];
  const maxLen = Math.max(...players.map((p) => p.length));
  const out: any[][] = [];
  for (let r = 0; r < maxLen; r++) {
    const row: any[] = [];
    for (const p of players) if (p[r]) row.push(p[r]);
    out.push(row);
  }
  return out;
});

const maxIndexGlobal = computed(() => {
  return Math.max(0, (rows.value.length ? Math.max(...rows.value.map(r => r.length)) : 1) - 1);
});
const maxIndexForRow = (rowIndex: number) =>
  Math.max(0, (rows.value[rowIndex]?.length ?? 1) - 1);

const currentForRow = (rowIndex: number) => {
  return Math.min(sharedCurrent.value, maxIndexForRow(rowIndex));
};

const rowOverlapPx = computed(() => {
  const baseRow = rows.value[0] ?? [];
  if (!baseRow.length) return DEFAULT_OVERLAP_PX;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return DEFAULT_OVERLAP_PX;
  ctx.font = "700 16px system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial";

  let maxMeasured = 0;
  for (const item of baseRow) {
    const text = getCardTextForItem(item) ?? "";
    const measured = Math.ceil(ctx.measureText(String(text)).width);
    if (measured > maxMeasured) maxMeasured = measured;
  }

  const lines = Math.ceil(maxMeasured / VISIBLE_TEXT_PX);
  const textHeight = Math.max(LINE_HEIGHT_PX, lines * LINE_HEIGHT_PX);
  const extraNeeded = Math.max(0, textHeight - LINE_HEIGHT_PX);
  const extraPx = Math.min(MAX_EXTRA_PX, Math.round(extraNeeded * 0.9));
  const overlap = Math.max(MIN_OVERLAP_PX, DEFAULT_OVERLAP_PX - extraPx);
  return overlap;
});

// HELPERS
// ============================================================
const getCardTextForItem = (item: any) => {
  if (typeof item?.text === "string") return item.text;
  const id = item?.card_id ?? item?.cardId ?? item?.id;
  return cardTextById.value.get(id) ?? "Loading...";
};

const isSelected = (item: any) =>
  !!props.selectedIds?.some((id) => String(id) === String(item.id));

const getCardStyle = (index: number, rowIndex = 0) => {
  const cur = currentForRow(rowIndex);
  const offsetFromCenter = index - cur;
  const z = offsetFromCenter === 0 ? 30 : Math.max(1, 30 - Math.abs(offsetFromCenter));
  const tx = offsetFromCenter * spacing;
  const rot = offsetFromCenter * 8;
  return {
    zIndex: String(z),
    transform: `rotateZ(${rot}deg) translateX(${tx}px)`,
    transformOrigin: "50% 100%",
  };
};

// HANDLERS
// ============================================================
const emitSelect = (item: any) => {
  if (isTouchDragging.value) {
    isTouchDragging.value = false;
    return;
  }
  emit("select-item", item);
};

// wheel: unified
const handleScroll = (e: WheelEvent) => {
  if (isMobile.value) return;
  const now = Date.now();
  if (now - lastScrollAt.value < scrollLockMs) return;
  const delta = e.deltaX > 0 ? 1 : -1;
  const next = Math.max(0, Math.min(sharedCurrent.value + delta, maxIndexGlobal.value));
  if (next === sharedCurrent.value) return;
  sharedCurrent.value = next;
  lastScrollAt.value = now;
};

// touch: unified
const handleTouchStart = (ev: TouchEvent) => {
  if (!isMobile.value) return;
  const t = ev.touches[0];
  if (!t) return;
  touchStartX.value = t.clientX;
  dragStartIndexShared.value = sharedCurrent.value;
  isTouchDragging.value = false;
};

const handleTouchMove = (ev: TouchEvent) => {
  if (!isMobile.value) return;
  const t = ev.touches[0];
  if (!t || touchStartX.value === null) return;
  const dx = t.clientX - touchStartX.value;
  if (Math.abs(dx) > 8) isTouchDragging.value = true;
  const movement = Math.round(dx / spacing);
  const next = Math.max(0, Math.min(dragStartIndexShared.value - movement, maxIndexGlobal.value));
  sharedCurrent.value = next;
};

const handleTouchEnd = () => {
  setTimeout(() => (isTouchDragging.value = false), 0);
};

const handleResize = () => {
  isMobile.value = window.innerWidth < 640;
};

// WATCHERS
// ============================================================
watch(
  () => rows.value.length,
  () => {
    sharedCurrent.value = Math.max(0, Math.min(sharedCurrent.value, maxIndexGlobal.value));
  },
  { immediate: true }
);

// LIFECYCLE
// ============================================================
onMounted(() => {
  isMobile.value = window.innerWidth < 640;
  window.addEventListener("resize", handleResize);
});

onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
});
</script>

<style scoped>
.judging-wrap {
  @apply w-full h-full flex flex-col items-end justify-end overflow-y-visible overflow-x-clip gap-10;
}

.judging-row {
  @apply w-full h-full max-h-72 flex items-center justify-center overflow-visible;
}

.judging-container {
  @apply relative w-52 h-full flex items-center justify-center overflow-visible cursor-pointer;
  touch-action: none;
}

.card {
  @apply absolute w-52 h-full max-h-64 overflow-y-auto rounded-xl shadow-xl bg-white flex p-4 pr-12 text-black;
  border: 3px solid black;
  transition: transform 300ms ease, background-color 200ms ease, border-color 200ms ease;
}

.card.selected {
  @apply border-violet-300 bg-violet-500 text-white;
}
</style>