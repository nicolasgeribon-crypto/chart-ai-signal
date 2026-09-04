# Chart AI Signal V11 — Martingala 1

Basado en V9. Añade simulación MG1 al backtest: tras una LOSS, una sola entrada adicional en la misma dirección al vencimiento siguiente. Muestra ciclos ganados/perdidos, acierto MG1 y neto teórico con pago 1:1. No cambia la lógica de señales V9.

# Chart AI Signal V9

Misma app con análisis visual por IA, historial DEMO y Bot DEMO.

## V9
- Nuevo modo **Retroceso robusto** por defecto.
- Busca tendencia previa + retroceso de 1–3 velas + confirmación en la dirección principal.
- Incluye variante de retroceso hacia EMA9 y retroceso más profundo de 2+ velas.
- Mantiene validación temporal 55% desarrollo / 15% confirmación / 30% prueba final fuera de muestra.
- Optimizado para móvil: indicadores precalculados y pausas de interfaz para evitar congelar Android.
- El porcentaje mostrado es histórico; no garantiza resultados futuros y no ejecuta operaciones.
