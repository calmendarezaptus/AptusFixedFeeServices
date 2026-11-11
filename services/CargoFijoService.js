import PrebillApiClient from '../core/PrebillApiClient.js';

export class CargoFijoError extends Error {
    constructor(message, status = 400) { super(message); this.status = status; }
}

const orgId = value => typeof value === 'string' && /^\d+$/.test(value);
const localId = value => Number.isInteger(value) && value > 0;
const isDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const isPeriodo = value => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

// Solo estos proyectos llevan honorarios fijos: sus tiempos nacen no facturables.
export const TIPOS_COBRO = ['fijo', 'iguala'];
const CONCEPTO_MAX = 200;

function validateMonto(monto) {
    if (typeof monto !== 'number' || !Number.isFinite(monto) || monto <= 0) throw new CargoFijoError('monto debe ser un número mayor que 0.');
    if (Math.round(monto * 100) !== monto * 100) throw new CargoFijoError('monto admite como máximo 2 decimales.');
    return monto;
}

function validateConcepto(concepto) {
    if (typeof concepto !== 'string' || !concepto.trim()) throw new CargoFijoError('concepto debe ser texto no vacío.');
    if (concepto.trim().length > CONCEPTO_MAX) throw new CargoFijoError(`concepto admite como máximo ${CONCEPTO_MAX} caracteres.`);
    return concepto.trim();
}

// Alta: proyecto requerido; monto, concepto y fecha opcionales (la API pone el honorario del
// proyecto, "Honorarios (cuota fija)" y hoy). Edición: solo fecha, concepto y monto, al menos uno.
export function validateCargoFijo(organizationId, body, { update = false } = {}) {
    if (!orgId(organizationId)) throw new CargoFijoError('Organización inválida.');
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new CargoFijoError('Se requiere un objeto JSON.');
    const payload = {};
    if (!update) {
        if (!localId(body.proyecto_id)) throw new CargoFijoError('proyecto_id debe ser el ID del proyecto en Aptus (entero).');
        payload.proyecto_id = body.proyecto_id;
    }
    if (body.fecha !== undefined) {
        if (!isDate(body.fecha)) throw new CargoFijoError('fecha debe ser una fecha válida YYYY-MM-DD.');
        payload.fecha = body.fecha;
    }
    if (body.concepto !== undefined) payload.concepto = validateConcepto(body.concepto);
    if (body.monto !== undefined) payload.monto = validateMonto(body.monto);
    if (update && Object.keys(payload).length === 0) throw new CargoFijoError('Indica al menos fecha, concepto o monto.');
    return payload;
}

export function validatePeriodo(organizationId, body) {
    if (!orgId(organizationId)) throw new CargoFijoError('Organización inválida.');
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new CargoFijoError('Se requiere un objeto JSON.');
    if (!isPeriodo(body.periodo)) throw new CargoFijoError('periodo debe ser un mes válido YYYY-MM.');
    return { periodo: body.periodo };
}

export default class CargoFijoService {
    constructor(organizationId, { api = null, req = null } = {}) {
        this.organizationId = organizationId;
        this.api = api ?? new PrebillApiClient(organizationId, { req });
    }

    checkId(id) {
        if (!orgId(this.organizationId)) throw new CargoFijoError('Organización inválida.');
        if (typeof id !== 'string' || !/^\d+$/.test(id)) throw new CargoFijoError('ID de cargo inválido.');
    }

    static ensureCargo(data) {
        if (!data || !Number.isInteger(data.id)) {
            const error = new CargoFijoError('El servicio de Aptus devolvió un cargo con formato inesperado.', 502);
            error.stage = 'response'; error.outcome_unknown = true;
            throw error;
        }
        return data;
    }

    // Se revisa el proyecto antes de escribir: la API no impide cargos fijos en proyectos por hora.
    async checkProyecto(proyectoId, payload) {
        const proyecto = await this.api.request('get', '/proyectos/' + proyectoId, { stage: 'get_proyecto' });
        if (!proyecto || !Number.isInteger(proyecto.id)) throw new CargoFijoError('El servicio de Aptus devolvió un proyecto con formato inesperado.', 502);
        if (!TIPOS_COBRO.includes(proyecto.tipo_cobro)) throw new CargoFijoError('El proyecto se cobra por hora: los honorarios fijos solo aplican a proyectos de cuota fija o iguala.', 422);
        if (payload.monto === undefined && !(Number(proyecto.honorario_fijo) > 0)) throw new CargoFijoError('El proyecto no tiene honorario fijo configurado: indica el monto.', 422);
    }

    async create(body) {
        const payload = validateCargoFijo(this.organizationId, body);
        await this.checkProyecto(payload.proyecto_id, payload);
        return CargoFijoService.ensureCargo(await this.api.request('post', '/cargos-fijos', { data: payload, stage: 'create_cargo_fijo' }));
    }

    async get(id) {
        this.checkId(id);
        const data = await this.api.request('get', '/cargos-fijos/' + id, { stage: 'get_cargo_fijo' });
        if (!data || !Number.isInteger(data.id)) throw new CargoFijoError('El servicio de Aptus devolvió un cargo con formato inesperado.', 502);
        return data;
    }

    async update(id, body) {
        this.checkId(id);
        const payload = validateCargoFijo(this.organizationId, body, { update: true });
        return CargoFijoService.ensureCargo(await this.api.request('patch', '/cargos-fijos/' + id, { data: payload, stage: 'update_cargo_fijo' }));
    }

    async remove(id) {
        this.checkId(id);
        return this.api.request('delete', '/cargos-fijos/' + id, { stage: 'delete_cargo_fijo' });
    }

    // Idempotente en la API: repetir el mismo mes no duplica (aparece en ya_existian).
    async generarIgualas(body) {
        const payload = validatePeriodo(this.organizationId, body);
        const data = await this.api.request('post', '/igualas/generar', { data: payload, stage: 'generar_igualas' });
        if (!data || !Array.isArray(data.creados) || !Array.isArray(data.ya_existian)) {
            const error = new CargoFijoError('El servicio de Aptus devolvió una respuesta inesperada al generar igualas.', 502);
            error.stage = 'response'; error.outcome_unknown = true;
            throw error;
        }
        return data;
    }
}
