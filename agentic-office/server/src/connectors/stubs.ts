/**
 * Conectores "stub": interfaz y configuracion definitivas, ejecucion simulada.
 * Para integrarlos de verdad, reemplaza el cuerpo de execute() por la llamada al
 * proveedor (ver docs/INTEGRATIONS.md). Las credenciales deben venir del entorno
 * o de un gestor de secretos, nunca de connectorConfig (que se ve en la UI).
 */
import type { Connector, ConnectorResult } from '../contracts';

function str(config: Record<string, unknown>, key: string): string {
  const v = config[key];
  return typeof v === 'string' ? v.trim() : '';
}

function simulated(output: Record<string, unknown>): ConnectorResult {
  return { ok: true, simulated: true, output: { ...output, simulado: true } };
}

const E164 = /^\+[1-9]\d{7,14}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const TTS_VOICES = ['femenina-calida', 'masculina-neutra', 'femenina-formal', 'masculina-cercana'];
export const TTS_LANGUAGES = ['es-CL', 'es-MX', 'es-ES', 'es-AR', 'en-US', 'pt-BR'];

/** WhatsApp Business (p. ej. Cloud API de Meta o un BSP como Twilio). */
export function createWhatsAppConnector(): Connector {
  return {
    info: {
      key: 'whatsapp',
      name: 'WhatsApp (en preparacion)',
      description: 'Envio de mensajes de WhatsApp Business desde un numero de la empresa. Hoy simula el envio.',
      maturity: 'stub',
      configFields: [
        { name: 'fromNumber', label: 'Numero de origen (E.164)', type: 'string', required: true, placeholder: '+56912345678' },
        { name: 'template', label: 'Plantilla aprobada (opcional)', type: 'string', required: false, placeholder: 'confirmacion_pedido' },
      ],
    },
    validateConfig(config) {
      const errors: string[] = [];
      const from = str(config, 'fromNumber');
      if (!from) errors.push('El numero de origen es obligatorio.');
      else if (!E164.test(from)) errors.push('El numero de origen debe estar en formato E.164, p. ej. +56912345678.');
      return errors;
    },
    async execute({ action, params, task }) {
      // TODO integracion: POST a la API de WhatsApp con la plantilla y los params como variables.
      return simulated({
        mensaje: `Se enviaria un WhatsApp desde ${str(action.connectorConfig, 'fromNumber') || '(sin numero)'}.`,
        plantilla: str(action.connectorConfig, 'template') || null,
        parametros: params,
        taskId: task.id,
      });
    },
  };
}

/** Voz / TTS: llamadas salientes o audios generados con un proveedor de voz. */
export function createVoiceTtsConnector(): Connector {
  return {
    info: {
      key: 'voice_tts',
      name: 'Voz / TTS (en preparacion)',
      description: 'Genera audio o realiza llamadas con voz sintetica. Hoy simula la locucion.',
      maturity: 'stub',
      configFields: [
        { name: 'voice', label: 'Voz', type: 'select', required: true, options: TTS_VOICES },
        { name: 'language', label: 'Idioma', type: 'select', required: true, options: TTS_LANGUAGES },
      ],
    },
    validateConfig(config) {
      const errors: string[] = [];
      const voice = str(config, 'voice');
      const language = str(config, 'language');
      if (!voice) errors.push('La voz es obligatoria.');
      else if (!TTS_VOICES.includes(voice)) errors.push(`Voz no valida. Opciones: ${TTS_VOICES.join(', ')}.`);
      if (!language) errors.push('El idioma es obligatorio.');
      else if (!TTS_LANGUAGES.includes(language)) errors.push(`Idioma no valido. Opciones: ${TTS_LANGUAGES.join(', ')}.`);
      return errors;
    },
    async execute({ action, params, task }) {
      // TODO integracion: sintetizar el texto (o iniciar la llamada) y devolver la URL del audio / id de llamada.
      return simulated({
        mensaje: 'Se generaria una locucion con voz sintetica.',
        voz: str(action.connectorConfig, 'voice') || null,
        idioma: str(action.connectorConfig, 'language') || null,
        parametros: params,
        taskId: task.id,
      });
    },
  };
}

/** Email transaccional (SMTP o API tipo SES/SendGrid/Resend). */
export function createEmailConnector(): Connector {
  return {
    info: {
      key: 'email',
      name: 'Email (en preparacion)',
      description: 'Envio de correos desde una direccion de la empresa. Hoy simula el envio.',
      maturity: 'stub',
      configFields: [
        { name: 'fromAddress', label: 'Remitente', type: 'string', required: true, placeholder: 'equipo@empresa.com' },
      ],
    },
    validateConfig(config) {
      const from = str(config, 'fromAddress');
      if (!from) return ['El remitente es obligatorio.'];
      if (!EMAIL.test(from)) return ['El remitente debe ser un correo valido.'];
      return [];
    },
    async execute({ action, params, task }) {
      // TODO integracion: enviar con el proveedor de correo; params suele traer destinatario, asunto y cuerpo.
      return simulated({
        mensaje: `Se enviaria un correo desde ${str(action.connectorConfig, 'fromAddress') || '(sin remitente)'}.`,
        parametros: params,
        taskId: task.id,
      });
    },
  };
}
