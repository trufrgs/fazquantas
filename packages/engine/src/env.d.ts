// O engine roda em Node ≥ 17, navegadores modernos e WebViews do Capacitor — todos têm
// structuredClone, mas a lib ES padrão do TypeScript não declara (vem de DOM/@types/node).
declare function structuredClone<T>(value: T): T;

// Web Crypto e codificação de texto: presentes nos mesmos ambientes (Node ≥ 20, navegadores,
// Workers). Só o que o perfil de ranking usa.
declare const crypto: {
  getRandomValues<T extends Uint8Array>(array: T): T;
  subtle: { digest(algorithm: 'SHA-256', data: Uint8Array): Promise<ArrayBuffer> };
};
declare class TextEncoder {
  encode(input: string): Uint8Array;
}
declare function btoa(data: string): string;
