// O engine roda em Node ≥ 17, navegadores modernos e WebViews do Capacitor — todos têm
// structuredClone, mas a lib ES padrão do TypeScript não declara (vem de DOM/@types/node).
declare function structuredClone<T>(value: T): T;
