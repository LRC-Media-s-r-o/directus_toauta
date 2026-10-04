import assert from 'node:assert/strict';
import test from 'node:test';
import {
	ALL_CLASSIFIED_FIELDS,
	CONTRACT,
	CarWriteContractError,
	IMPORT_OVERRIDE_FIELDS,
	LOCATION_MEDIA_FIELDS,
	MANUAL_ONLY_FIELDS,
	MESSAGES,
	PROVENANCE_FIELDS,
	SYSTEM_FIELDS,
	checkUpdatePayload,
	classifyCar,
	planCreate,
	planDelete,
	planUpdate,
	toPgTextArray,
	violation,
} from './contract.mjs';

// public.cars columns in production, information_schema order, read 2026-10-04.
const LIVE_CAR_COLUMNS = [
	'id', 'condition', 'year', 'mileage_km', 'fuel_type', 'body_type', 'transmission', 'drive_type', 'power_kw',
	'engine_capacity_cc', 'location', 'fuel_consumption', 'air_conditioning', 'seats_count', 'doors_count', 'color',
	'country_of_origin', 'seller', 'disabled_accessible', 'vehicle_history', 'is_published', 'created_at', 'updated_at',
	'price_original', 'price_final', 'is_on_sale', 'address', 'city', 'latitude', 'longitude', 'vat_deductible',
	'leasing_available', 'owner_id', 'make', 'model', 'description', 'images', 'source_system', 'source_id',
	'source_external_id', 'import_job_id', 'source_inserted_at', 'source_edited_at', 'source_deleted',
	'source_last_synced_at', 'local_override_fields', 'brand_id', 'model_id', 'vehicle_type_code', 'vin',
	'first_registration_date', 'stk_valid_until', 'emissions_valid_until', 'model_supplement', 'engine_spec',
	'total_weight_kg', 'load_capacity_kg', 'gears_count', 'currency', 'price_note', 'delivery_date', 'availability',
	'service_book', 'first_owner', 'credit_available', 'crashed', 'environmental_tax_paid', 'tuning_modified',
	'battery_capacity_kwh', 'electric_range_km', 'electric_consumption_kwh', 'color_code', 'color_tone', 'color_type',
	'listing_type', 'body_style', 'fuel_detail', 'transmission_detail', 'drive_detail', 'emission_standard',
	'airbags_count', 'equipment_text', 'down_payment', 'monthly_payment', 'payments_count', 'lease_price',
	'auction_price', 'operating_lease_intended_for', 'operating_lease_annual_distance_km',
	'operating_lease_period_months', 'operating_lease_price_without_vat', 'operating_lease_services',
	'operating_lease_additional_info', 'rent_available', 'max_photos_allowed', 'needs_attention', 'attention_reasons',
	'import_unmatched_equipment_count', 'views_all_count', 'views_7d_count', 'youtube_url',
	'operating_lease_available_colors', 'sale_status', 'sold_at', 'media_delete_scheduled_at', 'media_deleted',
	'media_deleted_at', 'battery_soh_percent', 'has_heat_pump', 'operating_lease_intended_for_codes',
	'source_import_attempt', 'location_inherited_from_profile', 'source_subject_id', 'sold_origin',
];

const manual = (extra = {}) => ({ id: 'm1', source_system: 'manual', source_deleted: false, sale_status: 'available', has_rpc_alias: false, ...extra });
const autocaris = (extra = {}) => ({ id: 'a1', source_system: 'autocaris', source_deleted: false, sale_status: 'available', has_rpc_alias: false, ...extra });
const httpPost = (extra = {}) => ({ id: 'h1', source_system: 'http_post', source_deleted: false, sale_status: 'available', has_rpc_alias: false, ...extra });
const sauto = (extra = {}) => ({ id: 's1', source_system: 'sauto_xmlrpc', source_deleted: false, sale_status: 'available', has_rpc_alias: true, ...extra });

