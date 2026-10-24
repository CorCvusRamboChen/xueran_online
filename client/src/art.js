// 美术图片：构建时扫描 assets/art 下的文件。缺的图会退回到代码画的占位，所以可以一张张补。
// 规格见 design/ART_BRIEF.md。
const pick = (files) => Object.fromEntries(Object.entries(files).map(([path, url]) => [path.match(/([\w-]+)\.webp$/)[1], url]));

export const ROLE_ART = pick(import.meta.glob('./assets/art/roles/*.webp', { eager: true, import: 'default' }));
export const PEOPLE_ART = pick(import.meta.glob('./assets/art/people/*.webp', { eager: true, import: 'default' }));
export const SCENE_ART = pick(import.meta.glob('./assets/art/scenes/*.webp', { eager: true, import: 'default' }));
