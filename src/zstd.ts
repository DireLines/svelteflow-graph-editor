import { init, compress, decompress } from "@bokuweb/zstd-wasm";

export const zstdReady: Promise<void> = init();
export { compress, decompress };
