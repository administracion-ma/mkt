function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}`);
  }
  return value;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get metaAppId() {
    return required("META_APP_ID");
  },
  get metaAppSecret() {
    return required("META_APP_SECRET");
  },
  get metaRedirectUri() {
    return required("META_REDIRECT_URI");
  },
  get metaGraphApiVersion() {
    return process.env.META_GRAPH_API_VERSION || "v21.0";
  },
  get tokenEncryptionKey() {
    return required("TOKEN_ENCRYPTION_KEY");
  },
  get anthropicApiKey() {
    return required("ANTHROPIC_API_KEY");
  },
};