test('every live cars column is classified exactly once', () => {
	assert.equal(LIVE_CAR_COLUMNS.length, 114);
	assert.equal(new Set(LIVE_CAR_COLUMNS).size, 114);
	assert.equal(ALL_CLASSIFIED_FIELDS.length, 114);
	assert.equal(new Set(ALL_CLASSIFIED_FIELDS).size, 114, 'a field is in two groups');
	assert.deepEqual([...ALL_CLASSIFIED_FIELDS].sort(), [...LIVE_CAR_COLUMNS].sort());
	assert.equal(IMPORT_OVERRIDE_FIELDS.length, 56);
	assert.equal(MANUAL_ONLY_FIELDS.length, 21);
});

test('the brief-required columns are protected on every car', () => {
	for (const field of [
		'source_system', 'source_id', 'source_external_id', 'source_subject_id', 'source_deleted', 'source_last_synced_at',
		'source_import_attempt', 'local_override_fields', 'import_job_id', 'id', 'owner_id', 'is_on_sale', 'created_at',
		'views_all_count', 'views_7d_count', 'media_delete_scheduled_at', 'media_deleted', 'media_deleted_at',
	]) {
		const found = checkUpdatePayload({ [field]: null });
		assert.ok(found, field);
		assert.equal(found.ok, false);
		assert.deepEqual(found.fields, [field]);
		for (const rows of [[manual()], [autocaris()], []]) assert.equal(planUpdate({ payload: { [field]: 'x' }, rows }).ok, false, field);
	}
});

test('protected groups are reported with their own rule, provenance first', () => {
	assert.equal(checkUpdatePayload({ source_system: 'autocaris' }).rule, 'provenance_field');
	assert.equal(checkUpdatePayload({ sold_at: null }).rule, 'system_field');
	assert.equal(checkUpdatePayload({ city: 'Brno' }).rule, 'location_media_field');
	assert.equal(checkUpdatePayload({ images: [] }).rule, 'location_media_field');
	const mixed = checkUpdatePayload({ city: 'Brno', needs_attention: false, local_override_fields: [] });
	assert.equal(mixed.rule, 'provenance_field');
	assert.deepEqual(mixed.fields, ['local_override_fields']);
	assert.equal(checkUpdatePayload({ price_final: 1 }), null);
});

test('malformed payloads are rejected without throwing', () => {
	for (const payload of [null, undefined, 'price_final', 42, true, [], [{ price_final: 1 }], new Date(), new Map(), Object.create({ price_final: 1 })]) {
		const found = planUpdate({ payload, rows: [autocaris()] });
		assert.equal(found.ok, false);
		assert.equal(found.rule, 'malformed_payload');
		assert.equal(planCreate(payload).rule, 'malformed_payload');
	}
	assert.equal(planUpdate({ payload: Object.assign(Object.create(null), { price_final: 1 }), rows: [autocaris()] }).ok, true);
});

test('classification follows source_system, source_deleted and the SAUTO alias', () => {
	assert.equal(classifyCar(manual()), 'manual');
	assert.equal(classifyCar(manual({ has_rpc_alias: true })), 'push');
	assert.equal(classifyCar(manual({ has_rpc_alias: undefined })), 'unknown');
	assert.equal(classifyCar(autocaris()), 'imported');
	assert.equal(classifyCar(httpPost()), 'imported');
	assert.equal(classifyCar(sauto()), 'push');
	assert.equal(classifyCar(sauto({ has_rpc_alias: false })), 'push');
	for (const row of [autocaris({ source_deleted: true }), sauto({ source_deleted: true }), manual({ source_deleted: true })]) {
		assert.equal(classifyCar(row), 'deleted');
	}
	assert.equal(classifyCar(autocaris({ source_deleted: null })), 'unknown');
	assert.equal(classifyCar(autocaris({ source_system: 'feed_x' })), 'unknown');
	assert.equal(classifyCar(autocaris({ source_system: 'AutoCarIS' })), 'unknown');
	assert.equal(classifyCar(null), 'unknown');
	assert.equal(classifyCar([]), 'unknown');
});

