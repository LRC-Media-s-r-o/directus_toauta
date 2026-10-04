<template>
	<div class="car-images-field" data-car-images="field">
		<div v-if="urls.length === 0" class="empty" data-car-images="empty">
			<value-null />
		</div>
		<template v-else>
			<p class="summary">{{ summary }} · jen náhled, odkazy se zde neupravují</p>
			<ol class="grid">
				<li
					v-for="(url, index) in urls"
					:key="`${index}:${url}`"
					class="thumb"
					:class="{ broken: brokenUrls.has(url) }"
					data-car-images="thumb"
				>
					<a :href="url" target="_blank" rel="noopener noreferrer" :title="`Fotografie ${index + 1}: otevřít originál`">
						<v-icon v-if="brokenUrls.has(url)" name="broken_image" data-car-images="broken" />
						<img
							v-else
							:src="url"
							:alt="`Fotografie ${index + 1}`"
							loading="lazy"
							decoding="async"
							referrerpolicy="no-referrer"
							draggable="false"
							@error="markBroken(url)"
						/>
						<span class="index">{{ index + 1 }}</span>
					</a>
				</li>
			</ol>
		</template>
	</div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { formatPhotoCount, normalizeImageUrls } from './normalize.js';

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<{ value?: unknown }>(), { value: null });

const urls = computed<string[]>(() => normalizeImageUrls(props.value));
const summary = computed(() => formatPhotoCount(urls.value.length));

const brokenUrls = reactive(new Set<string>());

watch(urls, () => brokenUrls.clear());

function markBroken(url: string) {
	brokenUrls.add(url);
}
</script>

<style scoped>
.summary {
	margin: 0 0 8px;
	color: var(--theme--foreground-subdued, #a2b5cd);
	font-size: 14px;
}

.grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, 120px);
	gap: 8px;
	margin: 0;
	padding: 0;
	list-style: none;
}

.thumb a {
	position: relative;
	display: flex;
	align-items: center;
	justify-content: center;
	inline-size: 120px;
	block-size: 90px;
	overflow: hidden;
	border-radius: var(--theme--border-radius, 4px);
	background-color: var(--theme--background-normal, #f0f4f9);
	color: var(--theme--foreground-subdued, #a2b5cd);
}

.thumb img {
	display: block;
	inline-size: 100%;
	block-size: 100%;
	object-fit: cover;
}

.thumb.broken a {
	border: 1px dashed var(--theme--border-color, #d3dae4);
}

.index {
	position: absolute;
	inset-block-start: 4px;
	inset-inline-start: 4px;
	padding: 0 5px;
	border-radius: var(--theme--border-radius, 4px);
	background-color: rgb(0 0 0 / 0.55);
	color: #fff;
	font-size: 11px;
	font-weight: 600;
	line-height: 16px;
}
</style>
