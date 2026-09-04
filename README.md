# Chart AI Signal V18

V18 mantiene el payout real configurable y mejora la selección de Martingala 1.

Cambios:
- usa el payout real dentro de la selección del filtro MG1;
- prueba reglas más selectivas de momentum, EMA, fuerza, cuerpo, rango y RSI seguro;
- penaliza drawdown, rachas de pérdidas y exceso de MG1;
- exige al menos 8 MG1 en desarrollo+confirmación para evitar elegir filtros con muestra demasiado pequeña;
- el 30% final permanece completamente fuera de muestra.

Objetivo: reducir MG1 malas y drawdown sin falsear el resultado final.

Simulación educativa; no garantiza resultados futuros ni ejecuta operaciones.
