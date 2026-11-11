import test from 'node:test';
import assert from 'node:assert/strict';
import CargoFijoService, { validateCargoFijo, validatePeriodo } from '../services/CargoFijoService.js';

const input = { proyecto_id: 24, fecha: '2026-11-11', concepto: 'Anticipo 50%', monto: 22500 };
const PROYECTOS = {
    24: { id: 24, tipo_cobro: 'fijo', honorario_fijo: 45000 },
    25: { id: 25, tipo_cobro: 'iguala', honorario_fijo: 25000 },
    23: { id: 23, tipo_cobro: 'horas', honorario_fijo: null },
    30: { id: 30, tipo_cobro: 'fijo', honorario_fijo: null },
};

function fixture(response = { id: 10 }) {
    const calls = [];
    const api = {
        async request(method, path, opts) {
            calls.push({ method, path, opts });
            if (method === 'get' && path.startsWith('/proyectos/')) return PROYECTOS[path.split('/')[2]];
            return response;
        },
    };
    return { service: new CargoFijoService('636939444', { api }), calls };
}
const writes = calls => calls.filter(c => c.method !== 'get');

test('valida antes de llamar a la API', async () => {
    for (const patch of [{ proyecto_id: '24' }, { proyecto_id: 0 }, { fecha: '2026-02-30' }, { monto: 0 }, { monto: 1.234 }, { monto: '100' }, { concepto: '   ' }, { concepto: 'x'.repeat(201) }, { concepto: 5 }]) {
        const { service, calls } = fixture();
        await assert.rejects(service.create({ ...input, ...patch }), e => e.status === 400, JSON.stringify(patch));
        assert.equal(calls.length, 0);
    }
    await assert.rejects(new CargoFijoService('abc', { api: {} }).create(input), e => e.status === 400);
    await assert.rejects(fixture().service.get('1; drop'), e => e.status === 400);
    await assert.rejects(fixture().service.remove('../prebills'), e => e.status === 400);
});

test('solo reenvía campos permitidos y recorta el concepto', async () => {
    const { service, calls } = fixture();
    await service.create({ ...input, concepto: '  Anticipo 50%  ', extra: 'x', moneda: 'USD', liberado: 1 });
    const [post] = writes(calls);
    assert.equal(post.method, 'post'); assert.equal(post.path, '/cargos-fijos');
    assert.deepEqual(post.opts.data, input);
});

test('alta mínima: solo el proyecto (la API pone monto, concepto y fecha)', async () => {
    const { service, calls } = fixture();
    await service.create({ proyecto_id: 25 });
    assert.deepEqual(writes(calls)[0].opts.data, { proyecto_id: 25 });
});

test('no se capturan cargos fijos en proyectos por hora ni sin monto si el proyecto no tiene honorario', async () => {
    let f = fixture();
    await assert.rejects(f.service.create({ ...input, proyecto_id: 23 }), e => e.status === 422 && /por hora/.test(e.message));
    assert.equal(writes(f.calls).length, 0);
    f = fixture();
    await assert.rejects(f.service.create({ proyecto_id: 30 }), e => e.status === 422 && /monto/.test(e.message));
    assert.equal(writes(f.calls).length, 0);
    f = fixture();
    await f.service.create({ proyecto_id: 30, monto: 1000 });
    assert.equal(writes(f.calls).length, 1);
});

test('editar: sin proyecto, al menos un campo', async () => {
    const { service, calls } = fixture();
    await service.update('10', { ...input, monto: 23000 });
    assert.equal(calls[0].method, 'patch'); assert.equal(calls[0].path, '/cargos-fijos/10');
    assert.deepEqual(calls[0].opts.data, { fecha: '2026-11-11', concepto: 'Anticipo 50%', monto: 23000 });
    assert.throws(() => validateCargoFijo('1', { proyecto_id: 24 }, { update: true }), /al menos/);
});

test('respuesta sin id se marca como incierta', async () => {
    const { service } = fixture({ ok: true });
    await assert.rejects(service.create(input), e => e.status === 502 && e.outcome_unknown === true);
});

test('igualas: periodo YYYY-MM obligatorio y respuesta validada', async () => {
    for (const periodo of [undefined, '2026-13', '2026-1', '202611', 'x']) assert.throws(() => validatePeriodo('1', { periodo }), /periodo/);
    let f = fixture({ periodo: '2026-11', creados: [25], ya_existian: [] });
    assert.deepEqual(await f.service.generarIgualas({ periodo: '2026-11', extra: 1 }), { periodo: '2026-11', creados: [25], ya_existian: [] });
    assert.deepEqual(f.calls[0], { method: 'post', path: '/igualas/generar', opts: { data: { periodo: '2026-11' }, stage: 'generar_igualas' } });
    f = fixture({ ok: true });
    await assert.rejects(f.service.generarIgualas({ periodo: '2026-11' }), e => e.status === 502 && e.outcome_unknown === true);
});
