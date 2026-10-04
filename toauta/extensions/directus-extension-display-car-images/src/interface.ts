// Interface entry of the bundle: the item page renders interfaces, not displays.
// View-only by design: the component never emits `input`, so saving an item can
// never rewrite cars.images.
import InterfaceComponent from './interface.vue';

const carImagesInterface = {
	id: 'car-images',
	name: 'Náhledy fotografií',
	icon: 'photo_library',
	description: 'Náhledy obrázků ze seznamu odkazů. Jen pro čtení.',
	component: InterfaceComponent,
	types: ['unknown', 'csv', 'json', 'string', 'text'],
	group: 'other',
	recommendedDisplays: ['car-images'],
	options: null,
};

export default carImagesInterface;
