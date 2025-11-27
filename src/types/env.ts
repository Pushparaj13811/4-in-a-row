export interface env {
  PORT: number;
  NODE_ENV: string;
  DB_HOST: string;
  DB_PORT: number;
  DB_NAME: string;
  DB_USER: string;
  DB_PASSWORD: string;
  KAFKA_BROKER: string;
  KAFKA_CLIENT_ID: string;
  ENABLE_KAFKA: boolean;
}
