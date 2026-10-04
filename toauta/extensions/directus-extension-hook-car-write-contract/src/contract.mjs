// Pure write contract for public.cars edits made through Directus.
// No Directus or database imports: src/index.js loads the rows and wires this into filters.
// The field lists and source rules are explained in toauta/README.md.

export const CONTRACT = 'toauta-car-write-contract';

// Identity and import provenance. Only the app and the importers write these.
export const PROVENANCE_FIELDS = Object.freeze([
	'id',
	'owner_id',
	'source_system',
	'source_id',
	'source_external_id',
	'source_subject_id',
	'source_deleted',
	'source_last_synced_at',
	'source_import_attempt',
	'source_inserted_at',
	'source_edited_at',
	'local_override_fields',
	'import_job_id',
]);

// Computed, generated or lifecycle columns. A manual value would be lost or would skip side effects.
export const SYSTEM_FIELDS = Object.freeze([
	'created_at',
	'updated_at',
	'is_on_sale',
	'views_all_count',
	'views_7d_count',
	'media_delete_scheduled_at',
	'media_deleted',
	'media_deleted_at',
	'sold_at',
	'sold_origin',
	'needs_attention',
	'attention_reasons',
	'import_unmatched_equipment_count',
	'location_inherited_from_profile',
	'max_photos_allowed',
	'seller',
]);

// Projected from the seller profile by database triggers, or owned by the photo pipeline.
export const LOCATION_MEDIA_FIELDS = Object.freeze(['address', 'city', 'location', 'latitude', 'longitude', 'images']);

// Content columns an admin may change on an override-honouring imported car. Each one written is
// appended to local_override_fields, which applyLocalOverrides() in the app's import-service.ts
// removes from every later import update.
export const IMPORT_OVERRIDE_FIELDS = Object.freeze([
	'make',
	'model',
	'model_supplement',
	'year',
	'price_final',
	'price_original',
	'price_note',
	'condition',
	'mileage_km',
	'description',
	'youtube_url',
	'vehicle_type_code',
	'body_type',
	'body_style',
	'fuel_type',
	'fuel_detail',
	'transmission',
	'transmission_detail',
	'gears_count',
	'drive_type',
	'drive_detail',
	'power_kw',
	'engine_capacity_cc',
	'engine_spec',
	'fuel_consumption',
	'emission_standard',
	'battery_capacity_kwh',
	'battery_soh_percent',
	'electric_range_km',
	'electric_consumption_kwh',
	'has_heat_pump',
	'seats_count',
	'doors_count',
	'airbags_count',
	'air_conditioning',
	'total_weight_kg',
	'load_capacity_kg',
	'color',
	'color_code',
	'color_tone',
	'color_type',
	'vin',
	'first_registration_date',
	'stk_valid_until',
	'emissions_valid_until',
	'country_of_origin',
	'vehicle_history',
	'service_book',
	'first_owner',
	'crashed',
	'tuning_modified',
	'disabled_accessible',
	'environmental_tax_paid',
	'vat_deductible',
	'availability',
	'delivery_date',
]);

export const PUBLICATION_FIELDS = Object.freeze(['is_published', 'sale_status']);

// Editable on manual cars only: commercial terms, lease summary, routing and catalogue ids.
export const MANUAL_ONLY_FIELDS = Object.freeze([
	'leasing_available',
	'credit_available',
	'rent_available',
	'down_payment',
	'monthly_payment',
	'payments_count',
	'lease_price',
	'auction_price',
	'listing_type',
	'currency',
	'equipment_text',
	'operating_lease_intended_for',
	'operating_lease_intended_for_codes',
	'operating_lease_annual_distance_km',
	'operating_lease_period_months',
	'operating_lease_price_without_vat',
	'operating_lease_services',
	'operating_lease_available_colors',
	'operating_lease_additional_info',
	'brand_id',
	'model_id',
]);

// Importers that honour exact column names in local_override_fields.
export const OVERRIDE_SOURCES = Object.freeze(['autocaris', 'http_post']);
// Importers that rewrite every pushed column and ignore local_override_fields (except location).
export const PUSH_SOURCES = Object.freeze(['sauto_xmlrpc']);
export const EDITABLE_SALE_STATUSES = Object.freeze(['available', 'reserved']);

export const UNION_TRIGGER = 'a0_cars_union_local_override_fields';
export const UNION_FUNCTION = 'public.union_car_local_override_fields()';

const CREATE_DEFAULTS = Object.freeze({
	source_system: 'manual',
	source_deleted: false,
	source_id: null,
	source_external_id: null,
	source_subject_id: null,
	source_last_synced_at: null,
	source_import_attempt: null,
	source_inserted_at: null,
	source_edited_at: null,
	import_job_id: null,
});

// The Studio error dialog cuts messages at 200 characters; extensions.fields keeps the full list.
const MAX_LISTED_FIELDS = 2;

