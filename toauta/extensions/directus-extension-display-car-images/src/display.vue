<template>
	<span v-if="urls.length === 0" class="car-images car-images--empty" data-car-images="empty">
		<value-null />
	</span>
	<span
		v-else
		ref="root"
		class="car-images"
		data-car-images="list"
		role="img"
		:aria-label="label"
		:title="label"
	>
		<span
			v-for="(url, index) in visible"
			:key="`${index}:${url}`"
			class="thumb"
			:class="{ broken: brokenUrls.has(url) }"
			data-car-images="thumb"
		>
			<v-icon v-if="brokenUrls.has(url)" name="broken_image" x-small data-car-images="broken" />
			<img
				v-else
				:src="url"
				alt=""
				loading="lazy"
				decoding="async"
				referrerpolicy="no-referrer"
				draggable="false"
				@error="markBroken(url)"
			/>
		</span>
		<span v-if="hidden > 0" class="more" data-car-images="more">+{{ hidden }}</span>
	</span>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { fitCount, formatPhotoCount, normalizeImageUrls } from './normalize.js';

const props = withDefaults(defineProps<{ value?: unknown; limit?: number | string | null }>(), {
	value: null,
	limit: null,
});

const urls = computed<string[]>(() => normalizeImageUrls(props.value));
const label = computed(() => formatPhotoCount(urls.value.length));

const root = ref<HTMLElement | null>(null);
const width = ref(0);
let observer: ResizeObserver | null = null;

watch(root, (element) => {
	observer?.disconnect();
	observer = null;
	if (!element || typeof ResizeObserver === 'undefined') return;
	observer = new ResizeObserver((entries) => {
		width.value = entries[0]?.contentRect.width ?? 0;
	});
	observer.observe(element);
});

onBeforeUnmount(() => observer?.disconnect());

const count = computed(() => fitCount(width.value, urls.value.length, props.limit));
const visible = computed(() => urls.value.slice(0, count.value));
const hidden = computed(() => urls.value.length - count.value);

const brokenUrls = reactive(new Set<string>());

watch(urls, () => brokenUrls.clear());

function markBroken(url: string) {
	brokenUrls.add(url);
}
</script>

<style scoped>
/* Thumbnail, gap and counter sizes must match THUMB_WIDTH, THUMB_GAP and COUNTER_WIDTH in normalize.js. */
.car-images {
	display: flex;
	align-items: center;
	gap: 4px;
	inline-size: 100%;
	min-inline-size: 0;
	overflow: hidden;
}

.thumb {
	display: inline-flex;
	flex: 0 0 auto;
	align-items: center;
	justify-content: center;
	inline-size: 40px;
	block-size: 30px;
	overflow: hidden;
	border-radius: var(--theme--border-radius, 4px);
	background-color: var(--theme--background-normal, #f0f4f9);
}

.thumb img {
	display: block;
	inline-size: 100%;
	block-size: 100%;
	object-fit: cover;
}

.thumb.broken {
	color: var(--theme--foreground-subdued, #a2b5cd);
	border: 1px dashed var(--theme--border-color, #d3dae4);
}

.more {
	flex: 0 0 auto;
	box-sizing: border-box;
	min-inline-size: 32px;
	max-inline-size: 40px;
	padding: 0 4px;
	border-radius: var(--theme--border-radius, 4px);
	background-color: var(--theme--background-normal, #f0f4f9);
	color: var(--theme--foreground-subdued, #a2b5cd);
	font-size: 12px;
	font-weight: 600;
	line-height: 22px;
	text-align: center;
}
</style>
