"use strict";
// Función del proyecto Honorarios fijos (Catalyst). La usan la captura y el calendario de
// honorarios fijos. Todo pasa por ReportesSandbox (core/PrebillApiClient); no escribe en Books.
import express from 'express';
import dotenv from 'dotenv';
import CargoFijoService from './services/CargoFijoService.js';
import { registerCatalogRoutes } from './core/catalogs.js';
import { sendError } from './core/http.js';

dotenv.config();

const app = express();
app.use(express.json());

const service = req => new CargoFijoService(req.params.organizationId, { req });

app.post('/:organizationId/cargos-fijos', async (req, res) => {
    try { return res.status(201).json(await service(req).create(req.body)); }
    catch (error) { return sendError(res, error, 'Error interno guardando el cargo.'); }
});
app.get('/:organizationId/cargos-fijos/:cargoId', async (req, res) => {
    try { return res.json(await service(req).get(req.params.cargoId)); }
    catch (error) { return sendError(res, error, 'Error interno consultando el cargo.'); }
});
app.patch('/:organizationId/cargos-fijos/:cargoId', async (req, res) => {
    try { return res.json(await service(req).update(req.params.cargoId, req.body)); }
    catch (error) { return sendError(res, error, 'Error interno actualizando el cargo.'); }
});
app.delete('/:organizationId/cargos-fijos/:cargoId', async (req, res) => {
    try { return res.json(await service(req).remove(req.params.cargoId)); }
    catch (error) { return sendError(res, error, 'Error interno eliminando el cargo.'); }
});
app.post('/:organizationId/igualas/generar', async (req, res) => {
    try { return res.json(await service(req).generarIgualas(req.body)); }
    catch (error) { return sendError(res, error, 'Error interno generando las igualas.'); }
});

// Lecturas permitidas (GET /:organizationId/<catalogo>) y los filtros que se reenvían a la API.
export const CATALOGS = {
    clientes: [],
    proyectos: [],
    abogados: [],
    'cargos-fijos': ['proyecto_id', 'liberado', 'facturado', 'prebill_id'],
};
registerCatalogRoutes(app, CATALOGS);

// Sin `stage` a propósito: un 404 con `stage` significa "el registro ya no existe".
app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada en fixed_fee_services.' }));

export default app;