export function formatFields(fields) {
	const shown = fields.slice(0, MAX_LISTED_FIELDS).join(', ');
	const rest = fields.length - MAX_LISTED_FIELDS;
	return rest > 0 ? `${shown} a další (${rest})` : shown;
}

function plural(fields, one, many) {
	return fields.length === 1 ? one : many;
}

function formatSource(value) {
	const text = typeof value === 'string' ? value : String(value);
	return text.length > 40 ? `${text.slice(0, 37)}...` : text;
}

export const MESSAGES = Object.freeze({
	malformed_payload: () => 'Úpravu inzerátu nelze zpracovat: data musí být objekt s poli tabulky cars.',
	provenance_field: (fields) =>
		`Pole ${formatFields(fields)} ${plural(fields, 'určuje', 'určují')} identitu a původ inzerátu; zapisuje ${plural(fields, 'ho', 'je')} jen aplikace a import.`,
	system_field: (fields) =>
		`Pole ${formatFields(fields)} počítá aplikace nebo databáze, ruční změna by se ztratila.`,
	location_media_field: (fields) =>
		`Pole ${formatFields(fields)} (poloha, fotky) odvozuje aplikace. Upravte ${plural(fields, 'ho', 'je')} v administraci prodejce.`,
	unknown_source: (_fields, source) =>
		`Inzerát má neznámý zdroj (${formatSource(source)}). Úprava v Directusu je z bezpečnostních důvodů zablokovaná.`,
	source_deleted: () =>
		'Inzerát byl ve zdrojovém systému smazán. Directus ho nemění; pokud se ve zdroji obnoví, převezme ho znovu import.',
	push_managed: () =>
		'Inzerát posílá software prodejce přes SAUTO XML-RPC a další odeslání by úpravu přepsalo. Změnu proveďte ve zdrojovém systému prodejce.',
	mixed_bulk: () => 'Hromadná úprava nesmí míchat ruční a importované inzeráty. Upravte je zvlášť.',
	imported_publication: () =>
		'Zveřejnění importovaného inzerátu řídí import a prodejce, Directus ho nemůže trvale změnit. Použijte administraci prodejce.',
	imported_sale_status: () =>
		'Stav prodeje importovaného inzerátu řídí import a prodejce (prodej spouští mazání fotek). Použijte administraci prodejce.',
	imported_field_unavailable: (fields) =>
		`Pole ${formatFields(fields)} import nezachová. U importovaného inzerátu lze měnit jen cenu, popis a technické údaje.`,
	sold_transition: () =>
		'Prodej a jeho zrušení mají vedlejší účinky (mazání fotek). Použijte administraci prodejce; Directus mění jen „available“ a „reserved“.',
	publish_sold: () => 'Prodaný inzerát nelze zveřejnit. Nejdřív zrušte prodej v administraci prodejce.',
	create_provenance: (fields) =>
		`Inzerát z Directusu může být jen ruční („manual“) bez údajů o importu: ${formatFields(fields)}.`,
	delete_imported: () =>
		'Importovaný inzerát nelze v Directusu smazat: import by ho vytvořil znovu a ztratila by se vazba na zdroj. Stáhněte ho ve zdroji.',
	union_trigger_missing: () =>
		'Chybí databázová pojistka a0_cars_union_local_override_fields. Úpravy importovaných inzerátů jsou do opravy zablokované.',
});

const RULE_STATUS = Object.freeze({ union_trigger_missing: { code: 'SERVICE_UNAVAILABLE', status: 503 } });

export function violation(rule, fields = [], source) {
	const listed = [...fields];
	return { ok: false, rule, fields: listed, message: MESSAGES[rule](listed, source) };
}

// Thrown into Directus. The API error handler recognises any error named 'DirectusError'
// (isDirectusError in @directus/errors) and answers with its status, code and message.
export class CarWriteContractError extends Error {
	constructor(found) {
		super(found.message);
		const { code, status } = RULE_STATUS[found.rule] ?? { code: 'INVALID_PAYLOAD', status: 400 };
		this.name = 'DirectusError';
		this.code = code;
		this.status = status;
		this.extensions = { reason: found.message, contract: CONTRACT, rule: found.rule, fields: found.fields };
	}

	toString() {
		return `${this.name} [${this.code}]: ${this.message}`;
	}
}

export function isPlainObject(value) {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}

function own(payload, field) {
	return Object.prototype.hasOwnProperty.call(payload, field);
}

function hits(fields, list) {
	return fields.filter((field) => list.includes(field));
}

export function classifyCar(row) {
	if (!isPlainObject(row)) return 'unknown';
	if (row.source_deleted === true) return 'deleted';
	if (row.source_deleted !== false) return 'unknown';
	const source = row.source_system;
	if (source === 'manual') {
		if (typeof row.has_rpc_alias !== 'boolean') return 'unknown';
		return row.has_rpc_alias ? 'push' : 'manual';
	}
	if (PUSH_SOURCES.includes(source)) return 'push';
	if (OVERRIDE_SOURCES.includes(source)) return 'imported';
	return 'unknown';
}