test('an allowed edit on an imported car appends exact column names to local_override_fields', () => {
	const payload = { price_final: 199000, description: 'Ručně opraveno' };
	for (const row of [autocaris(), httpPost()]) {
		const plan = planUpdate({ payload, rows: [row] });
		assert.equal(plan.ok, true);
		assert.equal(plan.requiresUnionTrigger, true);
		assert.deepEqual(plan.overrideFields, ['description', 'price_final']);
		assert.deepEqual(plan.payload, { price_final: 199000, description: 'Ručně opraveno', local_override_fields: '{"description","price_final"}' });
	}
	assert.deepEqual(payload, { price_final: 199000, description: 'Ručně opraveno' }, 'input payload is not mutated');
	const all = Object.fromEntries(IMPORT_OVERRIDE_FIELDS.map((field) => [field, null]));
	assert.deepEqual(planUpdate({ payload: all, rows: [autocaris()] }).overrideFields, [...IMPORT_OVERRIDE_FIELDS].sort());
});

test('bulk edits of imported cars send one shared marker list', () => {
	const plan = planUpdate({ payload: { color: 'Modrá' }, rows: [autocaris({ id: 'a1' }), autocaris({ id: 'a2' }), httpPost()] });
	assert.equal(plan.ok, true);
	assert.equal(plan.payload.local_override_fields, '{"color"}');
	assert.deepEqual(plan.overrideFields, ['color']);
});

test('override markers are sent as a Postgres text[] literal, never as a JS array', () => {
	assert.equal(toPgTextArray([]), '{}');
	assert.equal(toPgTextArray(['price_final']), '{"price_final"}');
	assert.equal(toPgTextArray(['color', 'price_final']), '{"color","price_final"}');
	for (const bad of ['a,b', 'x"y', '{a}', 'A', '1a', '', 'a b', 'a\\b']) {
		assert.throws(() => toPgTextArray([bad]), TypeError, bad);
	}
	for (const field of IMPORT_OVERRIDE_FIELDS) assert.equal(toPgTextArray([field]), `{"${field}"}`);
	const all = Object.fromEntries(IMPORT_OVERRIDE_FIELDS.map((field) => [field, null]));
	const plan = planUpdate({ payload: all, rows: [autocaris()] });
	assert.equal(typeof plan.payload.local_override_fields, 'string');
	assert.equal(plan.payload.local_override_fields, toPgTextArray([...IMPORT_OVERRIDE_FIELDS].sort()));
});

test('imported cars reject publication, sale status and fields outside the override list', () => {
	assert.equal(planUpdate({ payload: { is_published: false }, rows: [autocaris()] }).rule, 'imported_publication');
	assert.equal(planUpdate({ payload: { price_final: 1, is_published: true }, rows: [httpPost()] }).rule, 'imported_publication');
	assert.equal(planUpdate({ payload: { sale_status: 'reserved' }, rows: [autocaris()] }).rule, 'imported_sale_status');
	for (const field of MANUAL_ONLY_FIELDS) {
		const found = planUpdate({ payload: { price_final: 1, [field]: null }, rows: [autocaris()] });
		assert.equal(found.rule, 'imported_field_unavailable', field);
		assert.deepEqual(found.fields, [field]);
	}
	const unknownKey = planUpdate({ payload: { price_final: 1, totally_new_column: 1 }, rows: [autocaris()] });
	assert.equal(unknownKey.rule, 'imported_field_unavailable');
	const proto = planUpdate({ payload: JSON.parse('{"__proto__": {"x": 1}, "price_final": 1}'), rows: [autocaris()] });
	assert.equal(proto.rule, 'imported_field_unavailable');
	assert.deepEqual(proto.fields, ['__proto__']);
});

