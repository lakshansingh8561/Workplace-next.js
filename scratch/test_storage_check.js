const { isStorageConfigured, getStorageConfig } = require("../src/lib/storage.ts");

console.log("Storage configured?:", isStorageConfigured());
console.log("Storage config:", {
  ...getStorageConfig(),
  apiKey: getStorageConfig().apiKey ? "***" : undefined,
  apiSecret: getStorageConfig().apiSecret ? "***" : undefined,
});