// Payload-only checks, run before any database read.
export function checkUpdatePayload(payload) {
	if (!isPlainObject(payload)) return violation('malformed_payload');
	const fields = Object.keys(payload);
	const provenance = hits(fields, PROVENANCE_FIELDS);
	if (provenance.length) return violation('provenance_field', provenance);
	const system = hits(fields, SYSTEM_FIELDS);
	if (system.length) return violation('system_field', system);
	const locationMedia = hits(fields, LOCATION_MEDIA_FIELDS);
	if (locationMedia.length) return violation('location_media_field', locationMedia);
	return null;
}

function sortedUnique(values) {
	return [...new Set(values)].sort();
}

// Directus types text[] columns as "unknown" and sends a JS array to Postgres as a JSON string,
// which Postgres rejects. A Postgres array literal is sent unchanged and cast by the column type.
// Only names from IMPORT_OVERRIDE_FIELDS reach this, so they never need escaping.
export function toPgTextArray(values) {
	for (const value of values) {
		if (!/^[a-z][a-z0-9_]*$/.test(value)) throw new TypeError(`not a column name: ${value}`);
	}
	return `{${values.map((value) => `"${value}"`).join(',')}}`;
}

export function planUpdate({ payload, rows }) {
	const early = checkUpdatePayload(payload);
	if (early) return early;
	const fields = Object.keys(payload);
	const loaded = Array.isArray(rows) ? rows : [];
	if (fields.length === 0 || loaded.length === 0) return { ok: true, payload, overrideFields: [], requiresUnionTrigger: false };

	const classes = loaded.map((row) => ({ row, kind: classifyCar(row) }));
	const unknown = classes.find(({ kind }) => kind === 'unknown');
	if (unknown) return violation('unknown_source', [], unknown.row?.source_system ?? 'null');
	if (classes.some(({ kind }) => kind === 'deleted')) return violation('source_deleted');
	if (classes.some(({ kind }) => kind === 'push')) return violation('push_managed');

	const kinds = new Set(classes.map(({ kind }) => kind));
	if (kinds.has('manual') && kinds.has('imported')) return violation('mixed_bulk');

	if (kinds.has('imported')) {
		if (own(payload, 'is_published')) return violation('imported_publication', ['is_published']);
		if (own(payload, 'sale_status')) return violation('imported_sale_status', ['sale_status']);
		const unavailable = fields.filter((field) => !IMPORT_OVERRIDE_FIELDS.includes(field));
		if (unavailable.length) return violation('imported_field_unavailable', unavailable);
		const overrideFields = sortedUnique(fields);
		// a0_cars_union_local_override_fields unions this with each row's existing markers.
		return {
			ok: true,
			payload: { ...payload, local_override_fields: toPgTextArray(overrideFields) },
			overrideFields,
			requiresUnionTrigger: true,
		};
	}

	if (own(payload, 'sale_status')) {
		const next = payload.sale_status;
		if (!EDITABLE_SALE_STATUSES.includes(next) || loaded.some((row) => row.sale_status === 'sold')) {
			return violation('sold_transition', ['sale_status']);
		}
	}
	if (payload.is_published === true && loaded.some((row) => row.sale_status === 'sold')) {
		return violation('publish_sold', ['is_published']);
	}
	return { ok: true, payload, overrideFields: [], requiresUnionTrigger: false };
}

function isCreateDefault(field, value) {
	if (field === 'local_override_fields') return Array.isArray(value) && value.length === 0;
	return own(CREATE_DEFAULTS, field) && value === CREATE_DEFAULTS[field];
}

export function planCreate(payload) {
	if (!isPlainObject(payload)) return violation('malformed_payload');
	const fields = Object.keys(payload);
	const provenance = hits(fields, PROVENANCE_FIELDS).filter(
		(field) => field !== 'id' && field !== 'owner_id' && !isCreateDefault(field, payload[field]),
	);
	if (provenance.length) return violation('create_provenance', provenance);
	const system = hits(fields, SYSTEM_FIELDS).filter((field) => field !== 'seller');
	if (system.length) return violation('system_field', system);
	const locationMedia = hits(fields, LOCATION_MEDIA_FIELDS);
	if (locationMedia.length) return violation('location_media_field', locationMedia);
	if (own(payload, 'sale_status') && !EDITABLE_SALE_STATUSES.includes(payload.sale_status)) {
		return violation('sold_transition', ['sale_status']);
	}
	return { ok: true, payload };
}

export function planDelete({ rows }) {
	const loaded = Array.isArray(rows) ? rows : [];
	if (loaded.some((row) => classifyCar(row) !== 'manual')) return violation('delete_imported');
	return { ok: true };
}

export const ALL_CLASSIFIED_FIELDS = Object.freeze([
	...PROVENANCE_FIELDS,
	...SYSTEM_FIELDS,
	...LOCATION_MEDIA_FIELDS,
	...IMPORT_OVERRIDE_FIELDS,
	...PUBLICATION_FIELDS,
	...MANUAL_ONLY_FIELDS,
]);
