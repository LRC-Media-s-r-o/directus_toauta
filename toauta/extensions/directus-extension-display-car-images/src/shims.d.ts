// Dependency-free on purpose: the repo-wide tsc also reads this file, and `vue`
// is only installed inside this extension folder.
declare module '*.vue' {
	const component: object;
	export default component;
}
