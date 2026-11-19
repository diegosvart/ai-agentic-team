import type { ActionInput, ActionParam, AgentInput, AgentRole, Agent, Tenant } from '@agentic-office/shared';

/** Operaciones internas del store que el seed necesita (incluye crear el CEO, que la API publica no permite). */
export interface SeedHost {
  tenantCount(): number;
  createTenant(name: string): Tenant;
  insertAgent(tenantId: string, input: AgentInput, role: AgentRole): Agent;
  insertAction(tenantId: string, input: ActionInput): unknown;
}

type SeedAction = Omit<ActionInput, 'agentId'>;

interface SeedAgent {
  agent: AgentInput;
  actions: SeedAction[];
}

const str = (name: string, description: string, required = true, values?: string[]): ActionParam => ({
  name,
  type: 'string',
  description,
  required,
  ...(values ? { enum: values } : {}),
});
const num = (name: string, description: string, required = true): ActionParam => ({
  name,
  type: 'number',
  description,
  required,
});
const bool = (name: string, description: string, required = false): ActionParam => ({
  name,
  type: 'boolean',
  description,
  required,
});

function internal(
  key: string,
  name: string,
  description: string,
  params: ActionParam[],
  requiresApproval = false,
): SeedAction {
  return {
    key,
    name,
    description,
    params,
    connector: 'internal',
    connectorConfig: {},
    requiresApproval,
    enabled: true,
  };
}

const CEO: AgentInput = {
  key: 'ceo',
  name: 'Valeria Montes',
  area: 'Direccion',
  description:
    'Directora general. Recibe las solicitudes del usuario, las descompone en subtareas, las delega al agente de area ' +
    'adecuado y redacta la respuesta final integrando los resultados. No ejecuta acciones operativas por si misma.',
  defaultModel: 'opus',
  color: '#f5b83d',
  enabled: true,
};

