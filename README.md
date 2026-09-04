# Chart AI Signal v6

V6 mantiene el analizador visual y el historial DEMO, y añade un modo **Bot DEMO** para backtesting local con CSV de velas.

## Bot DEMO
- Importa CSV con `candle_time_utc, open, high, low, close`.
- Deduplica actualizaciones de la misma vela conservando la última fila.
- Duración seleccionable: 1 o 5 minutos.
- Genera BUY/SELL con EMA9/EMA21, RSI, momentum y dirección de vela.
- Modo validado más selectivo, inspirado en los hallazgos exploratorios de los históricos V13/V14.
- Evalúa WIN/LOSS después de la señal. No usa la vela de resultado para decidir la entrada.
- No ejecuta operaciones ni se conecta a Binomo.

Los porcentajes de backtest son históricos y no garantizan resultados futuros.
