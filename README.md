# Chart AI Signal v7

V7 mantiene el analizador visual, el historial DEMO y el Bot DEMO, y añade **validación temporal fuera de muestra**.

## Bot DEMO V7
- Importa CSV con `candle_time_utc, open, high, low, close`.
- Deduplica actualizaciones de la misma vela conservando la última fila.
- Duración seleccionable: 1 o 5 minutos.
- `Validación temporal`: divide cronológicamente el historial 70/30.
- El 70% inicial se usa para escoger, entre reglas predefinidas, un filtro con al menos 30 operaciones resueltas.
- El 30% final queda fuera del proceso de selección y se usa como prueba independiente.
- Muestra por separado acierto y cantidad de señales de entrenamiento y prueba.
- No usa la vela de resultado para decidir la entrada.
- No ejecuta operaciones ni se conecta a Binomo.

Los resultados históricos no garantizan resultados futuros. Una muestra corta puede producir porcentajes inestables.
