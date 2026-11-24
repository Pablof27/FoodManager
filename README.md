# FoodManager — Planificador Semanal, Recetas por Lotes y Compra

Aplicación web SPA (React + TypeScript + Vite + Tailwind CSS) con persistencia automática en disco local (`data/foodmanager-data.json` vía servidor Vite) además de **IndexedDB** y `localStorage` en el navegador.

## Funcionalidades principales

- **Recetario por lotes y raciones**: cada receta define cuántas raciones salen al cocinar 1 lote (`servingsYield`), ingredientes categorizados, pasos y notas de batch cooking.
- **Planificador semanal flexible**:
  - Franjas del día configurables en un clic (*Desayuno, Almuerzo, Comida, Merienda, Cena*).
  - **Control de lotes y raciones**: reparte las raciones de un lote en distintos días de la semana, visualiza cuántas raciones quedan libres para aprovechar y multiplica lotes cuando quieras cocinar de más.
- **Lista de la compra inteligente + Despensa**:
  - Agrupa ingredientes equivalentes y unidades compatibles (`g`/`kg`, `ml`/`l`, unidades, etc.).
  - Descuenta automáticamente lo que ya tienes en tu **Despensa** (mostrando el desglose bruto vs. neto y qué queda 100 % cubierto).
  - Permite añadir productos manuales extra, copiar la lista formateada y **pasar los productos comprados directamente a tu despensa**.
- **Copia de seguridad**: exportación e importación completa en JSON desde **Ajustes**.

## Comandos

```bash
# Iniciar servidor de desarrollo
npm run dev

# Ejecutar tests unitarios
npm test

# Linter y build de producción
npm run lint
npm run build
```
