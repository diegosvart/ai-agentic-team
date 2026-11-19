import type { OfficeEvent, OfficeEventPayload } from '@agentic-office/shared';
import type { EventBus } from '../contracts';

const BUFFER_SIZE = 500;

interface Channel {
  seq: number;
  buffer: OfficeEvent[];
  listeners: Set<(event: OfficeEvent) => void>;
}

/** Bus en memoria por tenant: seq incremental y buffer circular de los ultimos 500 eventos. */
export function createEventBus(): EventBus {
  const channels = new Map<string, Channel>();

  const channel = (tenantId: string): Channel => {
    let ch = channels.get(tenantId);
    if (!ch) {
      ch = { seq: 0, buffer: [], listeners: new Set() };
      channels.set(tenantId, ch);
    }
    return ch;
  };

  return {
    publish(tenantId, payload: OfficeEventPayload) {
      const ch = channel(tenantId);
      const event = { ...payload, seq: ++ch.seq, ts: new Date().toISOString() } as OfficeEvent;
      ch.buffer.push(event);
      if (ch.buffer.length > BUFFER_SIZE) ch.buffer.shift();
      // Copia para tolerar des-suscripciones durante la emision.
      for (const listener of [...ch.listeners]) {
        try {
          listener(event);
        } catch {
          // Un suscriptor roto no debe afectar a los demas ni al publicador.
        }
      }
      return event;
    },
    subscribe(tenantId, listener) {
      const ch = channel(tenantId);
      ch.listeners.add(listener);
      return () => {
        ch.listeners.delete(listener);
      };
    },
    recent(tenantId, afterSeq) {
      const ch = channel(tenantId);
      return afterSeq === undefined ? [...ch.buffer] : ch.buffer.filter((e) => e.seq > afterSeq);
    },
  };
}