test('SAUTO, aliased manual, deleted and unknown-source cars reject every edit', () => {
	assert.equal(planUpdate({ payload: { price_final: 1 }, rows: [sauto()] }).rule, 'push_managed');
	assert.equal(planUpdate({ payload: { description: 'x' }, rows: [manual({ has_rpc_alias: true })] }).rule, 'push_managed');
	assert.equal(planUpdate({ payload: { is_published: false }, rows: [sauto()] }).rule, 'push_managed');
	assert.equal(planUpdate({ payload: { description: 'x' }, rows: [autocaris({ source_deleted: true })] }).rule, 'source_deleted');
	assert.equal(planUpdate({ payload: { description: 'x' }, rows: [manual({ source_deleted: true })] }).rule, 'source_deleted');
	const unknown = planUpdate({ payload: { description: 'x' }, rows: [autocaris({ source_system: 'feed_x' })] });
	assert.equal(unknown.rule, 'unknown_source');
	assert.match(unknown.message, /feed_x/);
	assert.equal(planUpdate({ payload: { description: 'x' }, rows: [autocaris(), sauto()] }).rule, 'push_managed');
	assert.equal(planUpdate({ payload: { description: 'x' }, rows: [manual(), autocaris({ source_deleted: true })] }).rule, 'source_deleted');
});

test('a bulk edit mixing manual and imported cars is rejected', () => {
	const found = planUpdate({ payload: { description: 'x' }, rows: [manual(), autocaris()] });
	assert.equal(found.rule, 'mixed_bulk');
});

test('manual cars keep their edit path without override bookkeeping', () => {
	const payload = { price_final: 1, description: 'x', is_published: false, listing_type: 'sale', currency: 'CZK', brand_id: 3 };
	const plan = planUpdate({ payload, rows: [manual(), manual({ id: 'm2' })] });
	assert.equal(plan.ok, true);
	assert.equal(plan.requiresUnionTrigger, false);
	assert.deepEqual(plan.overrideFields, []);
	assert.equal(plan.payload, payload);
	assert.equal(Object.hasOwn(plan.payload, 'local_override_fields'), false);
	for (const field of [...IMPORT_OVERRIDE_FIELDS, ...MANUAL_ONLY_FIELDS]) {
		assert.equal(planUpdate({ payload: { [field]: null }, rows: [manual()] }).ok, true, field);
	}
});

test('manual sale status may only move between available and reserved', () => {
	assert.equal(planUpdate({ payload: { sale_status: 'reserved' }, rows: [manual()] }).ok, true);
	assert.equal(planUpdate({ payload: { sale_status: 'available' }, rows: [manual({ sale_status: 'reserved' })] }).ok, true);
	assert.equal(planUpdate({ payload: { sale_status: 'sold' }, rows: [manual()] }).rule, 'sold_transition');
	assert.equal(planUpdate({ payload: { sale_status: 'available' }, rows: [manual({ sale_status: 'sold' })] }).rule, 'sold_transition');
	assert.equal(planUpdate({ payload: { sale_status: null }, rows: [manual()] }).rule, 'sold_transition');
	assert.equal(planUpdate({ payload: { sale_status: 'Sold' }, rows: [manual()] }).rule, 'sold_transition');
	assert.equal(planUpdate({ payload: { is_published: true }, rows: [manual({ sale_status: 'sold' })] }).rule, 'publish_sold');
	assert.equal(planUpdate({ payload: { is_published: false }, rows: [manual({ sale_status: 'sold' })] }).ok, true);
	assert.equal(planUpdate({ payload: { description: 'x' }, rows: [manual({ sale_status: 'sold' })] }).ok, true);
});

test('empty payloads and missing rows pass through unchanged', () => {
	const empty = {};
	assert.equal(planUpdate({ payload: empty, rows: [autocaris()] }).payload, empty);
	const payload = { price_final: 1 };
	assert.equal(planUpdate({ payload, rows: [] }).payload, payload);
	assert.equal(planUpdate({ payload, rows: undefined }).payload, payload);
	assert.equal(planUpdate({ payload: { source_id: 'x' }, rows: [] }).rule, 'provenance_field');
});

