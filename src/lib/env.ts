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
  get instagramAppId() {
    return required("INSTAGRAM_APP_ID");
  },
  get instagramAppSecret() {
    return required("INSTAGRAM_APP_SECRET");
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
  get appPassword() {
    return required("APP_PASSWORD");
  },
  get youtubeClientId() {
    return required("YOUTUBE_CLIENT_ID");
  },
  get youtubeClientSecret() {
    return required("YOUTUBE_CLIENT_SECRET");
  },
  get youtubeRedirectUri() {
    return required("YOUTUBE_REDIRECT_URI");
  },
  get resendApiKey() {
    return process.env.RESEND_API_KEY || null;
  },
  get notifyEmailTo() {
    return process.env.NOTIFY_EMAIL_TO || null;
  },
};
