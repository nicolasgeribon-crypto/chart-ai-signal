# Chart AI Signal V19

V19 continúa desde V18 y añade una capa experimental de filtro previo de entrada.

Objetivo:
- evitar algunas entradas iniciales débiles antes de necesitar MG1;
- conservar payout real;
- mantener la lógica MG1 selectiva;
- elegir filtros únicamente con desarrollo + confirmación;
- no usar el 30% final para seleccionar reglas.

Se agregan candidatos basados en EMA, momentum 3/5, fuerza y RSI seguro, con un mínimo de muestra para reducir sobreajuste.

Importante: es una simulación educativa. Un resultado histórico positivo no garantiza rendimiento futuro.
