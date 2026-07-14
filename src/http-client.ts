import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import { SiteConfig } from './types';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export interface HttpClient {
  get<T = any>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
  post<T = any>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>>;
  instance: AxiosInstance;
}

/**
 * Crea un cliente HTTP con soporte de cookies y headers realistas.
 *
 * Se fuerza responseType='arraybuffer' para garantizar que las descargas
 * binarias (Excel, PDF) se reciban correctamente. Las respuestas de texto
 * se decodifican a UTF-8 en los módulos consumidores.
 */
export function createHttpClient(config: SiteConfig): HttpClient {
  const jar = new CookieJar();
  const instance = wrapper(
    axios.create({
      baseURL: config.baseUrl,
      timeout: 120000,
      responseType: 'arraybuffer',
      jar,
      withCredentials: true,
      maxRedirects: 5,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-PE,es;q=0.9,en;q=0.8',
      },
    })
  );

  return {
    instance,
    get: <T = any>(url: string, requestConfig?: AxiosRequestConfig) =>
      instance.get<T>(url, requestConfig),
    post: <T = any>(url: string, data?: any, requestConfig?: AxiosRequestConfig) =>
      instance.post<T>(url, data, requestConfig),
  };
}

/**
 * Convierte una respuesta arraybuffer a string UTF-8.
 */
export function responseToString(data: any): string {
  if (typeof data === 'string') return data;
  if (Buffer.isBuffer(data)) return data.toString('utf-8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf-8');
  return String(data);
}

/**
 * Convierte una respuesta arraybuffer a Buffer.
 */
export function responseToBuffer(data: any): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (typeof data === 'string') return Buffer.from(data, 'binary');
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  return Buffer.from(data);
}
