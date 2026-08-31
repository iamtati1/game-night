/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** Origin of the Jolt API, e.g. https://jolt-api.onrender.com.
     *  Empty/unset in development, where Vite's dev proxy handles /api. */
    readonly VITE_API_URL?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
