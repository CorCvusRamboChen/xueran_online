// 哪些人物形象已经有 3D 模型（assets/avatars/<形象 id>-anim.glb / .json）。大厅的「你的形象」只列这些；以后加了模型自动多出来。
// 只看文件名，不载入文件（不会把 three.js 和模型拉进主包）。
export const MODEL_CHARS = new Set(Object.keys(import.meta.glob('../assets/avatars/*-anim.json'))
  .map((p) => p.split('/').pop().replace(/-anim\.json$/, '')));