const TEAM: SeedAgent[] = [
  {
    agent: {
      key: 'soporte',
      name: 'Mateo Rivas',
      area: 'Soporte',
      description:
        'Atiende a los clientes: consulta el estado de pedidos y tickets, responde dudas frecuentes y escala los casos ' +
        'que no puede resolver. Tono empatico y claro.',
      defaultModel: 'sonnet',
      color: '#4cc9f0',
      enabled: true,
    },
    actions: [
      internal('consultar_ticket', 'Consultar ticket', 'Busca un ticket de soporte por su numero y devuelve estado e historial.', [
        str('ticket_id', 'Numero del ticket, p. ej. T-1042.'),
      ]),
      internal('buscar_faq', 'Buscar en la base de conocimiento', 'Busca respuestas en las preguntas frecuentes y la documentacion de ayuda.', [
        str('consulta', 'Pregunta o palabras clave del cliente.'),
        num('max_resultados', 'Cantidad maxima de articulos a devolver.', false),
      ]),
      internal(
        'responder_cliente',
        'Responder al cliente',
        'Envia una respuesta al cliente por el canal del ticket. Tiene efecto externo, requiere aprobacion.',
        [
          str('ticket_id', 'Numero del ticket al que se responde.'),
          str('mensaje', 'Texto de la respuesta para el cliente.'),
          bool('cerrar_ticket', 'Cerrar el ticket tras responder.'),
        ],
        true,
      ),
    ],
  },
  {
    agent: {
      key: 'marketing',
      name: 'Lucia Ferrer',
      area: 'Marketing',
      description:
        'Disena y ejecuta campanas: redacta borradores de contenido, planifica el calendario editorial y publica en ' +
        'redes sociales. Cuida la voz de marca.',
      defaultModel: 'sonnet',
      color: '#f72585',
      enabled: true,
    },
    actions: [
      internal('redactar_borrador', 'Redactar borrador de contenido', 'Guarda un borrador de publicacion, articulo o correo promocional para revision.', [
        str('canal', 'Canal destino.', true, ['instagram', 'linkedin', 'blog', 'newsletter']),
        str('titulo', 'Titulo o asunto del contenido.'),
        str('texto', 'Cuerpo del contenido.'),
      ]),
      internal('consultar_metricas_campana', 'Consultar metricas de campana', 'Devuelve alcance, clics y conversiones de una campana.', [
        str('campana', 'Nombre o identificador de la campana.'),
        str('periodo', 'Periodo a consultar.', false, ['7d', '30d', '90d']),
      ]),
      {
        key: 'publicar_en_redes',
        name: 'Publicar en redes sociales',
        description:
          'Publica un contenido aprobado en redes sociales mediante un webhook (p. ej. Zapier o Make). Efecto externo, requiere aprobacion. ' +
          'Con la URL vacia se ejecuta en modo prueba.',
        params: [
          str('plataforma', 'Red social destino.', true, ['instagram', 'linkedin', 'x', 'facebook']),
          str('texto', 'Texto final a publicar.'),
          str('programar_para', 'Fecha y hora ISO 8601 para programar; vacio para publicar ya.', false),
        ],
        connector: 'webhook',
        connectorConfig: { url: '', method: 'POST' },
        requiresApproval: true,
        enabled: true,
      },
    ],
  },
  {
    agent: {
      key: 'contabilidad',
      name: 'Andres Salcedo',
      area: 'Contabilidad',
      description:
        'Lleva la contabilidad operativa: consulta saldos y facturas, concilia pagos y emite facturas y pagos a ' +
        'proveedores. Precision ante todo; nunca inventa cifras.',
      defaultModel: 'sonnet',
      color: '#2dc653',
      enabled: true,
    },
    actions: [
      internal('consultar_saldo_cliente', 'Consultar saldo de cliente', 'Devuelve el saldo pendiente y las facturas abiertas de un cliente.', [
        str('cliente', 'Nombre o identificador fiscal del cliente.'),
      ]),
      internal('resumen_gastos', 'Resumen de gastos', 'Resume los gastos del mes por categoria.', [
        str('mes', 'Mes en formato AAAA-MM.'),
        str('categoria', 'Categoria concreta; vacio para todas.', false),
      ]),
      internal(
        'emitir_factura',
        'Emitir factura',
        'Emite una factura a un cliente y la envia. Tiene efecto fiscal y externo, requiere aprobacion.',
        [
          str('cliente', 'Cliente al que se factura.'),
          str('concepto', 'Concepto de la factura.'),
          num('importe', 'Importe neto, sin impuestos.'),
          str('moneda', 'Moneda.', false, ['EUR', 'USD', 'MXN', 'COP', 'CLP']),
        ],
        true,
      ),
    ],
  },
  {
    agent: {
      key: 'comunicaciones',
      name: 'Sofia Navarro',
      area: 'Comunicaciones',
      description:
        'Gestiona la comunicacion interna y externa: comunicados, notas de prensa y avisos al equipo. ' +
        'Redacta con claridad y coordina los mensajes con Marketing y Direccion.',
      defaultModel: 'sonnet',
      color: '#9d4edd',
      enabled: true,
    },
    actions: [
      internal('redactar_comunicado', 'Redactar comunicado', 'Prepara un comunicado o nota de prensa y lo deja guardado como borrador.', [
        str('audiencia', 'A quien va dirigido.', true, ['interna', 'clientes', 'prensa']),
        str('asunto', 'Asunto del comunicado.'),
        str('puntos_clave', 'Ideas principales que debe incluir.'),
      ]),
      internal('agendar_anuncio', 'Agendar anuncio en el calendario', 'Reserva una fecha en el calendario de comunicaciones.', [
        str('titulo', 'Titulo del anuncio.'),
        str('fecha', 'Fecha en formato AAAA-MM-DD.'),
      ]),
      internal(
        'enviar_comunicado',
        'Enviar comunicado',
        'Distribuye un comunicado ya redactado a su audiencia. Efecto externo, requiere aprobacion.',
        [
          str('borrador_id', 'Identificador del borrador a enviar.'),
          str('audiencia', 'Lista de distribucion.', true, ['interna', 'clientes', 'prensa']),
        ],
        true,
      ),
    ],
  },
  {
    agent: {
      key: 'ventas',
      name: 'Diego Paredes',
      area: 'Ventas',
      description:
        'Gestiona el embudo comercial: califica leads, hace seguimiento de oportunidades y prepara propuestas. ' +
        'Orientado a resultados pero honesto con lo que ofrece.',
      defaultModel: 'sonnet',
      color: '#ff7b00',
      enabled: true,
    },
    actions: [
      internal('buscar_leads', 'Buscar leads', 'Lista leads del CRM filtrando por estado.', [
        str('estado', 'Estado del lead.', false, ['nuevo', 'contactado', 'calificado', 'perdido']),
        num('limite', 'Maximo de resultados.', false),
      ]),
      internal('calificar_lead', 'Calificar lead', 'Asigna una puntuacion y un estado a un lead segun su encaje.', [
        str('lead_id', 'Identificador del lead.'),
        num('puntuacion', 'Puntuacion de 0 a 100.'),
        str('motivo', 'Justificacion breve.'),
      ]),
      internal(
        'enviar_propuesta',
        'Enviar propuesta comercial',
        'Envia una propuesta comercial a un prospecto por correo. Efecto externo, requiere aprobacion.',
        [
          str('lead_id', 'Lead destinatario.'),
          str('resumen', 'Resumen de la oferta.'),
          num('importe', 'Importe total propuesto.'),
        ],
        true,
      ),
    ],
  },
  {
    agent: {
      key: 'rrhh',
      name: 'Camila Ortega',
      area: 'RR. HH.',
      description:
        'Gestiona personas: procesos de seleccion, onboarding y consultas internas de personal. ' +
        'Trata la informacion con confidencialidad y trato respetuoso.',
      defaultModel: 'sonnet',
      color: '#00b4d8',
      enabled: true,
    },
    actions: [
      internal('buscar_candidatos', 'Buscar candidatos', 'Busca candidatos en el banco de talento para un puesto.', [
        str('puesto', 'Puesto a cubrir.'),
        str('habilidades', 'Habilidades clave separadas por comas.', false),
      ]),
      internal('consultar_vacaciones', 'Consultar vacaciones', 'Devuelve los dias de vacaciones disponibles de un empleado.', [
        str('empleado', 'Nombre del empleado.'),
      ]),
      internal(
        'enviar_oferta_laboral',
        'Enviar oferta laboral',
        'Envia una oferta de empleo a un candidato. Efecto externo, requiere aprobacion.',
        [
          str('candidato', 'Nombre del candidato.'),
          str('puesto', 'Puesto ofrecido.'),
          num('salario_anual', 'Salario bruto anual ofrecido.'),
        ],
        true,
      ),
    ],
  },
];

/** Carga la plantilla "Empresa Demo" solo si no existe ningun tenant. Devuelve true si sembro. */
export function seedIfEmpty(host: SeedHost): boolean {
  if (host.tenantCount() > 0) return false;
  const tenant = host.createTenant('Empresa Demo');
  host.insertAgent(tenant.id, CEO, 'ceo');
  for (const { agent, actions } of TEAM) {
    const created = host.insertAgent(tenant.id, agent, 'area');
    for (const action of actions) host.insertAction(tenant.id, { ...action, agentId: created.id });
  }
  return true;
}
