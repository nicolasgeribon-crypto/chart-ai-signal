# Chart AI Signal V12 — MG1 selectiva

Basado en V9/V11. Mantiene intacta la lógica de señales V9 y añade una Martingala 1 selectiva.

En validación robusta, el filtro que decide cuándo permitir MG1 se elige únicamente con el 70% de desarrollo + confirmación. El 30% final queda fuera de muestra y no participa en esa selección. Compara condiciones de EMA, momentum, fuerza y RSI.

Muestra MG1 usadas/omitidas, ciclos ganados/perdidos, acierto de ciclos y neto teórico con pago 1:1. Es una simulación histórica educativa; no garantiza resultados futuros ni ejecuta operaciones.

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