test('create allows only manual cars without import data', () => {
	const ok = { owner_id: 'u', seller: 'dealer', make: 'Škoda', model: 'Octavia', year: 2020, mileage_km: 1, price_final: 1, price_original: 1, condition: 'used', fuel_type: 'petrol', body_type: 'sedan', transmission: 'manual', drive_type: 'fwd' };
	assert.equal(planCreate(ok).ok, true);
	assert.equal(planCreate({ ...ok, id: '00000000-0000-4000-8000-000000000001', source_system: 'manual', source_deleted: false, local_override_fields: [], source_id: null }).ok, true);
	assert.equal(planCreate({ ...ok, source_system: 'sauto_xmlrpc' }).rule, 'create_provenance');
	assert.equal(planCreate({ ...ok, source_id: '1' }).rule, 'create_provenance');
	assert.equal(planCreate({ ...ok, local_override_fields: ['price_final'] }).rule, 'create_provenance');
	assert.equal(planCreate({ ...ok, source_deleted: true }).rule, 'create_provenance');
	assert.equal(planCreate({ ...ok, views_all_count: 9 }).rule, 'system_field');
	assert.equal(planCreate({ ...ok, city: 'Brno' }).rule, 'location_media_field');
	assert.equal(planCreate({ ...ok, sale_status: 'sold' }).rule, 'sold_transition');
	assert.equal(planCreate({ ...ok, sale_status: 'reserved' }).ok, true);
});

test('delete is allowed for plain manual cars only', () => {
	assert.equal(planDelete({ rows: [manual(), manual({ id: 'm2' })] }).ok, true);
	assert.equal(planDelete({ rows: [] }).ok, true);
	for (const row of [autocaris(), httpPost(), sauto(), manual({ has_rpc_alias: true }), autocaris({ source_deleted: true }), autocaris({ source_system: 'x' })]) {
		assert.equal(planDelete({ rows: [manual(), row] }).rule, 'delete_imported');
	}
});

test('rejections become Directus errors with a Czech message under 200 characters', () => {
	const longest = [...ALL_CLASSIFIED_FIELDS].sort((a, b) => b.length - a.length).slice(0, 6);
	for (const [rule, build] of Object.entries(MESSAGES)) {
		const message = build(longest, 'x'.repeat(200));
		assert.ok(message.length <= 200, `${rule}: ${message.length}`);
		assert.match(message, /[áčďéěíňóřšťúůýž]/i, rule);
		assert.doesNotMatch(message, /undefined|\[object/);
	}
	const error = new CarWriteContractError(violation('provenance_field', ['source_system']));
	assert.equal(error.name, 'DirectusError');
	assert.equal(error.code, 'INVALID_PAYLOAD');
	assert.equal(error.status, 400);
	assert.deepEqual(error.extensions, { reason: error.message, contract: CONTRACT, rule: 'provenance_field', fields: ['source_system'] });
	assert.ok(error instanceof Error);
	const unavailable = new CarWriteContractError(violation('union_trigger_missing'));
	assert.equal(unavailable.status, 503);
	assert.equal(unavailable.code, 'SERVICE_UNAVAILABLE');
});

test('messages agree in number with the listed fields', () => {
	assert.equal(MESSAGES.provenance_field(['source_system']), 'Pole source_system určuje identitu a původ inzerátu; zapisuje ho jen aplikace a import.');
	assert.match(MESSAGES.provenance_field(['source_id', 'source_system']), /^Pole source_id, source_system určují .* zapisuje je /);
	assert.match(MESSAGES.provenance_field(['a', 'b', 'c', 'd']), /^Pole a, b a další \(2\) určují /);
	assert.match(MESSAGES.location_media_field(['city']), /Upravte ho v administraci/);
	assert.match(MESSAGES.location_media_field(['city', 'images']), /Upravte je v administraci/);
});

test('field lists stay disjoint from each other', () => {
	const groups = { PROVENANCE_FIELDS, SYSTEM_FIELDS, LOCATION_MEDIA_FIELDS, IMPORT_OVERRIDE_FIELDS, MANUAL_ONLY_FIELDS };
	for (const [name, list] of Object.entries(groups)) {
		assert.ok(Object.isFrozen(list), name);
		for (const [other, otherList] of Object.entries(groups)) {
			if (name === other) continue;
			assert.deepEqual(list.filter((field) => otherList.includes(field)), [], `${name} ∩ ${other}`);
		}
	}
});
