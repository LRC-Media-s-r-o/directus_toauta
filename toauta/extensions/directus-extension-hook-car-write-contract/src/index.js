// Directus hook: enforces the ToAuta write contract for public.cars.
// Filters run inside Directus' ItemsService before the write, for admins too, so a
// rejection here leaves the row untouched. Pure rules live in ./contract.mjs.
import {
	CONTRACT,
	CarWriteContractError,
	UNION_FUNCTION,
	UNION_TRIGGER,
	checkUpdatePayload,
	planCreate,
	planDelete,
	planUpdate,
	violation,
} from './contract.mjs';

const CHUNK = 500;

async function loadRows(database, keys) {
	const ids = [...new Set(keys.map((key) => String(key)))];
	const rows = [];

	for (let index = 0; index < ids.length; index += CHUNK) {
		const chunk = ids.slice(index, index + CHUNK);

		const found = await database
			.select(
				database.raw('c.id::text as id'),
				'c.source_system',
				'c.source_deleted',
				'c.sale_status',
				database.raw(
					"exists (select 1 from public.integration_rpc_entity_ids e where e.entity_type = 'car' and e.entity_id = c.id) as has_rpc_alias",
				),
			)
			.from('public.cars as c')
			.whereIn('c.id', chunk);

		rows.push(...found);
	}

	return rows;
}

async function unionTriggerActive(database) {
	const result = await database.raw(
		`select count(*)::int as n
		   from pg_catalog.pg_trigger t
		  where t.tgrelid = pg_catalog.to_regclass('public.cars')
		    and t.tgname = ?
		    and t.tgfoid = pg_catalog.to_regprocedure(?)
		    and t.tgenabled in ('O', 'A')
		    and not t.tgisinternal`,
		[UNION_TRIGGER, UNION_FUNCTION],
	);

	return Number(result?.rows?.[0]?.n ?? 0) === 1;
}

function reject(found, logger, action, count) {
	logger.warn({ contract: CONTRACT, action, rule: found.rule, fields: found.fields, items: count }, 'car write contract rejected the write');
	return new CarWriteContractError(found);
}

function requireDatabase(context) {
	const database = context?.database;
	if (!database) throw new Error(`${CONTRACT}: the filter context has no database connection`);
	return database;
}

export default function registerCarWriteContract({ filter }, { logger }) {
	filter('cars.items.update', async (payload, meta, context) => {
		const keys = Array.isArray(meta?.keys) ? meta.keys : [];
		const early = checkUpdatePayload(payload);
		if (early) throw reject(early, logger, 'update', keys.length);
		if (Object.keys(payload).length === 0 || keys.length === 0) return payload;

		const database = requireDatabase(context);
		const rows = await loadRows(database, keys);
		const plan = planUpdate({ payload, rows });
		if (!plan.ok) throw reject(plan, logger, 'update', keys.length);

		if (plan.requiresUnionTrigger && !(await unionTriggerActive(database))) {
			throw reject(violation('union_trigger_missing'), logger, 'update', keys.length);
		}

		return plan.payload;
	});

	filter('cars.items.create', async (payload) => {
		const plan = planCreate(payload);
		if (!plan.ok) throw reject(plan, logger, 'create', 1);
		return plan.payload;
	});

	filter('cars.items.delete', async (keys, _meta, context) => {
		const list = Array.isArray(keys) ? keys : [];
		if (list.length === 0) return keys;

		const rows = await loadRows(requireDatabase(context), list);
		const plan = planDelete({ rows });
		if (!plan.ok) throw reject(plan, logger, 'delete', list.length);

		return keys;
	});
}
