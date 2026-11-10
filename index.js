"use strict";
// Función del proyecto Honorarios fijos (Catalyst). Esqueleto: por ahora solo lecturas.
// Todo pasa por ReportesSandbox (core/PrebillApiClient); esta función no escribe en Books.
// Pendiente (fase de captura): POST/PATCH/DELETE /cargos-fijos y POST /igualas/generar.
import express from 'express';
import dotenv from 'dotenv';
import { registerCatalogRoutes } from './core/catalogs.js';

dotenv.config();

const app = express();
app.use(express.json());

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
