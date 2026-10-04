// Display entry of the bundle. Plain object instead of `defineDisplay` (an identity
// function in @directus/extensions-sdk): the repo-wide `tsc` type-checks every *.ts
// file, and the SDK is only installed inside this folder.
import DisplayComponent from './display.vue';

const display = {
	id: 'car-images',
	name: 'Náhledy fotografií',
	icon: 'photo_library',
	description: 'Náhledy obrázků ze seznamu odkazů (jen zobrazení).',
	component: DisplayComponent,
	types: ['unknown', 'csv', 'json', 'string', 'text'],
	options: [
		{
			field: 'limit',
			name: 'Počet náhledů',
			type: 'integer',
			meta: {
				width: 'half',
				interface: 'input',
				options: { min: 1, max: 50, placeholder: '6' },
				note: 'Kolik náhledů ukázat v seznamu. Zbytek se zobrazí jako +N.',
			},
			schema: { default_value: 6 },
		},
	],
};

export default display;
