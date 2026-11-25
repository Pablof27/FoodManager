# FoodManager — Planificador Semanal, Recetas por Lotes y Compra

Aplicación web SPA (React + TypeScript + Vite + Tailwind CSS) multiusuario con **autenticación Google OAuth y base de datos relacional en Supabase** (con *Row Level Security* por usuario), compatible también con **modo local sin cuenta** (`IndexedDB`, `localStorage` y `data/foodmanager-data.json` en desarrollo local).

## Funcionalidades principales

- **Cuentas de usuario y sincronización entre dispositivos (Supabase + Google)**:
  - Cada usuario tiene sus propias recetas, menú semanal, despensa y ajustes aislados mediante políticas RLS en PostgreSQL (`recipes`, `week_plans`, `pantry_items`, `user_settings`, `profiles`).
  - Sincronización diferencial + Realtime para acceder a la misma sesión desde el ordenador y el móvil, con caché offline automática por usuario.
  - Modo local sin cuenta disponible desde el primer momento; al iniciar sesión por primera vez, tus datos locales se suben automáticamente a tu nueva cuenta.
- **Recetario por lotes y raciones**: cada receta define cuántas raciones salen al cocinar 1 lote (`servingsYield`), ingredientes indispensables vs. opcionales, pasos y notas plegables (*tips* y *recordatorios*).
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
